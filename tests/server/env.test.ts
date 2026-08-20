import { describe, expect, it } from 'vitest';
import { withServerEnv } from './helpers/env';

type EnvModule = typeof import('../../server/env');

/** Every variable `server/env.ts` reads, blanked, so a local `.env` cannot leak in. */
const BLANK = {
  DATABASE_URL: '',
  API_PORT: '',
  API_ORIGIN: '',
  TRUST_PROXY: '',
  SLOW_REQUEST_MS: '',
  DB_POOL_MIN: '',
  DB_POOL_MAX: '',
  RATE_LIMIT_ENABLED: '',
  RATE_LIMIT_LOGIN: '',
  RATE_LIMIT_LOGIN_WINDOW: '',
  RATE_LIMIT_API: '',
  RATE_LIMIT_API_WINDOW: '',
  LIST_ESTIMATE_COUNT_ABOVE: '',
  LIST_COUNT_CAP: '',
  SEARCH_TEXT_CONFIG: '',
  DB_TABLES: '',
  DB_HIDDEN_TABLES: '',
  DB_MIGRATIONS_TABLE: '',
  DB_SCHEMA: '',
  OWNED_TABLES: '',
  DB_AUTO_MIGRATE: '',
  DB_ALLOW_ROLLBACK: '',
  AUTH_TABLE: '',
  AUTH_CACHE_TTL: '',
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: '',
  JWT_SECRET: '',
  NODE_ENV: 'test',
};

function loadEnv(vars: Record<string, string> = {}): Promise<EnvModule> {
  return withServerEnv({ ...BLANK, ...vars }, () => import('../../server/env'));
}

describe('required values', () => {
  it('explains how to fix a missing DATABASE_URL rather than failing obscurely', async () => {
    const { env } = await loadEnv();
    expect(() => env.databaseUrl).toThrow(/DATABASE_URL is not set/);
  });

  it('reads it when present', async () => {
    const { env } = await loadEnv({ DATABASE_URL: 'postgres://localhost/app' });
    expect(env.databaseUrl).toBe('postgres://localhost/app');
  });

  it('treats a whitespace-only value as absent', async () => {
    const { env } = await loadEnv({ DATABASE_URL: '   ' });
    expect(() => env.databaseUrl).toThrow(/DATABASE_URL is not set/);
  });

  it('trims what it keeps', async () => {
    const { env } = await loadEnv({ DATABASE_URL: '  postgres://localhost/app  ' });
    expect(env.databaseUrl).toBe('postgres://localhost/app');
  });
});

describe('flags', () => {
  it('are off unless set to exactly "true"', async () => {
    const { env } = await loadEnv();
    expect(env.trustProxy).toBe(false);
    expect(env.migrations.auto).toBe(false);
  });

  it('accept any casing of true', async () => {
    const { env } = await loadEnv({ TRUST_PROXY: 'TRUE' });
    expect(env.trustProxy).toBe(true);
  });

  it('KNOWN LIMITATION: 1, yes and on do not count as true', async () => {
    // `RATE_LIMIT_ENABLED=1` reads as "off", which is the failure mode that
    // matters: an operator who believes limits are on gets none, and nothing
    // says so. `TRUST_PROXY=1` fails the safe way instead.
    // Fix: accept `['true', '1', 'yes', 'on']`, and throw on a value that is
    // none of those and none of the falsey spellings — silently reading an
    // unrecognised value as `false` is what makes this quiet.
    for (const value of ['1', 'yes', 'on', 'enabled']) {
      const { env } = await loadEnv({ RATE_LIMIT_ENABLED: value });
      expect(env.rateLimit.enabled).toBe(false);
    }
  });
});

describe('numbers', () => {
  it('fall back when unset', async () => {
    const { env } = await loadEnv();
    expect(env.slowRequestMs).toBe(1000);
    expect(env.pool).toEqual({ min: 0, max: 10 });
    expect(env.rateLimit.login).toEqual({ limit: 10, windowMs: 300_000 });
    expect(env.rateLimit.api).toEqual({ limit: 600, windowMs: 60_000 });
    expect(env.list).toEqual({ estimateCountAbove: 50_000, countCap: 50_000 });
  });

  it('read a value that parses', async () => {
    const { env } = await loadEnv({ RATE_LIMIT_LOGIN: '3', RATE_LIMIT_LOGIN_WINDOW: '60' });
    expect(env.rateLimit.login).toEqual({ limit: 3, windowMs: 60_000 });
  });

  it('accept zero, which several of them use as "disabled"', async () => {
    const { env } = await loadEnv({ LIST_ESTIMATE_COUNT_ABOVE: '0', AUTH_CACHE_TTL: '0' });
    expect(env.list.estimateCountAbove).toBe(0);
    expect(env.auth.cacheTtlMs).toBe(0);
  });

  it('fall back on a negative or unparseable value', async () => {
    // A negative limit would be "refuse everything"; nonsense should not be a
    // way to configure that by accident.
    for (const value of ['-1', 'abc', 'NaN', 'Infinity']) {
      const { env } = await loadEnv({ RATE_LIMIT_API: value });
      expect(env.rateLimit.api.limit).toBe(600);
    }
  });
});

