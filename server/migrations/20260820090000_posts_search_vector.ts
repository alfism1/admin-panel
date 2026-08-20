import type { Knex } from 'knex';

/**
 * Replaces the trigram search on `posts` with a generated `tsvector` column.
 *
 * The trigram indexes from `20260814120000_posts_performance_indexes` made the
 * search *count* fast and cost ~1.5 GB to do it. This does the same job in one
 * GIN index over a single column, and `createSqlAdapter` switches to it the
 * moment introspection sees a `tsvector` column — no configuration.
 *
 * What changes for the user: this matches *words*, not substrings. `zeppelin`
 * still finds "Zeppelin", but `eppeli` no longer does, and stemming means
 * `running` also finds "run". For an admin search box that is usually the
 * better behaviour; where substring matching is the requirement, do not run
 * this migration.
 *
 * Cost at 5M rows: several minutes to build the column and index, and the
 * column is stored, so the table grows. The trigram indexes are dropped in the
 * same transaction, which more than pays for it.
 *
 * Postgres only. Other dialects keep the `LIKE` chain, which is why `down()`
 * restores the trigram indexes rather than leaving the table unsearchable.
 */

const SOURCE_COLUMNS = ['title', 'slug', 'excerpt', 'content', 'category', 'notes'];

const TRIGRAM = ['title', 'slug', 'excerpt', 'content', 'status', 'category', 'cover', 'notes'];

function isPostgres(knex: Knex): boolean {
  return (knex.client as { dialect?: string }).dialect === 'postgresql';
}

/** `coalesce(title,'') || ' ' || …` — one weighted document per row. */
function document(): string {
  return SOURCE_COLUMNS.map((column) => `coalesce(${column}, '')`).join(` || ' ' || `);
}

export async function up(knex: Knex): Promise<void> {
  if (!isPostgres(knex)) return;

  // `stored` rather than a trigger: Postgres keeps it current on write, so
  // there is no path by which the index and the row can disagree.
  await knex.raw(`
    alter table posts
      add column if not exists search_vector tsvector
      generated always as (to_tsvector('english', ${document()})) stored
  `);

  await knex.raw(`
    create index if not exists posts_search_vector_idx
      on posts using gin (search_vector)
  `);

  // Only now that the replacement is in place.
  for (const column of TRIGRAM) {
    await knex.raw(`drop index if exists posts_${column}_trgm_idx`);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!isPostgres(knex)) return;

  await knex.raw('create extension if not exists pg_trgm');
  for (const column of TRIGRAM) {
    await knex.raw(
      `create index if not exists posts_${column}_trgm_idx
       on posts using gin (lower(${column}) gin_trgm_ops)`,
    );
  }

  await knex.raw('drop index if exists posts_search_vector_idx');
  await knex.raw('alter table posts drop column if exists search_vector');
}
