# AGENTS.md

Instructions for coding agents working in this repository.

## What this project is

A Filament-style admin panel for React. You describe a resource declaratively — fields, table
columns, filters, actions — and the framework generates the list, create, edit and view pages,
routes, sidebar entry, breadcrumbs, validation and permission gates.

React 19 · TypeScript (strict) · Vite · Tailwind v4 · TanStack Query & Table · Zod · react-hook-form
· Zustand. Optional Node API in `server/` for real databases.

## Setup and commands

Package manager is **pnpm** (`pnpm@8.7.4`). Never use npm or yarn here.

```bash
pnpm install
cp .env.example .env

pnpm dev          # web only, on :5173 — works with VITE_USE_MOCK=true, no backend needed
pnpm dev:full     # web on :5173 + API on :4000 (needs DATABASE_URL)
pnpm dev:api      # API only, watch mode
```

| Task                | Command                       |
| ------------------- | ----------------------------- |
| Typecheck           | `pnpm typecheck`              |
| Lint                | `pnpm lint` / `pnpm lint:fix` |
| Format              | `pnpm format`                 |
| Test                | `pnpm test`                   |
| Test (watch)        | `pnpm test:watch`             |
| Test with coverage  | `pnpm test:coverage`          |
| Production build    | `pnpm build`                  |
| Scaffold a resource | `pnpm gen:resource <Name>`    |
| Inspect the DB      | `pnpm db:introspect`          |
| Seed demo data      | `pnpm db:seed`                |
| Seed N bulk rows    | `pnpm db:seed:bulk <rows>`    |
| Benchmark queries   | `pnpm db:bench`               |
| Run migrations      | `pnpm db:migrate`             |
| New migration       | `pnpm db:migrate:make <name>` |
| Migration status    | `pnpm db:migrate:status`      |

**Before reporting any change complete, run `pnpm typecheck`, `pnpm lint` and `pnpm test`.** Run
`pnpm format` if you touched `src/`, `server/`, `tests/`, `scripts/` or `docs/`. CI runs exactly
these four plus `pnpm build` on every pull request into `master` — see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Tests

Vitest + Testing Library. Tests live in `tests/`, mirroring `src/`, so that `src/core/` stays a
closed layer with no test files inside it. `tsconfig.test.json` puts them in the `tsc -b` graph, so a
broken test is also a typecheck failure.

`vitest.config.ts` declares **two projects**, because the two halves need different runtimes:

| Project  | Environment | Files                    |
| -------- | ----------- | ------------------------ |
| `web`    | jsdom       | everything but the below |
| `server` | node        | `tests/server/**`        |

`pnpm test` runs both; `pnpm vitest run --project server` is the fast loop while working on `server/`
— about a second and a half, against 25-odd for jsdom setup. Coverage thresholds still apply to
`src/` only, so `server/` is covered by tests but not by a ratchet.

```text
tests/
├── setup.ts        jsdom polyfills Radix and react-day-picker need (web project only)
├── helpers/        renderWithProviders (router + query + auth), makeFieldContext,
│                   makeDataProvider (every method a spy)
├── App.test.tsx    composition root: real AuthProvider, real route tree
├── core/           mirrors src/core/
├── layouts/ · pages/ · resources/ · lib/
└── server/         node environment; mirrors server/
    └── helpers/
        ├── env.ts     withServerEnv — stub process.env, then re-import the graph
        ├── router.ts  makeDb / makeAuth / dispatch, for driving routes without a listener
        ├── http.ts    makeRequest / makeResponse over node streams
        └── sqlite.ts  createFixture — a real in-memory database for the SQL adapter
```

The server side leans on two things worth knowing before adding to it:

- **`sqlAdapter` is tested against a real database**, not against generated SQL. `createFixture`
  stands up `better-sqlite3` in memory, creates `roles`/`users`/`posts` with real foreign keys, and
  hands back a live adapter. The guards that matter there — the column allow-list between a query
  string and `whereRaw`, the per-page clamp, the secret-column strip — only mean anything if the
  query runs.
- **`routes.test.ts` counts the route table.** `registeredRouteCount` reaches past `private` so that
  adding an endpoint without adding a probe fails the suite. That is the prompt to decide whether
  the new route needs `gate`; do not just bump the number.

What to reach for:

