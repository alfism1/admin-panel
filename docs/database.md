# Connecting a database

Set one variable and every table becomes a working CRUD module.

```bash
# .env
DATABASE_URL=postgres://user:pass@localhost:5432/app
VITE_USE_MOCK=false
```

```bash
pnpm dev:full       # web on :5173, API on :4000
```

---

## Why there is a server at all

The panel is a browser SPA. A browser cannot open a TCP connection to PostgreSQL, and anything in a
`VITE_*` variable is **compiled into the JavaScript bundle every visitor downloads** — putting a
connection string there would publish your credentials.

So `DATABASE_URL` is read by `server/`, a small Node API that sits between the browser and the
database. It has no build step and no framework: `node:http`, Knex for SQL, the MongoDB driver for
Mongo.

```text
browser ──/api──►  server/  ──DATABASE_URL──►  your database
   VITE_* only        secrets live here
```

In development, Vite proxies `/api` to the server so the browser stays on one origin.

---

## Supported databases

The **scheme of the URL** is the only thing that selects a driver.

| Database        | `DATABASE_URL`                               | Driver           |
| --------------- | -------------------------------------------- | ---------------- |
| PostgreSQL      | `postgres://user:pass@host:5432/db`          | `pg`             |
| MySQL / MariaDB | `mysql://user:pass@host:3306/db`             | `mysql2`         |
| SQLite          | `sqlite:./data/app.db` or `sqlite::memory:`  | `better-sqlite3` |
| SQL Server      | `mssql://user:pass@host:1433/db`             | `tedious`        |
| MongoDB         | `mongodb://host:27017/db`, `mongodb+srv://…` | `mongodb`        |

`postgresql://`, `mariadb://`, `sqlserver://` and `file:` are accepted as aliases. The SQL drivers
ship as dependencies; SQLite, SQL Server and MongoDB are optional, so install the one you need if
your platform skipped it:

```bash
pnpm add better-sqlite3     # or tedious, or mongodb
```

---

## What happens on boot

1. **Introspection.** The server reads the live schema: tables, columns, types, primary keys and
   declared foreign keys. For MongoDB it samples 50 documents per collection instead.
2. **Resources.** Every table becomes `GET/POST /:table` and `GET/PATCH/DELETE /:table/:id`.
3. **Search.** Every text column is searchable, so the table search box works with no setup.
4. **Relations.** A foreign key is embedded on read: `author_id` pointing at `users` adds
   `author: { id, name, … }` to each row, which is what `TextColumn.make('author.name')` reads.
   Declared constraints win; the `<name>_id` → `<names>` convention is the fallback.
5. **Permissions.** `GET /permissions` returns `<singular>.view/create/update/delete` per table.

Check what was detected without starting anything:

```bash
pnpm db:introspect
```

```text
posts  (pk: id)
  id            number   integer
  title         string   varchar
  author_id     number   integer  → users as "author"
  searchable: title, slug, excerpt, content, status, category
```

---

## Trying it in 30 seconds

No database installed? SQLite needs no server:

```bash
echo 'DATABASE_URL=sqlite:./data/admin.db' >> .env
pnpm db:seed        # migrates users / roles / posts, then seeds them
pnpm dev:full
```

`pnpm db:seed` runs any pending migrations and then inserts demo rows — 30 users, 3 roles and 24
posts. Safe to re-run: tables that already have rows are left alone. Sign in with
`admin@example.com` / `password`.

---

## Migrations

The tables live in `server/migrations/`, one timestamped file per change, applied in filename order
and tracked in a `knex_migrations` table. SQL dialects only — MongoDB has no fixed schema to
migrate.

```bash
pnpm db:migrate                  # apply everything pending
pnpm db:migrate --dry            # list what would run, touch nothing
pnpm db:migrate status           # what is applied, what is pending
pnpm db:migrate:make add_tags    # write server/migrations/<timestamp>_add_tags.ts
pnpm db:rollback                 # undo the last batch
pnpm db:migrate down             # undo exactly one migration
```

A migration is a module with `up` and `down`, handed a Knex instance:

```ts
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (table) => {
    table.string('subtitle', 180).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (table) => {
    table.dropColumn('subtitle');
  });
}
```

Write the `down` even when you doubt you will use it — `rollback` is the only thing standing
between a bad deploy and a restore from backup.

### What runs where

- **On boot** the API reports pending migrations and keeps going. Set `DB_AUTO_MIGRATE=true` to have
  it apply them instead — convenient for a single-process deploy, but a separate `pnpm db:migrate`
  step is safer once more than one instance can start at the same time.
- **Concurrency** is handled by a lock table, so two runners cannot apply the same batch. If a
  runner is killed mid-migration the lock survives it: clear it with `pnpm db:migrate unlock`.
- **Transactions** wrap each migration on PostgreSQL, SQLite and SQL Server. MySQL and MariaDB
  commit DDL implicitly, so a migration that fails halfway leaves the schema partly changed — the
  CLI warns before it starts.
- **In CI**, `pnpm db:migrate status --check` exits non-zero when anything is pending.
- **Rolling back with `NODE_ENV=production`** is refused unless you pass `--force` or set
  `DB_ALLOW_ROLLBACK=true`.

