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

```
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

```
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
pnpm db:seed        # creates users / roles / posts and seeds them
pnpm dev:full
```

`pnpm db:seed` is safe to re-run — it skips tables that already exist. It creates the schema the
bundled example resources expect and seeds 30 users, 3 roles and 24 posts. Sign in with
`admin@example.com` / `password`.

---

## Pointing at a database you already have

Nothing needs migrating. Tell the auth layer which columns you use:

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
pnpm start:api      # runs the API
```

Serve `dist/` from your web server and proxy `/api` to the API process, or set
`VITE_API_URL=https://api.example.com` at build time and `API_ORIGIN` to the site's origin so CORS
allows it.

---

## Adding another database

Implement `DatabaseAdapter` from `server/db/types.ts` — seven methods — and return it from
`connectDatabase()` for your URL scheme. Nothing else in the server knows which database is in use.

```ts
export interface DatabaseAdapter {
  resources(): ResourceSchema[];
  list(resource: string, params: ListParams): Promise<ListResult>;
  find(resource: string, id: string): Promise<Row | null>;
  insert(resource: string, data: Row): Promise<Row>;
  update(resource: string, id: string, data: Row): Promise<Row>;
  remove(resource: string, id: string): Promise<void>;
  removeMany(resource: string, ids: string[]): Promise<number>;
  // …plus schema(), has(), findBy(), count(), close()
}
```

---

## Troubleshooting

| Symptom                           | Cause                                                                 |
| --------------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL is not set`         | The server reads the root `.env`; copy `.env.example` first.          |
| `resources (none found)`          | Wrong database in the URL, or `DB_TABLES` excludes everything.        |
| Login says _no users table found_ | Set `AUTH_TABLE`, or `ADMIN_EMAIL` + `ADMIN_PASSWORD`.                |
| Related column shows `—`          | No declared foreign key and the name is not `<table-singular>_id`.    |
| App still shows fixture data      | `VITE_USE_MOCK` is still `true`; restart Vite after changing `.env`.  |
| `EADDRINUSE`                      | Another process owns `API_PORT`; change it (Vite's proxy follows it). |