- **Builders** (fields, columns, filters, actions) — assert on `.definition` and on the resolver
  methods (`isVisible`, `isRequired`, `resolveLabel`). No rendering needed.
- **Components** — `renderWithProviders` from `tests/helpers/render.tsx`; pass `user: null` for an
  anonymous visitor, `permissions: [...]` to test a gate, `auth: { login }` to stub one method.
- **Resolver context** — `makeFieldContext({ values, operation, permissions })` builds a
  `FieldContext` without standing up a form.
- **Anything that fetches** — `makeDataProvider()` from `tests/helpers/dataProvider.ts` plus
  `setDataProvider(...)`; restore `restDataProvider` in `afterEach`.
- **Controls** are driven through a real `SchemaForm` rather than mounted bare, so the React Hook
  Form wiring is exercised, not just the markup.

Traps worth knowing before you write a new test:

- Tests named `KNOWN BUG` / `KNOWN LIMITATION` pin behaviour that is wrong but currently shipped,
  with the fix written in the comment above them. Fixing the source means flipping the assertion in
  the same commit — that is the point. Six are open, all in `server/`:

  | Where              | What                                                                         |
  | ------------------ | ---------------------------------------------------------------------------- |
  | `naming.ts`        | `pluralize` is not idempotent; its own `s$` guard is unreachable dead code   |
  | `naming.ts`        | `singularize` mangles a singular table ending in `s` (`status` → `statu`)    |
  | `db/sqlAdapter.ts` | an embed key is omitted entirely when no row in the batch has the relation   |
  | `auth.ts`          | the user cache stores results, not promises, so a cold burst still stampedes |
  | `env.ts`           | `flag()` reads `RATE_LIMIT_ENABLED=1` as _off_, silently                     |
  | `permissions.ts`   | client and server disagree on the empty permission — deliberate, documented  |

- Coverage is at 100% on every metric and `vitest.config.ts` enforces it. Code a test genuinely
  cannot reach carries `/* v8 ignore next */` with the reason on the line above; reach for that only
  after establishing that no public API can drive the branch.
- `jsdom` sanitises an unparseable `<input type="date|time">` value to `''`, so the date control's
  own guards are unreachable through `fireEvent.change`. Use `fireRawChange` from
  `tests/helpers/events.ts`, which fakes what the change event reports for one dispatch.
- Module-scope reads of `import.meta.env` (`API_URL`, `USE_MOCK`, `APP_NAME`) only change with
  `vi.resetModules()` plus `vi.stubEnv`. Re-import `tests/helpers/render` in the same breath, or the
  component under test will consume a different `AuthContext` than the wrapper provides.
- Anything rendering a redirect (`<Navigate>`, `<ProtectedRoute>`) needs real `<Routes>` around it.
  Rendered bare, `<Navigate>` re-mounts on every location change and spins forever.
- `restoreMocks: true` is on globally, so a module-scope `vi.spyOn` is dead after the first test.
  Create spies inside `beforeEach`.
- `beforeEach(() => someMock.mockResolvedValue(x))` returns the mock, which Vitest then calls as a
  teardown function — firing a stray request. Always use a block body.
- `SchemaTable` renders the desktop table _and_ the mobile card list; jsdom applies no CSS, so
  scope row assertions with `within(screen.getByRole('table'))`.
- While a Radix dialog or menu is open the rest of the page is `aria-hidden`, so role queries will
  not see it. Close the overlay first, or query inside it.
- A required field's label reads `Name*`, so `getByLabelText('Name')` misses it — use
  `getByRole('textbox', { name: 'Name' })`, which respects the `aria-hidden` asterisk.

And in `tests/server/` specifically:

- `server/env.ts` reads `process.env` once at module load, and `dotenv` fills the rest from whatever
  `.env` the machine has. A test that cares about a variable must set it _and_ re-import through
  `withServerEnv`, including the variables it wants absent — pass `''` for "unset". Otherwise a line
  in someone's local `.env` decides the assertion.
- `withServerEnv` goes through `vi.resetModules()`, so the module it hands back carries a **different
  `HttpError` class object** than a static import. Assert `rejects.toMatchObject({ status: 404 })`,
  never `toBeInstanceOf`.
