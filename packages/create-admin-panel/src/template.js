/** Copying the template into place, and every rewrite that depends on an answer. */
import { randomBytes } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { ALL_DRIVER_TYPES, ALL_DRIVERS, DATABASES } from './databases.js';

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');

/** Files the demo panel owns. Removed unless the user asked to keep the demo. */
const DEMO_PATHS = [
  'src/resources/UserResource.tsx',
  'src/resources/RoleResource.tsx',
  'src/resources/PostResource.tsx',
  'src/resources/ProductResource.tsx',
  'src/resources/components',
  'src/resources/data',
];

/**
 * Only these two reach into the demo resources. `tests/core`, `tests/lib`,
 * `tests/pages` and `tests/layouts` exercise the framework against fixtures they
 * build themselves, so a generated project inherits them and a real suite.
 */
const DEMO_TEST_PATHS = ['tests/App.test.tsx', 'tests/resources'];

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function resolveTemplateDir() {
  const bundled = path.join(PACKAGE_DIR, 'template');

  if (await exists(bundled)) return bundled;

  throw new Error(
    'Template directory is missing.\n' +
      '  Running from a git checkout? Build it first:\n' +
      '    node packages/create-admin-panel/scripts/build-template.mjs',
  );
}

/** An existing directory is only safe to scaffold into when it holds nothing meaningful. */
export async function inspectTarget(targetDir) {
  if (!(await exists(targetDir))) return { exists: false, empty: true, entries: [] };

  const entries = (await readdir(targetDir)).filter(
    (entry) => entry !== '.git' && entry !== '.DS_Store',
  );

  return { exists: true, empty: entries.length === 0, entries };
}

export async function copyTemplate(templateDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  await cp(templateDir, targetDir, { recursive: true });

  await rename(path.join(targetDir, '_gitignore'), path.join(targetDir, '.gitignore'));
  await rename(path.join(targetDir, '_env.example'), path.join(targetDir, '.env.example'));
}

/** npm package names are lowercase, and a scaffold should never fail on a capital letter. */
export function toPackageName(value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-~._]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  return slug || 'admin-panel';
}

