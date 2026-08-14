import type { Knex } from 'knex';

/**
 * Indexes for the query shapes `createSqlAdapter` generates against `posts`.
 * Measured on a local PostgreSQL 15 with 5,000,024 rows (2.6 GB heap):
 *
 *   filter category+featured   337 ms →  5.6 ms
 *   date range on created_at   382 ms →   18 ms
 *   filter status + sort       752 ms →  204 ms
 *   unfiltered list page       281 ms →   92 ms
 *
 * Each index leads with the filtered column and carries the sort column, so the
 * planner gets both the predicate and the ordering from one scan instead of
 * sorting a multi-million row intermediate.
 */

const BTREE: Array<[name: string, columns: string]> = [
  // `where status = ? order by id desc` — the list page's most common filter.
  ['posts_status_id_idx', 'status, id desc'],
  // The same filter sorted by date, which the UI offers as a column header.
  ['posts_status_published_at_idx', 'status, published_at desc'],
  ['posts_created_at_idx', 'created_at'],
  // Knex declares the foreign key but not an index for it; the relation embed
  // and any author-scoped filter both need one.
  ['posts_author_id_idx', 'author_id'],
  ['posts_category_featured_id_idx', 'category, is_featured, id desc'],
];

/**
 * The adapter's search is `lower(cast(col as text)) like '%needle%'` OR'd over
 * every string column. A leading wildcard rules out btree, and a BitmapOr needs
 * *every* branch indexable or the whole predicate falls back to a seq scan — so
 * this is all-or-nothing across the eight searchable columns.
 *
 * It is not free: ~1.5 GB of index and ~3.5 min to build at 5M rows, and it
 * only fixes half the problem. The count goes from 3.6 s to 5.7 ms, but the
 * page query is untouched — `order by id desc limit 25` still makes the planner
 * walk the primary key hoping to fill 25 rows early, which on a needle-in-5M
 * search means reading most of the heap. See docs/performance.md; closing that
 * gap needs a query-shape change, not another index.
 *
 * Postgres only — trigram indexes have no portable equivalent, and the other
 * dialects simply keep the seq scan.
 */
const TRIGRAM = ['title', 'slug', 'excerpt', 'content', 'status', 'category', 'cover', 'notes'];

function isPostgres(knex: Knex): boolean {
  return (knex.client as { dialect?: string }).dialect === 'postgresql';
}

export async function up(knex: Knex): Promise<void> {
  for (const [name, columns] of BTREE) {
    await knex.raw(`create index if not exists ${name} on posts (${columns})`);
  }

  if (!isPostgres(knex)) return;

  await knex.raw('create extension if not exists pg_trgm');
  for (const column of TRIGRAM) {
    await knex.raw(
      `create index if not exists posts_${column}_trgm_idx
       on posts using gin (lower(${column}) gin_trgm_ops)`,
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  if (isPostgres(knex)) {
    for (const column of TRIGRAM) {
      await knex.raw(`drop index if exists posts_${column}_trgm_idx`);
    }
  }

  for (const [name] of BTREE) {
    await knex.raw(`drop index if exists ${name}`);
  }
}