- `granted` in `server/permissions.ts` and `createPermissionChecker` in `src/core/auth/can.ts` are
  separate implementations of the same rules. `tests/server/permissions.test.ts` runs a shared table
  through both; extend that table rather than testing either alone.

## Repository layout

```text
src/
├── core/           ← the framework layer — treat as closed, see below
│   ├── forms/      Field builders (incl. Repeater), layouts, Zod compiler, SchemaForm
│   ├── tables/     Column & filter builders, SchemaTable renderer, URL state
│   ├── actions/    Action builders, modal/confirmation runner
│   ├── resources/  defineResource, registry, route generation, CRUD pages
│   ├── auth/       Auth store, provider, permission checker, route guard
│   ├── data/       Axios client, DataProvider contract, REST impl, mock backend
│   ├── navigation/ Sidebar built from the resource registry
│   └── ui/         shadcn-style primitives
├── resources/      ← application code: one file per entity
├── pages/          Non-resource pages (Dashboard, Login, 403, 404)
├── layouts/        App shell, sidebar, auth layout
└── lib/            Shared helpers (cn, debounce, path get/set, labelize)

tests/              Vitest suite, mirroring src/ — see "Tests" above
server/             Optional Node API: routes, auth, DB adapters, introspection
└── migrations/     Timestamped schema migrations, applied by `pnpm db:migrate`
docs/               Architecture, API reference, database guide, recipes
scripts/            gen-resource.mjs scaffolder
```

## The one rule that matters

**`src/core/` is a closed framework layer. Do not edit it to add application behaviour.**

Every customisation has a designed extension point outside `core`:

| You want to…                    | Do this instead of editing core                       |
| ------------------------------- | ----------------------------------------------------- |
| A field type **this app** needs | Subclass `Field` in `src/resources/fields/`           |
| A custom control or cell        | React component in `src/resources/components/`        |
| A one-off control               | `.customComponent()` on an existing field             |
| A new column type               | Subclass `Column`, or `.cell()` for a custom renderer |
| Change data fetching            | Implement `DataProvider`, call `setDataProvider()`    |
| Support another database        | Implement `DatabaseAdapter` in `server/db/`           |
| Change the DB schema            | Add a migration in `server/migrations/`               |
| A custom page                   | `src/pages/` + `registerNavigationItems()`            |

See [`docs/recipes.md`](docs/recipes.md) for worked examples of each. If a task seems to require a
`core` change, say so explicitly and explain why the extension points do not cover it — do not
silently patch the framework.

**"Closed" is about layering, not size.** The test is whether the thing knows about this app's
domain. A colour picker for one resource belongs in `src/resources/fields/`; a field type any admin
panel would want — `Repeater` is the worked example — belongs in `src/core/forms/fields/` beside
`TextInput` and `FileUpload`. Building a generic primitive _outside_ core is possible, but it pays a
tax: no access to `SchemaComponent.mutate`, no reuse of `compileFieldValidator`, and no way to teach
`FieldSlot` anything. If you find yourself reimplementing core internals from `src/resources/`, the
code is in the wrong layer — say so rather than duplicating them.

## Adding a resource

The common task. Scaffold, then edit:

```bash
pnpm gen:resource Product     # writes src/resources/ProductResource.tsx and registers it
```

`src/resources/index.ts` is the single place a resource is registered. A resource is one
`defineResource({...})` call declaring `fields`, `columns`, `filters` and `actions`; builders are
immutable, so every method returns a new instance and must be chained, never mutated in place.

## The three contracts

Data crosses three independent seams — `DataProvider` (client) → REST wire → `DatabaseAdapter`
(server). They are deliberately **not** the same interface, and names differ at each hop
(`getList`/`list`, `create`/`insert`, `delete`/`remove`).

Read [`docs/architecture.md`](docs/architecture.md) before changing anything that moves data across
a boundary. It documents which seam to touch and the four shape rewrites (sort, list result, id,
filters) that happen between them.

## Conventions

- **Imports** use the `@/` alias for `src/` (`@/core/forms/fields/TextInput`). Relative imports only
  within the same directory.
- **Formatting** is Prettier-enforced: single quotes, semicolons, trailing commas, 100-column width,
  2-space indent, with `prettier-plugin-tailwindcss` sorting class names. Do not hand-format.
- **TypeScript is strict**, including `exactOptionalPropertyTypes` and `noUnusedLocals`. Avoid
  `any`; prefer generics or `unknown` with narrowing.
