import { config } from 'dotenv';

config();

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function required(name: string, hint: string): string {
  const value = optional(name);
  if (!value) throw new Error(`${name} is not set. ${hint}`);
  return value;
}

function flag(name: string, fallback = false): boolean {
  const value = optional(name)?.toLowerCase();
  if (value === undefined) return fallback;
  return value === 'true';
}

function number(name: string, fallback: number): number {
  const value = Number(optional(name));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const migrationsTable = optional('DB_MIGRATIONS_TABLE') ?? 'knex_migrations';

export const env = {
  get databaseUrl(): string {
    return required(
      'DATABASE_URL',
      'Add a connection string to .env, e.g. postgres://user:pass@localhost:5432/app',
    );
  },

  port: Number(optional('API_PORT') ?? 4000),
  /** Where the browser app runs; used for the CORS allow-list. */
  origin: optional('API_ORIGIN') ?? 'http://localhost:5173',

  /**
   * Trust `X-Forwarded-For` for the client address. Only enable behind a proxy
   * that overwrites the header — otherwise any caller can spoof its way around
   * a per-address rate limit.
   */
  trustProxy: flag('TRUST_PROXY'),

  /** In production, successful requests slower than this are logged. */
  slowRequestMs: number('SLOW_REQUEST_MS', 1000),

  /** Knex pool bounds. Every concurrent slow query holds one of these. */
  pool: {
    min: number('DB_POOL_MIN', 0),
    max: number('DB_POOL_MAX', 10),
  },

  rateLimit: {
    /** Off for a single dev instance; on by default anywhere else. */
    enabled: flag('RATE_LIMIT_ENABLED', process.env.NODE_ENV === 'production'),
    login: {
      limit: number('RATE_LIMIT_LOGIN', 10),
      windowMs: number('RATE_LIMIT_LOGIN_WINDOW', 300) * 1000,
    },
    api: {
      limit: number('RATE_LIMIT_API', 600),
      windowMs: number('RATE_LIMIT_API_WINDOW', 60) * 1000,
    },
  },

  list: {
    /**
     * Above this row count an unfiltered list stops paying for an exact
     * `count(*)` and reports the planner's estimate instead. 0 disables.
     */
    estimateCountAbove: number('LIST_ESTIMATE_COUNT_ABOVE', 50_000),
    /**
     * A filtered count stops at this many matches and reports "at least N".
     * Counting every match of a broad term meant a full scan — seconds per
     * keystroke — while nothing above a page or two of results is information
     * a user acts on.
     */
    countCap: number('LIST_COUNT_CAP', 50_000),
  },

  search: {
    /**
     * Text search configuration used with a `tsvector` column — it decides
     * stemming and stop words, so it must match whatever the generated column
     * was built with or the two will disagree about what a word is.
     */
    textConfig: optional('SEARCH_TEXT_CONFIG') ?? 'english',
  },

  /** Only these tables are exposed. Empty means "every table found". */
  exposedTables: (optional('DB_TABLES') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
  hiddenTables: [
    ...(optional('DB_HIDDEN_TABLES') ?? 'migrations')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
    // Bookkeeping is never a resource, whatever DB_HIDDEN_TABLES was set to.
    migrationsTable,
    `${migrationsTable}_lock`,
  ],
  schema: optional('DB_SCHEMA'),

  /**
   * Tables whose rows belong to a user, as `table:column` pairs:
   * `OWNED_TABLES=posts:author_id,comments:user_id`. Empty means no table is
   * ownership-scoped, which is the previous behaviour exactly.
   */
  ownedTables: Object.fromEntries(
    (optional('OWNED_TABLES') ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.split(':').map((part) => part.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && Boolean(pair[1])),
  ) as Record<string, string>,

  migrations: {
    table: migrationsTable,
    /** Apply pending migrations when the API boots. Off by default: a deliberate deploy step is safer. */
    auto: flag('DB_AUTO_MIGRATE'),
    /** Allows `db:migrate rollback` under NODE_ENV=production without --force. */
    allowRollback: flag('DB_ALLOW_ROLLBACK'),
  },

  auth: {
    table: optional('AUTH_TABLE') ?? 'users',
    emailColumn: optional('AUTH_EMAIL_COLUMN') ?? 'email',
    passwordColumn: optional('AUTH_PASSWORD_COLUMN') ?? 'password',
    nameColumn: optional('AUTH_NAME_COLUMN') ?? 'name',
    roleForeignKey: optional('AUTH_ROLE_FK') ?? 'role_id',
    roleTable: optional('AUTH_ROLE_TABLE') ?? 'roles',
    roleNameColumn: optional('AUTH_ROLE_NAME_COLUMN') ?? 'slug',
    permissionsColumn: optional('AUTH_PERMISSIONS_COLUMN') ?? 'permissions',
    /** Fallback account used when the database has no users table. */
    fallbackEmail: optional('ADMIN_EMAIL'),
    fallbackPassword: optional('ADMIN_PASSWORD'),
    /** How long a resolved user may be reused. 0 re-reads on every request. */
    cacheTtlMs: number('AUTH_CACHE_TTL', 5) * 1000,
  },

  jwt: {
    secret: optional('JWT_SECRET') ?? 'dev-only-insecure-secret-change-me',
    accessTtl: optional('JWT_ACCESS_TTL') ?? '15m',
    refreshTtl: optional('JWT_REFRESH_TTL') ?? '7d',
  },

  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
};

export function assertProductionSecrets(): void {
  if (!env.isProduction) return;
  if (env.jwt.secret === 'dev-only-insecure-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a strong random value in production.');
  }
}
