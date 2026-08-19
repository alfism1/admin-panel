/**
 * The single source of truth for everything that varies by database.
 *
 * `server/db/connect.ts` derives the dialect from the URL scheme alone, so the
 * interview only has to produce one string — `DATABASE_URL`. Everything else
 * here exists to prune drivers and to know which post-scaffold steps apply.
 */

export const DATABASES = {
  mock: {
    label: 'Mock',
    hint: 'in-browser fixtures — no server, no database, works offline',
    driver: null,
    types: null,
    defaultUrl: null,
    migrations: false,
    introspection: false,
  },
  postgres: {
    label: 'PostgreSQL',
    hint: 'pg',
    driver: 'pg',
    types: '@types/pg',
    defaultUrl: 'postgres://postgres:postgres@localhost:5432/admin',
    migrations: true,
    introspection: true,
  },
  mysql: {
    label: 'MySQL / MariaDB',
    hint: 'mysql2',
    driver: 'mysql2',
    types: null,
    defaultUrl: 'mysql://root:secret@localhost:3306/admin',
    migrations: true,
    introspection: true,
  },
  sqlite: {
    label: 'SQLite',
    hint: 'better-sqlite3 — native build, zero server',
    driver: 'better-sqlite3',
    types: null,
    defaultUrl: 'sqlite:./data/admin.db',
    migrations: true,
    introspection: true,
  },
  mssql: {
    label: 'SQL Server',
    hint: 'tedious',
    driver: 'tedious',
    types: null,
    defaultUrl: 'mssql://sa:Str0ng!Pass@localhost:1433/admin',
    migrations: true,
    introspection: true,
  },
  mongodb: {
    label: 'MongoDB',
    hint: 'mongodb — no migrations, collections are read as they are',
    driver: 'mongodb',
    types: null,
    defaultUrl: 'mongodb://localhost:27017/admin',
    migrations: false,
    introspection: true,
  },
};

export const DATABASE_KEYS = Object.keys(DATABASES);

/** Mirrors the SCHEME_MAP in `server/db/connect.ts` — the only thing that reads a URL. */
const SCHEMES = {
  postgres: ['postgres', 'postgresql', 'pg'],
  mysql: ['mysql', 'mariadb'],
  sqlite: ['sqlite', 'sqlite3', 'file'],
  mssql: ['mssql', 'sqlserver'],
  mongodb: ['mongodb', 'mongodb+srv'],
};

/** Which database a connection string points at, or null when unrecognised. */
export function databaseFromUrl(url) {
  const scheme = url.slice(0, url.indexOf(':')).toLowerCase();
  if (!scheme) return null;

  const match = Object.entries(SCHEMES).find(([, schemes]) => schemes.includes(scheme));
  return match ? match[0] : null;
}

export function schemesFor(key) {
  return SCHEMES[key] ?? [];
}

/** Every driver the template ships with, so the unchosen ones can be pruned. */
export const ALL_DRIVERS = ['pg', 'mysql2', 'better-sqlite3', 'tedious', 'mongodb'];

/** Driver-specific type packages, pruned on the same rule. */
export const ALL_DRIVER_TYPES = ['@types/pg'];

export const RESOURCE_MODES = {
  demo: {
    label: 'Demo data',
    hint: 'run migrations + seed users, roles, posts and products',
  },
  introspect: {
    label: 'Read my existing schema',
    hint: 'generate one resource per table from the database you just pointed at',
  },
  empty: {
    label: 'Nothing',
    hint: "start with no resources — I'll scaffold them myself",
  },
};

export const RESOURCE_MODE_KEYS = Object.keys(RESOURCE_MODES);

export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'];

/** Detects the package manager that invoked us, e.g. `npm/10.8.2 node/v22.16.0`. */
export function detectPackageManager() {
  const agent = process.env.npm_config_user_agent;
  if (!agent) return 'npm';

  const name = agent.split('/')[0];
  return PACKAGE_MANAGERS.includes(name) ? name : 'npm';
}

/**
 * The version of the invoking manager, or null when it cannot be observed.
 * `packageManager` is binding under Corepack, so it may only claim what we saw.
 */
export function detectPackageManagerVersion(pm) {
  const agent = process.env.npm_config_user_agent;
  if (!agent) return null;

  const match = new RegExp(`(?:^|\\s)${pm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\S+)`).exec(
    agent,
  );

  return match ? match[1] : null;
}

/** How this manager spells "run the script named X". */
export function runScript(pm, script) {
  return pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;
}
