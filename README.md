# Filament-style Admin Panel

A Vite + React 19 admin dashboard boilerplate with a **declarative, Filament-like developer
experience**: you describe a resource — its form, table, filters, actions and permissions — in one
file, and the framework generates the pages, routes, navigation, validation and state handling.

```bash
pnpm install
cp .env.example .env
pnpm dev            # http://localhost:5173 — runs against the built-in mock backend
```

Sign in with `admin@example.com` / `password` (also `editor@example.com` and `viewer@example.com`
for testing RBAC).

## Connecting a real database

Set one variable and every table becomes a working CRUD module — no per-table backend code:

```bash
# .env
DATABASE_URL=postgres://user:pass@localhost:5432/app   # or mysql:// sqlite: mssql:// mongodb://
VITE_USE_MOCK=false
```

```bash
pnpm dev:full       # browser app on :5173, API on :4000
```

The API introspects your schema at boot — tables, columns, primary keys, foreign keys — and serves
the REST contract the panel already speaks. No database installed? `DATABASE_URL=sqlite:./data/app.db`
then `pnpm db:seed` gives you a working panel in seconds.

> `DATABASE_URL` is read by the server only. Never put credentials in a `VITE_*` variable — those
> are compiled into the bundle every visitor downloads.

See [`docs/database.md`](docs/database.md) for supported databases, mapping the panel onto an
existing schema, and security notes.

---

## What you get for one file

`src/resources/UserResource.tsx` is ~180 lines because it exercises every feature. A realistic
module is 60–80 lines and produces all of this without touching `src/core/`:

| Generated         | Detail                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/users`          | List page: server-side pagination, sorting, global search, filters, column visibility, row selection, bulk actions, URL state sync, loading/empty/error states, responsive card view below `md` |
| `/users/create`   | Create page with validation compiled from the schema                                                                                                                                            |
| `/users/:id`      | Read-only view page                                                                                                                                                                             |
| `/users/:id/edit` | Edit page with unsaved-changes guard                                                                                                                                                            |
| Sidebar entry     | Grouped, sorted, hidden when the user lacks `viewAny`                                                                                                                                           |
| Breadcrumbs       | From resource metadata and the record title                                                                                                                                                     |
| Permission gates  | Navigation, route, action and field level                                                                                                                                                       |

---

## Adding a new module

```bash
pnpm gen:resource Product
```

That scaffolds `src/resources/ProductResource.tsx` and registers it. Or write it yourself — this is
the whole file:

```tsx
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Section } from '@/core/forms/layouts/Section';
import { defineResource } from '@/core/resources/Resource';
import { TextColumn } from '@/core/tables/columns/TextColumn';

export const ProductResource = defineResource({
  name: 'products',
  navigation: { label: 'Products', icon: 'package' },
  permissions: {
    viewAny: 'product.view',
    create: 'product.create',
    update: 'product.update',
    delete: 'product.delete',
  },

  form: [
    Section.make('Details')
      .columns(2)
      .schema([
        TextInput.make('name').required().maxLength(255),
        TextInput.make('sku').required().unique({ resource: 'products', ignoreRecord: true }),
      ]),
  ],

  table: {
    columns: [TextColumn.make('name').searchable().sortable(), TextColumn.make('sku').searchable()],
    actions: [EditAction.make(), DeleteAction.make()],
  },
});
```

Then add it to `src/resources/index.ts`:

```ts
export const resources = registerResources([
  UserResource,
  RoleResource,
  PostResource,
  ProductResource,
]);
```

**That is the only other file you touch.** If a new module ever requires editing something inside
`src/core/`, the abstraction has leaked and should be fixed there instead.

---

## Architecture

```text
src/
├── core/                    ← the framework layer; developers rarely open this
│   ├── forms/               Field builders, layouts, Zod compiler, SchemaForm renderer
│   ├── tables/              Column & filter builders, SchemaTable renderer, URL state
│   ├── actions/             Action builders, modal/confirmation runner
│   ├── resources/           defineResource, registry, route generation, CRUD pages
│   ├── auth/                Auth store, provider, permission checker, route guard
│   ├── data/                Axios client, data provider contract, REST impl, mock backend
│   ├── navigation/          Sidebar built from the resource registry
│   └── ui/                  shadcn-style primitives
├── resources/               ← you write here: one file per entity
├── pages/                   Non-resource pages (Dashboard, Login, 403, 404)
├── layouts/                 App shell and auth shell
└── lib/                     cn(), label conventions, path helpers