describe('OWNED_TABLES', () => {
  it('is empty by default, which is the pre-ownership behaviour exactly', async () => {
    const { env } = await loadEnv();
    expect(env.ownedTables).toEqual({});
  });

  it('reads table:column pairs', async () => {
    const { env } = await loadEnv({ OWNED_TABLES: 'posts:author_id,comments:user_id' });
    expect(env.ownedTables).toEqual({ posts: 'author_id', comments: 'user_id' });
  });

  it('drops an entry with no column rather than scoping by undefined', async () => {
    const { env } = await loadEnv({ OWNED_TABLES: 'posts,comments:,orders:user_id' });
    expect(env.ownedTables).toEqual({ orders: 'user_id' });
  });

  it('trims whitespace around both halves', async () => {
    const { env } = await loadEnv({ OWNED_TABLES: ' posts : author_id ' });
    expect(env.ownedTables).toEqual({ posts: 'author_id' });
  });
});

describe('table exposure', () => {
  it('exposes everything by default', async () => {
    const { env } = await loadEnv();
    expect(env.exposedTables).toEqual([]);
  });

  it('reads an allow-list', async () => {
    const { env } = await loadEnv({ DB_TABLES: 'posts, users ,' });
    expect(env.exposedTables).toEqual(['posts', 'users']);
  });

  it('always hides the migration bookkeeping, whatever the deny-list says', async () => {
    const { env } = await loadEnv({ DB_HIDDEN_TABLES: 'secrets' });
    expect(env.hiddenTables).toEqual(
      expect.arrayContaining(['secrets', 'knex_migrations', 'knex_migrations_lock']),
    );
  });

  it('follows a renamed migrations table', async () => {
    const { env } = await loadEnv({ DB_MIGRATIONS_TABLE: 'schema_history' });
    expect(env.migrations.table).toBe('schema_history');
    expect(env.hiddenTables).toEqual(
      expect.arrayContaining(['schema_history', 'schema_history_lock']),
    );
  });
});

describe('rate limiting defaults', () => {
  it('is off outside production, where one dev instance needs no throttle', async () => {
    const { env } = await loadEnv({ NODE_ENV: 'development' });
    expect(env.rateLimit.enabled).toBe(false);
  });

  it('is on by default in production', async () => {
    const { env } = await loadEnv({ NODE_ENV: 'production' });
    expect(env.rateLimit.enabled).toBe(true);
  });

  it('can be turned off explicitly in production', async () => {
    const { env } = await loadEnv({ NODE_ENV: 'production', RATE_LIMIT_ENABLED: 'false' });
    expect(env.rateLimit.enabled).toBe(false);
  });
});

describe('assertProductionSecrets', () => {
  it('does nothing outside production', async () => {
    const { assertProductionSecrets } = await loadEnv({ NODE_ENV: 'development' });
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('refuses to boot production on the development JWT secret', async () => {
    // The default secret is in the repository, so leaving it set means anyone
    // who has read the source can mint a valid admin token.
    const { assertProductionSecrets } = await loadEnv({ NODE_ENV: 'production' });
    expect(() => assertProductionSecrets()).toThrow(/JWT_SECRET/);
  });

  it('is satisfied by a secret the operator chose', async () => {
    const { assertProductionSecrets } = await loadEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-real-random-value',
    });
    expect(() => assertProductionSecrets()).not.toThrow();
  });
});

describe('auth column mapping', () => {
  it('defaults to a conventional Laravel-shaped users table', async () => {
    const { env } = await loadEnv();
    expect(env.auth).toMatchObject({
      table: 'users',
      emailColumn: 'email',
      passwordColumn: 'password',
      roleTable: 'roles',
      roleForeignKey: 'role_id',
      cacheTtlMs: 5000,
    });
  });

  it('is overridable per column', async () => {
    const { env } = await loadEnv({ AUTH_TABLE: 'accounts' });
    expect(env.auth.table).toBe('accounts');
  });
});