- **Naming**: `PascalCase.tsx` for components and resources, `camelCase.ts` for utilities and hooks,
  `SCREAMING_SNAKE_CASE` for module-level constants.
- **Comments** explain _why_, not _what_. The existing code is sparse in comments; match it.
- **Secrets** never go in `VITE_*` variables — those are compiled into the browser bundle. Anything
  sensitive belongs to `server/` and the root `.env`.

## Environment

`VITE_USE_MOCK=true` runs the whole panel against localStorage fixtures with no backend — prefer it
when your change does not involve the server. `VITE_API_URL` and `VITE_APP_NAME` are the other
client variables.

Server-only: `DATABASE_URL`, `API_PORT`, `API_ORIGIN`, `JWT_SECRET`, `JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL`, and the `AUTH_*` column-mapping variables. See
[`docs/database.md`](docs/database.md).

## Security notes

Client-side permission checks (`<Can>`, `.authorize()`) are **UX only, never a security boundary**.
The server is the sole authority.

Data routes in `server/routes.ts` go through `gate(ctx, resource, ability)`, which authenticates and
then checks `<singular>.<ability>` (`post.update`, `user.delete`) against the caller's permissions —
the same catalogue `permissionsFor` publishes and the same wildcard rules the client uses, but
implemented separately in `server/permissions.ts` because this side is the boundary. **A new data
endpoint must call `gate`, not `requireAuth`**; `requireAuth` alone proves only who the caller is,
which is what let any valid token reach any exposed table before.

Row-level ownership is opt-in through `OWNED_TABLES=posts:author_id` and lives in
`server/ownership.ts`. Where it is configured, a caller reaches only their own rows unless they hold
`<resource>.<action>.any` — the list is scoped by a filter merged last so a hand-written
`filter[author_id]` cannot widen it, writes cannot reassign the owner column, and a foreign row
answers **404 rather than 403** so the error itself does not confirm the row exists. Field-level
permissions are still not enforced.

Rate limits (`server/rateLimit.ts`) default to counters in process memory, so behind N replicas the
real budget is N times the configured one. `RateLimitStore` is the seam: implement it against Redis
(`INCR` + `PEXPIRE`) and pass it to `createRateLimiter` for one shared budget — no change to this
file and no Redis dependency for anyone who does not need it. Limits are on by default under
`NODE_ENV=production`.

## Documentation

- [`README.md`](README.md) — features and quick start
- [`docs/architecture.md`](docs/architecture.md) — the three contracts and which seam to touch
- [`docs/api-reference.md`](docs/api-reference.md) — every field, column, filter and action method
- [`docs/database.md`](docs/database.md) — connecting a real database
- [`docs/performance.md`](docs/performance.md) — measured behaviour at 5M rows, and what still hurts
- [`docs/recipes.md`](docs/recipes.md) — custom fields, columns, providers, pages

## Publishing the scaffolder

`packages/create-admin-panel/` publishes this repo as `npm create admin-panel@latest`. It is a
standalone package with its own `node_modules` — the root install does not reach it.

**This repo is the template.** `scripts/build-template.mjs` copies the tree into
`packages/create-admin-panel/template/` at pack time; the directory is git-ignored so the two cannot
drift. `pnpm build:template` rebuilds it, and CI runs it on every PR.

The split that matters:

- **Pack time** (`build-template.mjs`) — every rewrite that does _not_ depend on a user's answer.
  These use anchored string replacements that throw unless they match exactly once, so a change to
  `vitest.config.ts`, `src/main.tsx`, `server/db/index.ts` or the `format` script fails the build
  here rather than silently producing a broken scaffold on a stranger's machine.
- **Run time** (`src/template.js`) — only what varies by answer: project name, `.env`, driver
  pruning, which resources ship.

So: **if you edit one of those four files and CI fails on "build the scaffolder template", the fix
is to update the anchor in `build-template.mjs`** — not to loosen the check.

Two files import a database driver by name (`server/db/mongoAdapter.ts` → `mongodb`,
`server/cli/seed-bulk.ts` → `pg`). A generated project prunes every driver it did not choose, so
those files are removed too. Adding a third such import means teaching `applyDatabaseVariant` about
it, or the generated project will not typecheck.
