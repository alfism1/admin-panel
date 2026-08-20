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

> These two columns predate the counting and query-shape changes described in
> [What the counting rework changed](#what-the-counting-rework-changed). That section carries the
> current numbers; this table is kept because it is what motivated them.

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

## Three things that did not fix themselves

All three are now addressed; each subsection ends with what was done. The analysis is kept because
it is what the fix was designed against.

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

So there is no single query shape that wins both — **at the point the shape has to be chosen**. That
turned out to be the way out. `list()` already runs the count before the page query, so by the time
it builds the page query it knows the selectivity and can pick:

| term       | matches | plain shape | fenced shape |
| ---------- | ------: | ----------: | -----------: |
| `zeppelin` |      50 |     7,959ms |      **3ms** |
| `latency`  |   4.26M |     **1ms** |      4,874ms |

`fetchPage(fenced)` in `sqlAdapter.ts` takes the fenced path when the capped count came back exact
(few matches) and the plain one when it hit the cap (many). Fencing is by inner `limit` rather than
`offset 0`, which doubles as the proof that the bound is safe: it is only applied when the matches
are already known to fit inside it.

A `tsvector` column is still the better answer for a search-heavy table, and
`20260820090000_posts_search_vector` adds one. The adapter needs no configuration to use it:
introspection notices any `tsvector` column, hides it from output — it is an index, not data — and
switches the predicate to `@@ websearch_to_tsquery`, which is the parser that does not raise on
whatever a user types into a search box.

**That migration is not applied here**, because it is a semantic change, not just a faster one: a
`tsvector` matches _words_, so `zeppelin` still finds "Zeppelin" and stemming makes `running` find
"run", but the substring `eppeli` stops matching. Where substring search is the requirement, do not
run it. Where it is not, it also drops the eight trigram indexes and their ~1.5 GB.

### 3. Deep pagination and the unconditional `count(*)`

`list()` runs a `count(*)` on every request to build `last_page`. At 5M rows that is a ~75 ms floor
under every list view even when nothing is filtered, and ~200 ms when a filter matches millions.
`offset 2499975` costs a further ~700 ms, because Postgres must walk and discard every skipped row.

Both are inherent to offset pagination with an exact total — so the exact total went.

`list()` now counts in one of three ways, and says which in `meta.approximate`:

| Case                       | How it counts                     | Cost on 5M rows |
| -------------------------- | --------------------------------- | --------------- |
| unfiltered, > 50,000 rows  | `pg_class.reltuples` estimate     | O(1)            |
| filtered, ≤ 50,000 matches | exact, `count(*)` over the filter | proportional    |
| filtered, > 50,000 matches | stops at the cap, "at least N"    | bounded         |

The cap is what bounds the bad case: counting every match of a broad search term was a full scan
(5.5 s for a term matching 1M rows) to produce a number nobody reads past page one. 50,000 was
chosen by measurement — it keeps realistic filters exact (a 41,708-row two-column filter still
counts exactly, in 4 ms) while holding the worst observed search count to 379 ms, against 1,549 ms
at a 200,000 cap.

`LIST_ESTIMATE_COUNT_ABOVE=0` and `LIST_COUNT_CAP=0` restore exact counting everywhere.

Keyset pagination now exists alongside the offset path. `GET /:resource` returns `meta.next_cursor`
whenever a full page was handed out, and `?cursor=…` seeks from it instead of counting rows off:

| Deep page (offset 2,499,975) | Time    |
| ---------------------------- | ------- |
| `?page=100000`               | 74.1 ms |
| its `?cursor=…` successor    | 2.9 ms  |

The cursor carries the sort value and the primary key, and the query orders by both, so a
non-unique sort column cannot drop or duplicate a row across pages — verified over six pages of
`sort=status` with zero duplicates. An unparseable cursor is ignored rather than rejected: it is a
position hint, and the worst case of dropping it is starting from the top.

**The UI still pages by offset.** The cursor is for API consumers and for exports, where deep paging
is normal; wiring it into `SchemaTable` means giving up "page 7 of 400", which is a product
decision, not a performance one.

## What the counting rework changed

Same machine, same 5M rows, same `pnpm db:bench`:

| Case             | Before |      After | Note                              |
| ---------------- | -----: | ---------: | --------------------------------- |
| list page 1      |  80 ms | **1.5 ms** | the default landing page          |
| list page 500    |  78 ms | **1.4 ms** |                                   |
| list page 100000 | 145 ms |  **70 ms** | offset 2,499,975                  |
| filter status    | 181 ms | **8.2 ms** | count now capped                  |
| filter + sort    | 185 ms | **7.5 ms** |                                   |
| filter narrow    | 5.9 ms |     9.3 ms | slower, but still exact at 41,708 |
| search rare      | 7.99 s | **6.2 ms** | the fenced shape                  |
| search common    | 1.89 s |  **66 ms** | the capped count                  |
| date range       |  16 ms | **7.0 ms** |                                   |
| find by id       | 0.4 ms |     0.5 ms | unchanged                         |

End to end over HTTP, `GET /posts` at concurrency 50: **23 req/s → 1,107 req/s**, p95 **2,912 ms →
77 ms**. Throughput used to flatline past concurrency 4 because every request paid the same 81 ms
`count(*)`; nothing about the HTTP layer was ever the limit.

The knock-on effect is that one expensive query no longer takes the panel with it. Twelve
concurrent searches used to hold all ten pool connections for 22.6 s, and an unrelated
`GET /posts/1` behind them went from 3.4 ms to 1,647 ms. The same burst now drains in 0.05 s, and
the unrelated request sees 9 ms.

## Index cost

The migration adds 2.1 GB of index to a 2.6 GB table. 550 MB is the five btree indexes — cheap, and
responsible for every clear win in the table above. The remaining ~1.5 GB is the eight trigram
indexes, which buy only the search count. Applying `20260820090000_posts_search_vector` reclaims
that 1.5 GB, at the cost of the semantic change described in point 2.

## The client bundle, and why it is not being split

The initial payload is **282.3 kB gzipped over 8 requests**. Route-level code splitting is the
obvious lever, and it does not work here — this is measured, not assumed, so it does not have to be
re-litigated.

Splitting the routes moves almost nothing, because the chunking is not what decides the initial
payload — the eager import graph is. `src/App.tsx` needs `src/resources/index.ts` to build the route
table and the sidebar, those definitions import layout and custom components, and those reach the
form and Radix stacks. Three chunking strategies were measured against `React.lazy` routes:

| Strategy                       | Initial payload | Notes                                     |
| ------------------------------ | --------------- | ----------------------------------------- |
| per-family (shipped)           | 277.1 kB        | one `radix` chunk, one `forms` chunk      |
| `react` pinned, rest automatic | 261.7 kB        | but one 647 kB chunk — no caching story   |
| per-package                    | 280.4 kB        | 64 requests; gzip does worse on fragments |

Family chunks actively defeat splitting — the login page imports one Radix primitive and Rollup
hoists all fourteen — but per-package chunking is not better, and pinning `@tanstack` drags
`react-table` (list page only) into the entry.

The ceiling was then measured directly by stubbing the resources out entirely and lazy-loading every
page: **234.0 kB**. So the whole resource-manifest redesign — splitting `defineResource` into an
eager manifest and a lazily imported schema, across the registry, route generation, navigation and
the test suite — is worth **at most 48.3 kB, 17%**. What remains at that floor is what the login
screen itself pulls in:

```text
react   60.7 kB    vendor  63.7 kB    radix   28.6 kB  (button, input, layouts)
forms   25.2 kB    query   25.2 kB    app     20.7 kB  (login form: rhf + zod)
```

The cheaper lever, if this is ever worth revisiting, is the `forms` chunk: the login page is its only
eager consumer, and a login form is two fields and a submit button. Dropping `react-hook-form` and
`zod` from that one page lowers the floor itself, and touches one file outside `core`.