### Adopting a database that already has the schema

A database with no `knex_migrations` table is treated as one the panel does not own: nothing is
created and nothing is reported. To bring it under migration control — a database built by an older
`pnpm db:seed`, say — record the existing migrations as applied without running them:

```bash
pnpm db:migrate baseline
```

Only do that when the schema really does match; `baseline` asserts history rather than checking it.

---

## Pointing at a database you already have

Nothing needs migrating — the runner leaves a database it did not create alone. Tell the auth layer
which columns you use:

```bash
AUTH_TABLE=accounts
AUTH_EMAIL_COLUMN=email_address
AUTH_PASSWORD_COLUMN=password_digest
AUTH_NAME_COLUMN=full_name

AUTH_ROLE_TABLE=roles
AUTH_ROLE_FK=role_id
AUTH_ROLE_NAME_COLUMN=slug
AUTH_PERMISSIONS_COLUMN=permissions
```

- Passwords are compared with **bcrypt** when the stored value looks like a bcrypt hash, and as
  plain text otherwise (useful for legacy seed data). Values written through the panel are always
  hashed with bcrypt before they are stored.
- The permissions column may be a JSON array, a JSON string, or a comma-separated string.
- **If there is no role table**, every signed-in user is granted `*` — the panel is fully usable and
  the backend stays the real authority.
- **If there is no users table either**, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` and the server
  accepts that single account.

Then write a resource per table you want in the UI (or run `pnpm gen:resource <Name>`). Tables with
no resource file are still reachable over the API but do not appear in the sidebar.

### Limiting what is exposed

```bash
DB_TABLES=users,roles,posts                  # allow-list; empty means every table
DB_HIDDEN_TABLES=sessions,password_resets    # always excluded
DB_SCHEMA=public                             # PostgreSQL schema
```

---

## Security notes

- **Every route except `/auth/login` requires a valid access token.** Tokens are JWTs; the access
  token lives 15 minutes, the refresh token 7 days.
- **`JWT_SECRET` must be set in production** — the server refuses to start with the development
  default when `NODE_ENV=production`.
- **Column names are never taken from user input.** Sort columns, filter columns and writable
  fields are all checked against the introspected schema, so a crafted query string cannot reach
  the SQL. Values are passed as bindings.
- **Secret columns never leave the server.** `password`, `password_hash`, `remember_token`,
  `api_token` and similar are stripped from every response.
- **`per_page` is capped at 200.**
- The API applies _authentication_, not per-table _authorization_. Any signed-in user can call any
  exposed table. The permission strings shape the UI; if you need row- or table-level rules
  enforced, add them in `server/routes.ts` before shipping to production.

---

## Production

```bash
pnpm build          # builds the browser app into dist/
pnpm db:migrate     # applies pending migrations — before the new API starts
pnpm start:api      # runs the API
```

Serve `dist/` from your web server and proxy `/api` to the API process, or set
`VITE_API_URL=https://api.example.com` at build time and `API_ORIGIN` to the site's origin so CORS
allows it.

---

## Adding another database

Implement `DatabaseAdapter` from `server/db/types.ts` — twelve methods and a `dialect` string — and
return it from `connectDatabase()` for your URL scheme. Nothing else in the server knows which
database is in use.

```ts
export interface DatabaseAdapter {
  readonly dialect: string;

  // Schema & introspection
  resources(): ResourceSchema[];
  schema(resource: string): ResourceSchema;
  has(resource: string): boolean;

  // CRUD — these back the REST routes
  list(resource: string, params: ListParams): Promise<ListResult>;
  find(resource: string, id: string): Promise<Row | null>;
  insert(resource: string, data: Row): Promise<Row>;
  update(resource: string, id: string, data: Row): Promise<Row>;
  remove(resource: string, id: string): Promise<void>;
  removeMany(resource: string, ids: string[]): Promise<number>;

  // Used by auth (login by email) and /dashboard/stats
  findBy(resource: string, column: string, value: unknown): Promise<Row | null>;
  count(resource: string, where?: Row): Promise<number>;

  close(): Promise<void>;
}
```

---

## Troubleshooting

| Symptom                             | Cause                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL is not set`           | The server reads the root `.env`; copy `.env.example` first.              |
| `resources (none found)`            | Wrong database in the URL, or `DB_TABLES` excludes everything.            |
| Login says _no users table found_   | Set `AUTH_TABLE`, or `ADMIN_EMAIL` + `ADMIN_PASSWORD`.                    |
| Related column shows `—`            | No declared foreign key and the name is not `<table-singular>_id`.        |
| App still shows fixture data        | `VITE_USE_MOCK` is still `true`; restart Vite after changing `.env`.      |
| `EADDRINUSE`                        | Another process owns `API_PORT`; change it (Vite's proxy follows it).     |
| `table … already exists` on migrate | The schema predates the runner; adopt it with `pnpm db:migrate baseline`. |
| Migrations hang on the lock         | A runner was killed mid-batch; `pnpm db:migrate unlock`.                  |
