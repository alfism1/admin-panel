import { createKnex, detectDialect } from '../db/connect';
import { createSqlAdapter } from '../db/sqlAdapter';
import type { DatabaseAdapter, ListParams } from '../db/types';
import { env } from '../env';

/**
 * `pnpm db:bench` — times the queries the admin panel actually issues.
 *
 * Every case goes through `createSqlAdapter`, not hand-written SQL, so what is
 * measured is the real request path: the count query, the filtered page query,
 * the relation embed, the search predicate. Add `--explain` to print the
 * planner output for the slow ones instead of just the timings.
 */

const RESOURCE = process.env.BENCH_RESOURCE ?? 'posts';
const RUNS = Number(process.env.BENCH_RUNS ?? 5);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 1);
const EXPLAIN = process.argv.includes('--explain');

function listParams(overrides: Partial<ListParams> = {}): ListParams {
  return { page: 1, perPage: 25, filters: {}, ...overrides };
}

interface Case {
  name: string;
  note: string;
  run: (db: DatabaseAdapter) => Promise<unknown>;
  /** Raw SQL echoing the same shape, for `--explain`. */
  explain?: string;
}

const CASES: Case[] = [
  {
    name: 'list page 1',
    note: 'default landing: count(*) + order by id desc limit 25',
    run: (db) => db.list(RESOURCE, listParams()),
    explain: `select * from ${RESOURCE} order by id desc limit 25`,
  },
  {
    name: 'count only',
    note: 'the unfiltered count(*) the list page always pays for',
    run: (db) => db.count(RESOURCE),
    explain: `select count(*) from ${RESOURCE}`,
  },
  {
    name: 'list page 500',
    note: 'offset 12,475 — a plausible click-through depth',
    run: (db) => db.list(RESOURCE, listParams({ page: 500 })),
    explain: `select * from ${RESOURCE} order by id desc limit 25 offset 12475`,
  },
  {
    name: 'list page 100000',
    note: 'offset 2,499,975 — deep pagination',
    run: (db) => db.list(RESOURCE, listParams({ page: 100_000 })),
    explain: `select * from ${RESOURCE} order by id desc limit 25 offset 2499975`,
  },
  {
    name: 'filter status',
    note: 'filter[status]=published — ~43% of rows',
    run: (db) => db.list(RESOURCE, listParams({ filters: { status: 'published' } })),
    explain: `select * from ${RESOURCE} where status = 'published' order by id desc limit 25`,
  },
  {
    name: 'filter + sort',
    note: 'published, newest first — sort column has no index',
    run: (db) =>
      db.list(
        RESOURCE,
        listParams({
          filters: { status: 'published' },
          sort: { column: 'published_at', direction: 'desc' },
        }),
      ),
    explain: `select * from ${RESOURCE} where status = 'published' order by published_at desc limit 25`,
  },
  {
    name: 'filter narrow',
    note: 'featured + design — a selective two-column filter',
    run: (db) =>
      db.list(RESOURCE, listParams({ filters: { is_featured: 'true', category: 'design' } })),
    explain: `select * from ${RESOURCE} where is_featured = true and category = 'design' order by id desc limit 25`,
  },
  {
    name: 'search rare',
    note: 'search=zeppelin — 50 hits, but LIKE over 8 text columns',
    run: (db) => db.list(RESOURCE, listParams({ search: 'zeppelin' })),
    explain: `select * from ${RESOURCE} where lower(cast(title as char(255))) like '%zeppelin%' order by id desc limit 25`,
  },
  {
    name: 'search common',
    note: 'search=latency — matches a large share of rows',
    run: (db) => db.list(RESOURCE, listParams({ search: 'latency' })),
    explain: `select * from ${RESOURCE} where lower(cast(content as char(255))) like '%latency%' order by id desc limit 25`,
  },
  {
    name: 'date range',
    note: 'created_at within a 30-day window',
    run: (db) => {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 86_400_000);
      const iso = (date: Date) => date.toISOString().slice(0, 10);
      return db.list(RESOURCE, listParams({ filters: { created_at: `${iso(from)}..${iso(to)}` } }));
    },
  },
  {
    name: 'find by id',
    note: 'the edit page: single row by primary key + relation embed',
    run: (db) => db.find(RESOURCE, '2500000'),
  },
  {
    name: 'dashboard stats',
    note: 'two counts the dashboard runs on every load',
    run: async (db) => [
      await db.count(RESOURCE),
      await db.count(RESOURCE, { status: 'published' }),
    ],
  },
];