server/                      ← optional API; only needed to talk to a real database
├── index.ts                 node:http bootstrap
├── env.ts                   DATABASE_URL and auth column mapping
├── auth.ts                  JWT login/refresh against your users table
├── routes.ts                the REST contract the DataProvider speaks
├── db/
│   ├── connect.ts           URL scheme → driver
│   ├── introspect.ts        tables, columns, primary keys, foreign keys
│   ├── sqlAdapter.ts        PostgreSQL / MySQL / SQLite / SQL Server
│   └── mongoAdapter.ts      MongoDB
└── cli/                     db:introspect, db:seed
```

### How the form builder works

1. A schema is an array of `Field` and `Layout` builder instances. Every method clones its
   configuration, so a builder can be shared between resources without leaking.
2. `SchemaForm` flattens the schema, computes default values from `record` + `.default()` +
   `.formatStateUsing()`, and compiles the rules into a single Zod schema.
3. Conditional rules (`.required(ctx => …)`, `.visible(ctx => …)`) are evaluated inside Zod's
   `superRefine`, because they depend on values that only exist at validation time.
4. Each field renders inside a slot that **subscribes only to the paths its resolvers read**.
   Typing in one input re-renders that field, not the form.
5. On submit, `.dehydrateStateUsing()` runs, `dehydrated(false)` fields are dropped, and hidden or
   unauthorized fields never reach the payload.

### Resolvers

JavaScript has no reflection over parameter names, so instead of Filament's utility injection every
resolver receives one context object:

```ts
TextInput.make('city').visible((ctx) => ctx.get('country') === 'ID');
```

```ts
interface FieldContext {
  state: unknown; // this field's value
  get: <T>(path: string) => T; // another field's value — reactive
  set: (path: string, value: unknown) => void;
  record: Record<string, unknown> | null;
  operation: 'create' | 'edit' | 'view';
  user: AuthUser | null;
  can: (permission: string) => boolean;
}
```

`ctx.get()` is wired to React Hook Form's subscriptions, so resolvers are reactive without needing
`.live()`. `.live()` exists only to debounce `afterStateUpdated`.

---

## Data layer

Every table and page talks to a `DataProvider`:

```ts
interface DataProvider {
  getList<T>(resource: string, params: ListParams): Promise<ListResult<T>>;
  getOne<T>(resource: string, id: ID): Promise<T>;
  create<T>(resource: string, data: Partial<T>): Promise<T>;
  update<T>(resource: string, id: ID, data: Partial<T>): Promise<T>;
  delete(resource: string, id: ID): Promise<void>;
  deleteMany(resource: string, ids: ID[]): Promise<void>;
  getMany<T>(resource: string, ids: ID[]): Promise<T[]>;
}
```

The default `restDataProvider` maps to:

```http
GET    /{resource}?page=1&per_page=25&sort=-created_at&search=foo&filter[role_id]=3
GET    /{resource}/{id}
POST   /{resource}
PATCH  /{resource}/{id}
DELETE /{resource}/{id}
POST   /{resource}/bulk-delete
```

**Swapping it** — call `setDataProvider(yourProvider)` once in `src/main.tsx`, or set
`dataProvider` on a single resource to override it for that entity only.

**Error handling** — a Laravel-style `422 { errors: { field: [msg] } }` is mapped onto the form via
`setError`, so server messages appear under the field that caused them. Everything else becomes a
toast.

**Cache invalidation** — `queryKeys.list(resource, params)` and `queryKeys.detail(resource, id)`
keep invalidation precise; nothing calls a blanket `invalidateQueries()`.

### Two backends, one contract

`restDataProvider` is the only thing the panel talks to, and both backends implement the same
contract, so nothing in `src/` changes when you switch:

- `VITE_USE_MOCK=true` — fixtures in the browser, no server (see below).
- `VITE_USE_MOCK=false` + `DATABASE_URL` — the `server/` API against your real database.

### Mock backend

With `VITE_USE_MOCK=true`, an Axios adapter serves the whole REST contract from fixtures in
`localStorage` — including `/auth/*`, `/permissions`, `/uploads` and custom endpoints such as
`/users/:id/reset-password`. Because it is installed at the transport layer, resource code and the
REST provider run completely unchanged. Reset it from the browser console:

```js
localStorage.removeItem('admin.mock-db.v1');
location.reload();
```

---

## Auth & permissions

Permissions are dotted strings with wildcard support: `user.create`, `user.*`, `*`.

```ts
const { can, canAny, canAll, hasRole, user } = useAuth();

<Can permission="user.create"><Button>Create user</Button></Can>
<Can permission={['user.update', 'user.delete']} mode="any" fallback={<ReadOnlyBadge />}>…</Can>
<ProtectedRoute permission="user.view"><UserListPage /></ProtectedRoute>
```

Checks are memoized (set lookup plus precomputed wildcard prefixes), never a linear scan.

Enforcement happens at four points: **navigation** (menu item hidden), **route** (403 page, not a
redirect to login), **action** (button not rendered) and **field** (not rendered and not submitted).

> **These are UX layers, not a security boundary.** Anyone can edit the JavaScript in their browser.
> The backend remains the only authority on what a user may read or write.

### Token handling

- The access token is kept **in memory** (Zustand), never in `localStorage`.
- The refresh token belongs in an `httpOnly` cookie; `localStorage` is used as a marked fallback
  (see the `TODO` in `src/core/auth/authStore.ts`).
- On `401` the client attempts `POST /auth/refresh` **once**, queues the failed requests behind a
  single in-flight refresh, and replays them. If the refresh fails it clears the session and sends
  the user to `/login?redirect=<path>`.
- On boot, `AuthProvider` calls `GET /auth/me` and shows a splash screen until it resolves.

---

## Known trade-offs

- **Unsaved-changes guard.** React Router is used in declarative mode, which has no `useBlocker`.
  The guard covers reload and tab close (`beforeunload`) plus in-app link clicks (capture-phase
  interception). Browser back/forward is not intercepted; switching to a data router would fix it.
- **`unique()` validation** calls the data provider and memoizes per value for the lifetime of the
  form. It is a convenience check — the server must still enforce uniqueness.
- **Column visibility** is stored in `localStorage` per resource rather than in the URL, because it
  is a personal preference rather than part of a shareable view.
- **View pages** reuse table columns for their read-only entries, so a value is formatted the same
  way it appears in the table. Pass `infolist` to override.

---

## Scripts

| Command                    | Purpose                                     |
| -------------------------- | ------------------------------------------- |
| `pnpm dev`                 | Dev server with HMR                         |
| `pnpm build`               | Type-check (`tsc -b`) then production build |
| `pnpm preview`             | Serve the production build                  |
| `pnpm typecheck`           | Types only                                  |
| `pnpm lint`                | ESLint (bans `any` inside `src/core/`)      |
| `pnpm format`              | Prettier                                    |
| `pnpm gen:resource <Name>` | Scaffold and register a new resource        |

## Further reading

- [`docs/architecture.md`](docs/architecture.md) — the three contracts, and which one to touch to
  swap the backend, transport or database driver.
- [`docs/database.md`](docs/database.md) — connecting PostgreSQL, MySQL, SQLite, SQL Server or MongoDB.
- [`docs/api-reference.md`](docs/api-reference.md) — every field, column, filter and action method.
- [`docs/recipes.md`](docs/recipes.md) — custom fields, custom columns, swapping the data provider,
  custom pages.
