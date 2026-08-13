import knexFactory, { type Knex } from 'knex';
import { env } from '../env';

export type Dialect = 'postgres' | 'mysql' | 'sqlite' | 'mssql' | 'mongodb';

const SCHEME_MAP: Record<string, Dialect> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  mysql: 'mysql',
  mariadb: 'mysql',
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  file: 'sqlite',
  mssql: 'mssql',
  sqlserver: 'mssql',
  mongodb: 'mongodb',
  'mongodb+srv': 'mongodb',
};

const KNEX_CLIENT: Record<Exclude<Dialect, 'mongodb'>, string> = {
  postgres: 'pg',
  mysql: 'mysql2',
  sqlite: 'better-sqlite3',
  mssql: 'mssql',
};

const DRIVER_PACKAGE: Record<Exclude<Dialect, 'mongodb'>, string> = {
  postgres: 'pg',
  mysql: 'mysql2',
  sqlite: 'better-sqlite3',
  mssql: 'tedious',
};

/** Reads the scheme off the connection string — the only configuration needed. */
export function detectDialect(url: string): Dialect {
  const scheme = url.slice(0, url.indexOf(':')).toLowerCase();
  const dialect = SCHEME_MAP[scheme];

  if (!dialect) {
    throw new Error(
      `Unsupported DATABASE_URL scheme "${scheme}". ` +
        `Use one of: ${[...new Set(Object.keys(SCHEME_MAP))].join(', ')}.`,
    );
  }

  return dialect;
}

function sqliteFilename(url: string): string {
  const withoutScheme = url.replace(/^(sqlite3?|file):\/\/?/, '').replace(/^(sqlite3?|file):/, '');
  return withoutScheme === ':memory:' ? ':memory:' : withoutScheme;
}

function assertDriverInstalled(dialect: Exclude<Dialect, 'mongodb'>): void {
  const pkg = DRIVER_PACKAGE[dialect];
  try {
    // Presence check only — knex loads the driver itself.
    import.meta.resolve?.(pkg);
  } catch {
    throw new Error(`The "${pkg}" driver is not installed. Run: pnpm add ${pkg}`);
  }
}

export function createKnex(url: string, dialect: Exclude<Dialect, 'mongodb'>): Knex {
  assertDriverInstalled(dialect);

  if (dialect === 'sqlite') {
    return knexFactory({
      client: KNEX_CLIENT.sqlite,
      connection: { filename: sqliteFilename(url) },
      useNullAsDefault: true,
    });
  }

  return knexFactory({
    client: KNEX_CLIENT[dialect],
    connection: url,
    searchPath: dialect === 'postgres' && env.schema ? [env.schema] : undefined,
    pool: { min: 0, max: 10 },
  });
}

/** Hides credentials so the connection can be logged safely. */
export function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url.replace(/:\/\/[^@]*@/, '://***@');
  }
}
