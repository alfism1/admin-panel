# create-admin-panel

Scaffold a Filament-style React admin panel, wired to your own database.

```bash
npm create admin-panel@latest
```

Describe a resource declaratively — fields, table columns, filters, actions — and the list,
create, edit and view pages, routes, sidebar entry, breadcrumbs, validation and permission
gates are generated for you.

## What it asks

| Question         | Why                                                                 |
| ---------------- | ------------------------------------------------------------------- |
| Directory        | Where the project goes                                              |
| Name             | `VITE_APP_NAME`, `package.json` name, README heading                |
| Database         | Mock · PostgreSQL · MySQL · SQLite · SQL Server · MongoDB           |
| Connection       | Becomes `DATABASE_URL` — the only database configuration there is   |
| Users table      | `AUTH_TABLE`, so login points at a table you already have           |
| Starting content | Demo data · **read your existing schema** · nothing                 |
| Package manager  | pnpm · npm · yarn · bun, pre-selected from however you invoked this |

`JWT_SECRET` is never asked for — it is generated with `crypto.randomBytes(32)` and written
to a git-ignored `.env`.

## Reading an existing schema

Point it at a database you already have and pick **Read my existing schema**:

```bash
npm create admin-panel@latest crm -- \
  --database-url postgres://localhost:5432/crm \
  --resources introspect
```

It connects, introspects every table, and writes one resource per table — columns mapped to
field types, `NOT NULL` to `.required()`, `varchar(n)` to `.maxLength(n)`, foreign keys to
`Select.relationship()`, text columns to `.searchable()`. The output is ordinary application
code in `src/resources/`, meant to be edited.

Tables with nothing editable — join tables, most views — are reported and skipped.

## Choosing "Mock"

The default. The whole panel runs against in-browser fixtures with no server and no database,
which makes `npm create admin-panel@latest -y && npm run dev` a complete first run. The
server, the migrations and the database drivers are all still there when you want them; the
generated README covers the switch.

## Non-interactive

Every question has a flag, so this works in CI and in scripts:

```
--name <string>        Display name for the panel
--db <key>             mock | postgres | mysql | sqlite | mssql | mongodb
--database-url <url>   Connection string; implies --db
--auth-table <name>    Table holding your users            (default: users)
--resources <mode>     demo | introspect | empty
--pm <manager>         pnpm | npm | yarn | bun
--install / --no-install
--git / --no-git
--force                Scaffold into a non-empty directory
-y, --yes              Accept every default, ask nothing
```

## What gets generated

```text
src/
├── core/        the framework layer — closed, extended from outside
├── resources/   your entities, one file each
├── pages/       Dashboard, Login, 403, 404
├── layouts/     app shell, sidebar, auth layout
└── lib/         shared helpers

server/          optional Node API: routes, auth, DB adapters, migrations
tests/           Vitest + Testing Library, with the helpers documented in AGENTS.md
docs/            architecture, API reference, database guide, recipes
.github/         CI workflow matching your package manager
AGENTS.md        the same conventions, written for coding agents
```

Only the driver you chose is installed. The other four are pruned from `package.json`, which
is the difference between building `better-sqlite3` from source and not.

## Requirements

Node 20.11 or newer.

## License

MIT
