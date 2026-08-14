import { Pool, type PoolClient } from 'pg';
import { detectDialect } from '../db/connect';
import { env } from '../env';

/**
 * `pnpm db:seed:bulk [rows]` — load-test data for the `posts` table.
 *
 * Deliberately not knex: this is a throughput experiment, so it drives a raw
 * `pg` pool with N connections inserting in parallel. Each batch is a single
 * `insert ... select * from unnest($1::int[], ...)` — one parse, one plan, one
 * round trip per batch, which is the fastest shape you can get without COPY and
 * an extra dependency.
 *
 *   SEED_TOTAL=5000000 SEED_BATCH=1000 SEED_CONCURRENCY=4 pnpm db:seed:bulk
 *
 * The defaults below are measured optima, not guesses — see docs/performance.md.
 * Larger batches are *slower*, because the driver serialises every array
 * parameter into a Postgres array literal and that cost outgrows the round trips
 * it saves. Past four connections throughput is flat and only latency grows: the
 * bottleneck by then is the single Node thread building rows, not the database.
 */

const TOTAL = Number(process.env.SEED_TOTAL ?? process.argv[2] ?? 5_000_000);
const BATCH = Number(process.env.SEED_BATCH ?? 1_000);
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 4);

const COLUMNS = [
  'id',
  'title',
  'slug',
  'excerpt',
  'content',
  'status',
  'is_featured',
  'author_id',
  'category',
  'cover',
  'notes',
  'published_at',
  'views',
  'created_at',
  'updated_at',
] as const;

const TYPES =
  '$1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bool[], ' +
  '$8::int[], $9::text[], $10::text[], $11::text[], $12::timestamptz[], $13::int[], ' +
  '$14::timestamptz[], $15::timestamptz[]';

const INSERT = `insert into posts (${COLUMNS.join(', ')}) select * from unnest(${TYPES})`;

// ---------------------------------------------------------------- generation

/** Seeded PRNG so two runs of the same range produce byte-identical rows. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERBS = ['Designing', 'Shipping', 'Debugging', 'Rethinking', 'Scaling', 'Benchmarking'];
const NOUNS = ['pagination', 'indexes', 'forms', 'tables', 'caching', 'migrations', 'queries'];
const TAILS = ['without regrets', 'at scale', 'in production', 'the honest way', 'from scratch'];
const WORDS = [
  'resource',
  'schema',
  'builder',
  'column',
  'filter',
  'adapter',
  'provider',
  'registry',
  'throughput',
  'latency',
  'planner',
  'buffer',
];
const STATUSES = ['published', 'published', 'published', 'draft', 'draft', 'scheduled', 'archived'];
const CATEGORIES = ['engineering', 'product', 'design', 'growth', 'ops', 'research'];

/** A token planted in ~1 row per 100k, to time a genuinely selective LIKE. */
const RARE = 'zeppelin';

const AUTHOR_MIN = 1;
const AUTHOR_MAX = 30;
const SPAN_DAYS = 1095; // three years of history

interface Batch {
  ids: number[];
  titles: string[];
  slugs: string[];
  excerpts: string[];
  contents: string[];
  statuses: string[];
  featured: boolean[];
  authors: number[];
  categories: string[];
  covers: (string | null)[];
  notes: string[];
  published: (Date | null)[];
  views: number[];
  created: Date[];
  updated: Date[];
}

function buildBatch(startId: number, count: number): Batch {
  const random = mulberry32(startId);
  const batch: Batch = {
    ids: new Array<number>(count),
    titles: new Array<string>(count),
    slugs: new Array<string>(count),
    excerpts: new Array<string>(count),
    contents: new Array<string>(count),
    statuses: new Array<string>(count),
    featured: new Array<boolean>(count),
    authors: new Array<number>(count),
    categories: new Array<string>(count),
    covers: new Array<string | null>(count),
    notes: new Array<string>(count),
    published: new Array<Date | null>(count),
    views: new Array<number>(count),
    created: new Array<Date>(count),
    updated: new Array<Date>(count),
  };

  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

  for (let index = 0; index < count; index += 1) {
    const id = startId + index;
    const status = pick(STATUSES);
    const ageDays = random() * SPAN_DAYS;
    const createdAt = new Date(Date.now() - ageDays * 86_400_000);

    let title = `${pick(VERBS)} ${pick(NOUNS)} ${pick(TAILS)}`;
    if (id % 100_000 === 0) title = `${title} — the ${RARE} edition`;

    const body: string[] = [];
    for (let word = 0; word < 22; word += 1) body.push(pick(WORDS));

    batch.ids[index] = id;
    batch.titles[index] = title;
    batch.slugs[index] = `${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)}-${id}`;
    batch.excerpts[index] = `${body.slice(0, 10).join(' ')}.`;
    batch.contents[index] = `${body.join(' ')}. ${body.slice(4, 14).join(' ')}.`;
    batch.statuses[index] = status;
    batch.featured[index] = random() < 0.05;
    batch.authors[index] = AUTHOR_MIN + Math.floor(random() * (AUTHOR_MAX - AUTHOR_MIN + 1));
    batch.categories[index] = pick(CATEGORIES);
    batch.covers[index] = random() < 0.7 ? `https://cdn.example.com/covers/${id % 5000}.jpg` : null;
    batch.notes[index] = random() < 0.2 ? `internal note ${id}` : '';
    batch.published[index] =
      status === 'published' ? new Date(createdAt.getTime() + 3_600_000) : null;
    batch.views[index] = Math.floor(random() * random() * 50_000);
    batch.created[index] = createdAt;
    batch.updated[index] = new Date(createdAt.getTime() + random() * 30 * 86_400_000);
  }

  return batch;
}

