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

  /** Only these tables are exposed. Empty means "every table found". */
  exposedTables: (optional('DB_TABLES') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
  hiddenTables: (optional('DB_HIDDEN_TABLES') ?? 'migrations,knex_migrations,knex_migrations_lock')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
  schema: optional('DB_SCHEMA'),

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