export async function writePackageJson(targetDir, answers) {
  const file = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  const database = DATABASES[answers.database];

  pkg.name = toPackageName(answers.name);
  pkg.version = '0.1.0';
  pkg.private = true;
  pkg.description = `${answers.name} — an admin panel built with the Filament-style React framework.`;

  // Corepack treats this field as binding, so it may only claim a version we
  // actually observed. Anything else and `npm install` starts failing on a pin
  // the user never chose.
  if (answers.packageManagerVersion) {
    pkg.packageManager = `${answers.packageManager}@${answers.packageManagerVersion}`;
  } else {
    delete pkg.packageManager;
  }

  pkg.dependencies ??= {};
  pkg.devDependencies ??= {};
  pkg.optionalDependencies ??= {};

  // Every driver ships in the template; the scaffold keeps at most one. This is
  // the difference between installing a native SQLite build you will never load
  // and not installing it.
  const keptVersion = database.driver
    ? (pkg.dependencies[database.driver] ?? pkg.optionalDependencies[database.driver])
    : null;

  for (const driver of ALL_DRIVERS) {
    delete pkg.dependencies[driver];
    delete pkg.optionalDependencies[driver];
  }

  // Promoted out of optionalDependencies: once chosen it is load-bearing, and a
  // silently skipped optional install would surface as a confusing runtime error.
  if (database.driver && keptVersion) pkg.dependencies[database.driver] = keptVersion;

  for (const types of ALL_DRIVER_TYPES) {
    if (types !== database.types) delete pkg.devDependencies[types];
  }

  // Its script would outlive the file `applyDatabaseVariant` removes.
  if (answers.database !== 'postgres') delete pkg.scripts['db:seed:bulk'];

  // Mongo genuinely cannot migrate — the CLI refuses. A mock project keeps them:
  // running one is step three of pointing it at a real database.
  if (answers.database === 'mongodb') {
    for (const script of ['db:migrate', 'db:migrate:make', 'db:migrate:status', 'db:rollback']) {
      delete pkg.scripts[script];
    }
  }

  if (Object.keys(pkg.optionalDependencies).length === 0) delete pkg.optionalDependencies;

  pkg.dependencies = sortKeys(pkg.dependencies);
  pkg.devDependencies = sortKeys(pkg.devDependencies);

  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function sortKeys(record) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export function generateJwtSecret() {
  return randomBytes(32).toString('hex');
}

export async function writeEnv(targetDir, answers) {
  const database = DATABASES[answers.database];
  const useMock = answers.database === 'mock';

  const databaseBlock = useMock
    ? [
        '# No database selected. Point DATABASE_URL at one, flip VITE_USE_MOCK to',
        '# false above, then run `db:migrate` and every table becomes a resource.',
        '# DATABASE_URL=postgres://postgres:postgres@localhost:5432/admin',
      ]
    : [`DATABASE_URL=${answers.databaseUrl}`];

  const lines = [
    '# ─────────────────────────────────────────────────────────────────────────────',
    '# Frontend  (VITE_* is compiled into the browser bundle — never put secrets here)',
    '# ─────────────────────────────────────────────────────────────────────────────',
    '',
    '# true  → in-browser fixture backend, no server or database needed',
    '# false → talk to the API server below',
    `VITE_USE_MOCK=${useMock}`,
    '',
    '# Left as /api so the Vite dev server proxies to the API on the same origin.',
    'VITE_API_URL=/api',
    '',
    `VITE_APP_NAME=${answers.name}`,
    '',
    '',
    '# ─────────────────────────────────────────────────────────────────────────────',
    '# Database  (server-side only — never exposed to the browser)',
    '# ─────────────────────────────────────────────────────────────────────────────',
    '',
    ...databaseBlock,
    '',
    'API_PORT=4000',
    'API_ORIGIN=http://localhost:5173',
    '',
    '# Restrict which tables are exposed. Empty = every table found.',
    '# DB_TABLES=users,roles,posts',
    '# DB_HIDDEN_TABLES=migrations,sessions,password_resets',
    '# DB_SCHEMA=public',
    '',
    '',
    '# ─────────────────────────────────────────────────────────────────────────────',
    '# Auth — points at columns your database already has',
    '# ─────────────────────────────────────────────────────────────────────────────',
    '',
    `AUTH_TABLE=${answers.authTable}`,
    'AUTH_EMAIL_COLUMN=email',
    'AUTH_PASSWORD_COLUMN=password',
    'AUTH_NAME_COLUMN=name',
    '',
    '# Optional role model. If the role table is absent, every signed-in user gets `*`.',
    'AUTH_ROLE_TABLE=roles',
    'AUTH_ROLE_FK=role_id',
    'AUTH_ROLE_NAME_COLUMN=slug',
    'AUTH_PERMISSIONS_COLUMN=permissions',
    '',
    '# Fallback account used when the database has no users table at all.',
    '# ADMIN_EMAIL=admin@example.com',
    '# ADMIN_PASSWORD=change-me',
    '',
    '# Generated for this project by create-admin-panel. Rotate it for production,',
    '# and keep it out of version control — .gitignore already excludes this file.',
    `JWT_SECRET=${generateJwtSecret()}`,
    'JWT_ACCESS_TTL=15m',
    'JWT_REFRESH_TTL=7d',
    '',
  ];

  await writeFile(path.join(targetDir, '.env'), lines.join('\n'));
}

/**
 * Two server files import a driver by name, so pruning the driver would leave
 * the project unable to typecheck. Both are database-specific anyway — a
 * Postgres panel has no use for a Mongo adapter.
 *
 * The mongo-free `server/db/index.ts` is precomputed at pack time, so all that
 * happens here is a rename.
 */
export async function applyDatabaseVariant(targetDir, database) {
  const mongoFree = path.join(targetDir, 'server/db/index.nomongo.ts');

  if (database === 'mongodb') {
    await rm(mongoFree, { force: true });
  } else {
    await rm(path.join(targetDir, 'server/db/mongoAdapter.ts'), { force: true });
    await rename(mongoFree, path.join(targetDir, 'server/db/index.ts'));
  }

  // `seed-bulk` is a Postgres-only COPY-based bulk loader.
  if (database !== 'postgres') {
    await rm(path.join(targetDir, 'server/cli/seed-bulk.ts'), { force: true });
  }
}

/**
 * better-sqlite3 will not create a missing parent directory, and the default
 * URL points at `./data/admin.db` — which does not exist in a fresh scaffold.
 * Mirrors `sqliteFilename()` in `server/db/connect.ts`.
 */
export async function ensureSqliteDirectory(targetDir, databaseUrl) {
  const filename = databaseUrl
    .replace(/^(sqlite3?|file):\/\/?/, '')
    .replace(/^(sqlite3?|file):/, '');

  if (filename === ':memory:' || filename === '') return;

  await mkdir(path.dirname(path.resolve(targetDir, filename)), { recursive: true });
}

/**
 * The demo panel is the tutorial. Once the user has their own schema it is four
 * resources pointing at tables they do not have, so it goes.
 */
export async function applyResourceMode(targetDir, mode) {
  const demoFreeMain = path.join(targetDir, 'src/main.nodemo.tsx');

  if (mode === 'demo') {
    await rm(demoFreeMain, { force: true });
    return;
  }

  for (const relative of [...DEMO_PATHS, ...DEMO_TEST_PATHS]) {
    await rm(path.join(targetDir, relative), { recursive: true, force: true });
  }

  // `src/main.tsx` imports the demo modules removed above.
  await rename(demoFreeMain, path.join(targetDir, 'src/main.tsx'));

  await writeResourceIndex(targetDir, []);
}

/** Rewrites `src/resources/index.ts` — the one place a resource is registered. */
export async function writeResourceIndex(targetDir, classNames) {
  const imports = classNames
    .map((name) => `import { ${name}Resource } from './${name}Resource';`)
    .join('\n');

  const registrations = classNames.map((name) => `  ${name}Resource,`).join('\n');

  const body = classNames.length
    ? `import { registerResources } from '@/core/resources/registry';\n${imports}\n\n/** The single place a new resource has to be mentioned. */\nexport const resources = registerResources([\n${registrations}\n]);\n`
    : `import { registerResources } from '@/core/resources/registry';\n\n/**\n * The single place a new resource has to be mentioned.\n * Scaffold one with \`gen:resource <Name>\`.\n */\nexport const resources = registerResources([]);\n`;

  await writeFile(path.join(targetDir, 'src/resources/index.ts'), body);
}

/**
 * AGENTS.md is written for this framework's own repo, where pnpm is mandatory.
 * A project scaffolded with npm needs the commands to say npm.
 */
export async function retargetAgentsDoc(targetDir, packageManager) {
  if (packageManager === 'pnpm') return;

  const file = path.join(targetDir, 'AGENTS.md');
  const source = await readFile(file, 'utf8');

  const rewritten = source
    .replace(
      /Package manager is \*\*pnpm\*\* \(`pnpm@[^`]*`\)\. Never use npm or yarn here\./,
      `Package manager is **${packageManager}**. Stick to it — mixing lockfiles is the usual cause of a broken install.`,
    )
    .replace(/\bpnpm /g, `${packageManager} `);

  await writeFile(file, rewritten);
}

export async function writeCi(targetDir, answers) {
  const pm = answers.packageManager;
  const setup =
    pm === 'pnpm'
      ? '      - name: Install pnpm\n        uses: pnpm/action-setup@v4\n        with:\n          run_install: false\n\n'
      : pm === 'bun'
        ? '      - uses: oven-sh/setup-bun@v2\n\n'
        : '';

  const cache = pm === 'bun' ? '' : `\n          cache: ${pm}`;
  const install = pm === 'bun' ? 'bun install' : `${pm} install`;
  const run = pm === 'npm' ? 'npm run' : pm;

  const workflow = `name: CI

on:
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]

concurrency:
  group: ci-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    name: Typecheck, lint, test, build
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

${setup}      - uses: actions/setup-node@v4
        with:
          node-version: 22${cache}

      - name: Install dependencies
        run: ${install}

      - name: Typecheck
        run: ${run} typecheck

      - name: Lint
        run: ${run} lint

      - name: Test
        run: ${run} test

      - name: Build
        run: ${run} build
        env:
          VITE_USE_MOCK: '${answers.database === 'mock'}'
`;

  await mkdir(path.join(targetDir, '.github/workflows'), { recursive: true });
  await writeFile(path.join(targetDir, '.github/workflows/ci.yml'), workflow);
}

export async function writeReadme(targetDir, answers) {
  const pm = answers.packageManager;
  const run = pm === 'npm' ? 'npm run' : pm;
  const database = DATABASES[answers.database];
  const useMock = answers.database === 'mock';

  const dev = useMock
    ? `${run} dev          # http://localhost:5173 — fixtures in the browser, nothing else to start`
    : `${run} dev:full     # web on :5173 + API on :4000`;

  const databaseSection = useMock
    ? `## Connecting a real database

This project runs on in-browser fixtures — no server, no database. To switch:

1. Install a driver: \`${pm} add pg\` (or \`mysql2\`, \`better-sqlite3\`, \`tedious\`, \`mongodb\`)
2. Set \`DATABASE_URL\` in \`.env\` and flip \`VITE_USE_MOCK=false\`
3. \`${run} db:migrate\` then \`${run} dev:full\`

Every table found becomes a REST resource. See [docs/database.md](docs/database.md).`
    : `## Database

Connected to **${database.label}** via \`DATABASE_URL\` in \`.env\`.

\`\`\`bash
${run} db:introspect        # show exactly what the API will expose
${
  database.migrations
    ? `${run} db:migrate           # apply pending migrations\n${run} db:migrate:make <name>  # new migration in server/migrations/\n`
    : ''
}\`\`\`

See [docs/database.md](docs/database.md).`;

  const readme = `# ${answers.name}

An admin panel built with a Filament-style React framework. Describe a resource
declaratively — fields, columns, filters, actions — and the list, create, edit and
view pages, routes, sidebar entry, breadcrumbs, validation and permission gates are
generated for you.

React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query & Table · Zod · react-hook-form

## Getting started

\`\`\`bash
${dev}
\`\`\`

## Adding a resource

\`\`\`bash
${run} gen:resource Product
\`\`\`

That writes \`src/resources/ProductResource.tsx\` and registers it in
\`src/resources/index.ts\` — the single place a resource is mentioned. Edit the
generated file to declare the form, table columns, filters and actions.

## Commands

| Task             | Command                |
| ---------------- | ---------------------- |
| Dev server       | \`${run} dev\`${' '.repeat(Math.max(0, 14 - run.length))}|
| Typecheck        | \`${run} typecheck\`${' '.repeat(Math.max(0, 8 - run.length))}|
| Lint             | \`${run} lint\`${' '.repeat(Math.max(0, 13 - run.length))}|
| Test             | \`${run} test\`${' '.repeat(Math.max(0, 13 - run.length))}|
| Production build | \`${run} build\`${' '.repeat(Math.max(0, 12 - run.length))}|

${databaseSection}

## Where things live

\`\`\`text
src/
├── core/        the framework layer — treat as closed, extend from outside
├── resources/   your entities, one file each
├── pages/       non-resource pages (Dashboard, Login, 403, 404)
├── layouts/     app shell, sidebar, auth layout
└── lib/         shared helpers
\`\`\`

\`src/core/\` is a closed layer: every customisation has an extension point
outside it. Adding a field type, a custom cell, a data provider or a new page is
covered in [docs/recipes.md](docs/recipes.md). \`AGENTS.md\` carries the same
rules for coding agents.

## Security

Client-side permission checks (\`<Can>\`, \`.authorize()\`) are **UX only, never a
security boundary**. The server is the sole authority.

---

Scaffolded with [create-admin-panel](https://www.npmjs.com/package/create-admin-panel).
`;

  await writeFile(path.join(targetDir, 'README.md'), readme);
}

export async function removeTemplateArtifacts(targetDir) {
  await rm(path.join(targetDir, 'tsconfig.tsbuildinfo'), { force: true });
  await rm(path.join(targetDir, 'node_modules/.tmp'), { recursive: true, force: true });
}

export function relativeToCwd(target) {
  const relative = path.relative(process.cwd(), target);
  return relative === '' ? '.' : relative;
}