// ------------------------------------------------------------------- loading

interface Progress {
  rows: number;
  batches: number;
  latencies: number[];
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function humanize(seconds: number): string {
  const whole = Math.round(seconds);
  return whole < 60
    ? `${whole}s`
    : `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
}

async function worker(pool: Pool, queue: number[], startId: number, progress: Progress) {
  const client: PoolClient = await pool.connect();

  // Session-local: durability of throwaway benchmark rows is not worth the fsync
  // per commit. Nothing outside this connection is affected.
  await client.query('set synchronous_commit = off');

  try {
    for (;;) {
      const offset = queue.pop();
      if (offset === undefined) return;

      const count = Math.min(BATCH, TOTAL - offset);
      const batch = buildBatch(startId + offset, count);

      const began = performance.now();
      await client.query(INSERT, [
        batch.ids,
        batch.titles,
        batch.slugs,
        batch.excerpts,
        batch.contents,
        batch.statuses,
        batch.featured,
        batch.authors,
        batch.categories,
        batch.covers,
        batch.notes,
        batch.published,
        batch.views,
        batch.created,
        batch.updated,
      ]);

      progress.latencies.push(performance.now() - began);
      progress.rows += count;
      progress.batches += 1;
    }
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (detectDialect(env.databaseUrl) !== 'postgres') {
    throw new Error('seed:bulk is PostgreSQL-only.');
  }

  const pool = new Pool({ connectionString: env.databaseUrl, max: CONCURRENCY });
  const startedAt = performance.now();

  try {
    const { rows: before } = await pool.query<{ max: string | null }>(
      'select max(id)::text as max from posts',
    );
    const startId = Number(before[0].max ?? 0) + 1;

    console.log(`\n  bulk seeding posts`);
    console.log(
      `  ├ rows        ${TOTAL.toLocaleString()} (ids ${startId}…${startId + TOTAL - 1})`,
    );
    console.log(`  ├ batch size  ${BATCH.toLocaleString()}`);
    console.log(`  └ workers     ${CONCURRENCY}\n`);

    // Descending so workers can pop() off the tail in O(1).
    const queue: number[] = [];
    for (let offset = 0; offset < TOTAL; offset += BATCH) queue.push(offset);
    queue.reverse();

    const progress: Progress = { rows: 0, batches: 0, latencies: [] };
    let lastRows = 0;
    let lastAt = startedAt;

    const ticker = setInterval(() => {
      const now = performance.now();
      const instant = ((progress.rows - lastRows) / (now - lastAt)) * 1000;
      const overall = (progress.rows / (now - startedAt)) * 1000;
      const remaining = overall > 0 ? (TOTAL - progress.rows) / overall : 0;
      const percent = ((progress.rows / TOTAL) * 100).toFixed(1);

      console.log(
        `  ${percent.padStart(5)}%  ${progress.rows.toLocaleString().padStart(11)} rows  ` +
          `${Math.round(instant).toLocaleString().padStart(7)}/s now  ` +
          `${Math.round(overall).toLocaleString().padStart(7)}/s avg  ` +
          `eta ${humanize(remaining)}`,
      );

      lastRows = progress.rows;
      lastAt = now;
    }, 5_000);

    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => worker(pool, queue, startId, progress)),
    );
    clearInterval(ticker);

    // The sequence never advanced: ids were supplied explicitly.
    await pool.query("select setval('posts_id_seq', (select max(id) from posts))");

    const seconds = (performance.now() - startedAt) / 1000;
    const sorted = [...progress.latencies].sort((a, b) => a - b);

    const { rows: sizes } = await pool.query<{ total: string; table: string; count: string }>(
      `select pg_size_pretty(pg_total_relation_size('posts')) as total,
              pg_size_pretty(pg_relation_size('posts')) as table,
              (select count(*)::text from posts) as count`,
    );

    console.log(`\n  ✓ inserted ${progress.rows.toLocaleString()} rows in ${humanize(seconds)}`);
    console.log(`  ├ throughput   ${Math.round(progress.rows / seconds).toLocaleString()} rows/s`);
    console.log(`  ├ batches      ${progress.batches.toLocaleString()}`);
    console.log(
      `  ├ batch p50    ${percentile(sorted, 0.5).toFixed(0)} ms` +
        `   p95 ${percentile(sorted, 0.95).toFixed(0)} ms` +
        `   max ${(sorted[sorted.length - 1] ?? 0).toFixed(0)} ms`,
    );
    console.log(`  ├ posts rows   ${Number(sizes[0].count).toLocaleString()}`);
    console.log(`  └ size         ${sizes[0].table} heap, ${sizes[0].total} with indexes\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
