# Performance at 5M rows

Measured on a local PostgreSQL 15.3 (macOS, `shared_buffers` 128 MB, `work_mem` 4 MB) against
`posts` loaded with 5,000,024 rows — 2.6 GB heap. Every timing goes through `createSqlAdapter`, not
hand-written SQL, so what is measured is the request path the panel actually takes.

Reproduce with:

```bash
pnpm db:seed:bulk 5000000     # ~31 s
pnpm db:migrate               # builds the indexes, ~4.5 min
pnpm db:bench                 # add --explain for query plans
```

## Loading

`db:seed:bulk` drives a raw `pg` pool with N connections, each sending
`insert ... select * from unnest($1::int[], ...)` — one parse and one round trip per batch.

| Batch   | Workers | Rows/s      | Batch p50 |
| ------- | ------- | ----------- | --------- |
| 5,000   | 1       | 59,812      | 67 ms     |
| 5,000   | 4       | 106,670     | 142 ms    |
| 5,000   | 16      | 96,041      | 668 ms    |
| 1,000   | 4       | 167,111     | 19 ms     |
| **250** | **4**   | **178,319** | **5 ms**  |
| 20,000  | 4       | 56,826      | 1,380 ms  |

Two things worth knowing:

- **Bigger batches are slower.** The `pg` driver serialises each array parameter into a Postgres
  array _literal_, and that string-building cost grows faster than the round trips it saves. The
  knee is around 250–1,000 rows.
- **Concurrency stops helping at 4.** Past that, throughput is flat and batch latency grows
  linearly — the bottleneck has moved to the single Node thread generating and serialising rows,
  not to Postgres. The full 5M load ran at 163,916 rows/s in 31 s.

The loader sets `synchronous_commit = off` on its own connections only. That is a benchmark-data
decision, not a recommendation for application writes.

## Query timings

`before` is the schema as migrated (primary key only). `after` is with
`20260814120000_posts_performance_indexes` applied and the search cast fixed.

| Case                     | Before  | After      | What it is                              |
| ------------------------ | ------- | ---------- | --------------------------------------- |
| find by id               | 0.3 ms  | **0.3 ms** | edit page — already optimal             |
| filter category+featured | 337 ms  | **5.8 ms** | selective two-column filter             |
| date range               | 382 ms  | **14 ms**  | `created_at` within 30 days             |
| list page 1              | 281 ms  | **77 ms**  | the default landing page                |
| count only               | 277 ms  | **75 ms**  | the `count(*)` every list page pays     |
| filter status + sort     | 752 ms  | **198 ms** | `status='published'` newest first       |
| dashboard stats          | 652 ms  | **250 ms** | two counts on every dashboard load      |
| list page 100000         | 805 ms  | 697 ms     | offset 2,499,975 — still bad, see below |
| search common            | 10.03 s | 5.47 s     | matches 4.2M rows                       |
| search rare              | 48.62 s | 18.30 s    | matches 50 rows — still bad, see below  |

## Three things that do not fix themselves

### 1. The `char(255)` cast in the search predicate (fixed)

`applyFilters` used to build `lower(cast(col as char(255))) like ?`. On PostgreSQL that
blank-pads every value to 255 characters before lowering it, and it was **5.4× the entire cost of
the scan** — 19.6 s versus 3.6 s for the same eight-column predicate.

It was also a correctness bug: `char(255)` _truncates_, so a match past character 255 of a `text`
column was silently invisible. `content` averages 262 characters here, so real matches were being
dropped.

The cast cannot simply be deleted — `searchable` includes `kind === 'string'`, which covers `uuid`,
and `lower(uuid)` is an error in Postgres. It is now an _unbounded_ text cast, per dialect
(`text` / `char` / `varchar(max)`). That is free: 3.8 s versus 3.6 s uncast.

### 2. Search still costs seconds, and indexes only fix half of it

The trigram indexes take the search **count** from 3.6 s to 5.7 ms. The **page** query is
unaffected, because `order by id desc limit 25` makes the planner walk the primary key backwards
hoping to fill 25 rows early. With 50 matches in 5M rows it reads most of the heap instead:

```
Limit  (actual time=11608.931..11610.998 rows=25)
  ->  Parallel Index Scan Backward using posts_pkey  (actual rows=17 loops=3)
        Rows Removed by Filter: 1666551
```

Wrapping the filter in an optimisation fence (`select ... from (select ... offset 0) t order by id
desc limit 25`) forces the bitmap path and takes it to **68 ms** — but it also forces every match to
be materialised before sorting, which makes the _unselective_ search worse: 5.2 s instead of
sub-second for a term matching 4.2M rows.

So there is no single query shape that wins both, and this is left as a deliberate open decision.
The real fix is to stop `LIKE '%…%'`-ing eight columns: a `tsvector` column with a GIN index and
relevance ordering, or restricting `searchable` to the columns a user would actually search.

### 3. Deep pagination and the unconditional `count(*)`

`list()` runs a `count(*)` on every request to build `last_page`. At 5M rows that is a ~75 ms floor
under every list view even when nothing is filtered, and ~200 ms when a filter matches millions.
`offset 2499975` costs a further ~700 ms, because Postgres must walk and discard every skipped row.

Both are inherent to offset pagination with an exact total. If this table were real, the options are
keyset pagination (`where id < :last_seen`) instead of `offset`, and an estimated count from
`pg_class.reltuples` when no filter is applied.

## Index cost

The migration adds 2.1 GB of index to a 2.6 GB table. 550 MB is the five btree indexes — cheap, and
responsible for every clear win in the table above. The remaining ~1.5 GB is the eight trigram
indexes, which buy only the search count. If search is reworked per point 2, most of that 1.5 GB
should go away with it.
