# Architecture: the three contracts

Everything in this panel is swappable at one of three seams. Learn where they are and you can
replace the backend, the transport, or the database driver without touching anything else.

```text
  your resources          src/core            the wire            server/
 ┌────────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────────┐
 │ PostResource   │──►│ DataProvider │──►│ REST + JSON │──►│ DatabaseAdapter  │──► Postgres
 │ UserResource   │   │  7 methods   │   │   /api/*    │   │  12 methods      │    Mongo
 └────────────────┘   └──────────────┘   └─────────────┘   └──────────────────┘    SQLite …
                          seam 1              seam 2              seam 3
```

The three are **not** the same contract restated. Each solves a different problem, and the shape
changes at every boundary. That decoupling is the point: swapping one seam never forces a change at
another.

---

## Seam 1 — `DataProvider` (the frontend's only view of data)

[`src/core/data/types.ts`](../src/core/data/types.ts) · 7 methods

```ts
getList(resource, params)   getOne(resource, id)     create(resource, data)
update(resource, id, data)  delete(resource, id)     deleteMany(resource, ids)
getMany(resource, ids)
```

Nothing in `src/` — no page, no table, no form — talks to HTTP directly. It all goes through
whichever `DataProvider` is active. Swap it once at boot:

```ts
// src/main.tsx
import { setDataProvider } from './core/data/DataProvider';
setDataProvider(myGraphqlProvider);
```

Implement those 7 methods against GraphQL, tRPC, Firebase or anything else and the entire panel
works unchanged. See [`recipes.md`](recipes.md) for a worked GraphQL replacement.

## Seam 2 — the REST wire

[`server/routes.ts`](../server/routes.ts)

This is the contract the README means by _"two backends, one contract"_. Both the mock backend
(`VITE_USE_MOCK=true`, an Axios adapter over `localStorage`) and the real Node API implement the
same HTTP surface, which is why fixtures and production are interchangeable:

| Method          | Path                                                       |
| --------------- | ---------------------------------------------------------- |
| `GET`           | `/:resource` — list, paginated                             |
| `GET`           | `/:resource/:id` — one record                              |
| `POST`          | `/:resource` — create (201)                                |
| `PATCH` · `PUT` | `/:resource/:id` — update                                  |
| `DELETE`        | `/:resource/:id` — delete                                  |
| `POST`          | `/:resource/bulk-delete` — delete many                     |
| `GET`           | `/`, `/_schema`, `/permissions`, `/dashboard/stats`        |
| `POST` · `GET`  | `/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout` |

## Seam 3 — `DatabaseAdapter` (one interface per database engine)

[`server/db/types.ts`](../server/db/types.ts) · 12 methods + a `dialect` string

Routes never see SQL or BSON. Adding a database engine means implementing this interface and
nothing else — see [`sqlAdapter.ts`](../server/db/sqlAdapter.ts) (Knex) and
[`mongoAdapter.ts`](../server/db/mongoAdapter.ts) for the two that ship.

Six of its methods serve CRUD. The other six exist only on the server and never cross the wire:

| Server-only                       | Used by                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| `resources()`                     | `/`, `/_schema`, `/permissions`, `/dashboard/stats`, `pnpm db:introspect` |
| `schema()` · `has()` · `findBy()` | the auth layer — login by email, boot-time table checks                   |
| `count()`                         | `/dashboard/stats`                                                        |
| `close()`                         | graceful shutdown                                                         |

---

## How the CRUD calls line up

Worth reading once, because the names deliberately differ on each side:

| `DataProvider` | HTTP                              | `DatabaseAdapter`   |
| -------------- | --------------------------------- | ------------------- |
| `getList`      | `GET /:resource`                  | `list()`            |
| `getOne`       | `GET /:resource/:id`              | `find()`            |
| `create`       | `POST /:resource`                 | `insert()`          |
| `update`       | `PATCH` · `PUT /:resource/:id`    | `update()`          |
| `delete`       | `DELETE /:resource/:id`           | `remove()`          |
| `deleteMany`   | `POST /:resource/bulk-delete`     | `removeMany()`      |
| `getMany`      | `GET /:resource?filter[id]=1,2,3` | _(reuses `list()`)_ |

`getMany` has no adapter method of its own. It rides on `list()` through a comma-separated
`filter[id]`, which both adapters expand into `WHERE id IN (…)` / `$in`. This is why relationship
selects can hydrate many labels in one request.

## What gets rewritten at each boundary

If you write a provider or an adapter, these four are where bugs hide:

- **sort** — client `{ field, order }` → wire `sort=-created_at` → server `{ column, direction }`.
  The leading `-` is the descending marker.
- **list result** — server returns `{ rows, total }`; the route wraps it in snake_case
  `{ data, meta: { total, page, per_page, last_page } }`; the client reads it back as camelCase
  `{ data, meta: { …, perPage, lastPage } }`. `restDataProvider` also accepts Laravel's flat shape.
- **id** — `string | number` on the client, always `string` by the time it reaches an adapter.
- **filters** — `Record<string, unknown>` on the client → `filter[key]=value` on the wire →
  `Record<string, string>` on the server. Adapters parse `a,b` as a set and `from..to` as a range.

> **Known trade-off.** `removeMany()` returns the number of rows deleted and the route forwards it
> as `{ deleted }`, but `DataProvider.deleteMany` is typed `Promise<void>`, so the count is
> discarded. If you want _"3 records deleted"_ in a toast, the number is already on the wire —
> widen the client signature to surface it.

---

## Which seam do I touch?

| I want to…                                                    | Seam                                  |
| ------------------------------------------------------------- | ------------------------------------- |
| Use GraphQL / tRPC / Firebase instead of REST                 | 1 — write a `DataProvider`            |
| Point at an existing REST API with a different response shape | 1 — wrap `restDataProvider`           |
| Develop with no backend at all                                | 2 — `VITE_USE_MOCK=true`              |
| Add a custom endpoint                                         | 2 — add a route in `server/routes.ts` |
| Support another database engine                               | 3 — write a `DatabaseAdapter`         |
| Change how a table is discovered or exposed                   | 3 — `server/db/introspect.ts`         |

Nothing above requires editing `src/core`, which is a closed framework layer. Extensions live
outside it — see [`recipes.md`](recipes.md).