interface Timing {
  name: string;
  note: string;
  min: number;
  median: number;
  max: number;
  rows: number;
  total: number;
}

function isListResult(value: unknown): value is { rows: unknown[]; total: number } {
  return typeof value === 'object' && value !== null && 'rows' in value && 'total' in value;
}

async function time(db: DatabaseAdapter, testCase: Case): Promise<Timing> {
  for (let run = 0; run < WARMUP; run += 1) await testCase.run(db);

  const samples: number[] = [];
  let last: unknown;

  for (let run = 0; run < RUNS; run += 1) {
    const began = performance.now();
    last = await testCase.run(db);
    samples.push(performance.now() - began);
  }

  samples.sort((a, b) => a - b);

  return {
    name: testCase.name,
    note: testCase.note,
    min: samples[0],
    median: samples[Math.floor(samples.length / 2)],
    max: samples[samples.length - 1],
    rows: isListResult(last) ? last.rows.length : Array.isArray(last) ? last.length : 1,
    total: isListResult(last) ? last.total : 0,
  };
}

function format(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(1)} ms`;
}

async function main(): Promise<void> {
  const dialect = detectDialect(env.databaseUrl);
  if (dialect === 'mongodb') throw new Error('bench is SQL-only.');

  const knex = createKnex(env.databaseUrl, dialect);
  const db = await createSqlAdapter(knex, dialect);

  try {
    const total = await db.count(RESOURCE);
    const { rows: sizes } = (await knex.raw(
      `select pg_size_pretty(pg_total_relation_size(?)) as total,
              pg_size_pretty(pg_relation_size(?)) as heap,
              pg_size_pretty(pg_indexes_size(?)) as indexes`,
      [RESOURCE, RESOURCE, RESOURCE],
    )) as { rows: Array<{ total: string; heap: string; indexes: string }> };

    console.log(`\n  benchmarking "${RESOURCE}" — ${total.toLocaleString()} rows`);
    console.log(
      `  ${sizes[0].heap} heap · ${sizes[0].indexes} indexes · ${sizes[0].total} total · ` +
        `${RUNS} runs each after ${WARMUP} warmup\n`,
    );

    const header = `  ${'case'.padEnd(20)}${'median'.padStart(10)}${'min'.padStart(10)}${'max'.padStart(10)}   rows / total`;
    console.log(header);
    console.log(`  ${'─'.repeat(header.length)}`);

    const results: Timing[] = [];
    for (const testCase of CASES) {
      const result = await time(db, testCase);
      results.push(result);
      console.log(
        `  ${result.name.padEnd(20)}${format(result.median).padStart(10)}` +
          `${format(result.min).padStart(10)}${format(result.max).padStart(10)}` +
          `   ${result.rows}${result.total ? ` / ${result.total.toLocaleString()}` : ''}`,
      );
    }

    console.log('');
    for (const result of results) console.log(`  · ${result.name} — ${result.note}`);

    if (EXPLAIN) {
      console.log('\n  ── query plans ─────────────────────────────────────────\n');
      for (const testCase of CASES) {
        if (!testCase.explain) continue;
        const { rows } = (await knex.raw(`explain (analyze, buffers) ${testCase.explain}`)) as {
          rows: Array<Record<string, string>>;
        };
        console.log(`  ${testCase.name}:`);
        for (const row of rows) console.log(`    ${Object.values(row)[0]}`);
        console.log('');
      }
    }

    console.log('');
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
