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
| Production build    | `pnpm build`                  |
| Scaffold a resource | `pnpm gen:resource <Name>`    |
| Inspect the DB      | `pnpm db:introspect`          |
| Seed demo data      | `pnpm db:seed`                |

**Before reporting any change complete, run `pnpm typecheck` and `pnpm lint`.** There is no test
suite; the type checker is the safety net, so a clean `tsc -b` is the bar. Run `pnpm format` if you
touched `src/`, `server/`, `scripts/` or `docs/`.

## Repository layout

```text
src/
├── core/           ← the framework layer — treat as closed, see below
│   ├── forms/      Field builders, layouts, Zod compiler, SchemaForm renderer
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

server/             Optional Node API: routes, auth, DB adapters, introspection
docs/               Architecture, API reference, database guide, recipes
scripts/            gen-resource.mjs scaffolder
```

## The one rule that matters

**`src/core/` is a closed framework layer. Do not edit it to add application behaviour.**

Every customisation has a designed extension point outside `core`:

| You want to…             | Do this instead of editing core                       |
| ------------------------ | ----------------------------------------------------- |
| A new field type         | Subclass `Field` in `src/resources/fields/`           |
| A custom control or cell | React component in `src/resources/components/`        |
| A one-off control        | `.customComponent()` on an existing field             |
| A new column type        | Subclass `Column`, or `.cell()` for a custom renderer |
| Change data fetching     | Implement `DataProvider`, call `setDataProvider()`    |
| Support another database | Implement `DatabaseAdapter` in `server/db/`           |
| A custom page            | `src/pages/` + `registerNavigationItems()`            |

See [`docs/recipes.md`](docs/recipes.md) for worked examples of each. If a task seems to require a
`core` change, say so explicitly and explain why the extension points do not cover it — do not
silently patch the framework.

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
The server is the sole authority. When adding an endpoint in `server/routes.ts`, call
`requireAuth()` — the API applies authentication, not per-table authorization, so do not assume a
route is protected because the UI hides it.

## Documentation

- [`README.md`](README.md) — features and quick start
- [`docs/architecture.md`](docs/architecture.md) — the three contracts and which seam to touch
- [`docs/api-reference.md`](docs/api-reference.md) — every field, column, filter and action method
- [`docs/database.md`](docs/database.md) — connecting a real database
- [`docs/recipes.md`](docs/recipes.md) — custom fields, columns, providers, pages
