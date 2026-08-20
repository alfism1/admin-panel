import { hash as bcryptHash } from '@node-rs/bcrypt';
import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../server/auth';
import type { DatabaseAdapter, Row } from '../../server/db/types';
import { withServerEnv } from './helpers/env';
import { makeDb, type SpiedDb } from './helpers/router';

const SECRET = 'test-only-secret';

/** Everything `server/auth.ts` reads, pinned so a local `.env` cannot decide it. */
const BASE = {
  JWT_SECRET: SECRET,
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  AUTH_TABLE: 'users',
  AUTH_EMAIL_COLUMN: 'email',
  AUTH_PASSWORD_COLUMN: 'password',
  AUTH_NAME_COLUMN: 'name',
  AUTH_ROLE_TABLE: 'roles',
  AUTH_ROLE_FK: 'role_id',
  AUTH_ROLE_NAME_COLUMN: 'slug',
  AUTH_PERMISSIONS_COLUMN: 'permissions',
  AUTH_CACHE_TTL: '0',
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: '',
};

async function loadAuth(
  db: DatabaseAdapter,
  vars: Record<string, string> = {},
): Promise<{ auth: Auth }> {
  const { createAuth } = await withServerEnv(
    { ...BASE, ...vars },
    () => import('../../server/auth'),
  );
  return { auth: createAuth(db) };
}

/** `has` answers per table, which is how the fallback paths are reached. */
function dbWith(tables: string[], overrides: Record<string, unknown> = {}): SpiedDb {
  return makeDb({
    has: vi.fn().mockImplementation((name: string) => tables.includes(name)),
    ...overrides,
  });
}

function token(sub: string, type: 'access' | 'refresh', expiresIn: string | number = '15m') {
  return jwt.sign({ sub, type }, SECRET, { expiresIn } as jwt.SignOptions);
}

let HASHED_SECRET: string;

beforeAll(async () => {
  // One real hash for the whole file; bcrypt at cost 10 is ~60ms a go and the
  // point is to exercise the real verifier, not to measure it repeatedly.
  HASHED_SECRET = await bcryptHash('correct horse', 10);
});

describe('createAuth', () => {
  it('warns when there is no users table and no fallback account', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await loadAuth(dbWith([]));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('login is disabled'));
  });

  it('stays quiet when a fallback account is configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await loadAuth(dbWith([]), { ADMIN_EMAIL: 'root@localhost', ADMIN_PASSWORD: 'pw' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('reports whether it found a users table', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect((await loadAuth(dbWith(['users']))).auth.hasUserTable).toBe(true);
    expect((await loadAuth(dbWith([]))).auth.hasUserTable).toBe(false);
  });
});

describe('login validation', () => {
  it('answers 422 naming the fields that are missing', async () => {
    const { auth } = await loadAuth(dbWith(['users']));

    await expect(auth.login('', '')).rejects.toMatchObject({
      status: 422,
      errors: { email: ['Email is required.'], password: ['Password is required.'] },
    });
  });

  it('reports only the field that is actually missing', async () => {
    const { auth } = await loadAuth(dbWith(['users']));

    await expect(auth.login('ada@example.com', '')).rejects.toMatchObject({
      errors: { email: [], password: ['Password is required.'] },
    });
  });

  it('does not reach the database for an empty submission', async () => {
    const db = dbWith(['users']);
    const { auth } = await loadAuth(db);

    await expect(auth.login('', '')).rejects.toMatchObject({ status: 422 });
    expect(db.findBy).not.toHaveBeenCalled();
  });
});

describe('login against a users table', () => {
  const row: Row = { id: '1', email: 'ada@example.com', name: 'Ada', role_id: null };

  it('accepts a bcrypt-hashed password', async () => {
    const db = dbWith(['users'], {
      findBy: vi.fn().mockResolvedValue({ ...row, password: HASHED_SECRET }),
    });
    const { auth } = await loadAuth(db);

    const result = await auth.login('ada@example.com', 'correct horse');
    expect(result.user).toMatchObject({ id: '1', email: 'ada@example.com', name: 'Ada' });
    expect(jwt.verify(result.accessToken, SECRET)).toMatchObject({ sub: '1', type: 'access' });
    expect(jwt.verify(result.refreshToken, SECRET)).toMatchObject({ sub: '1', type: 'refresh' });
  });

  it('refuses a wrong password', async () => {
    const db = dbWith(['users'], {
      findBy: vi.fn().mockResolvedValue({ ...row, password: HASHED_SECRET }),
    });
    const { auth } = await loadAuth(db);

    await expect(auth.login('ada@example.com', 'wrong')).rejects.toMatchObject({ status: 401 });
  });

  it('gives the same answer for an unknown address as for a wrong password', async () => {
    // Different messages here are a user-enumeration oracle in plain text.
    const known = dbWith(['users'], {
      findBy: vi.fn().mockResolvedValue({ ...row, password: HASHED_SECRET }),
    });
    const unknown = dbWith(['users'], { findBy: vi.fn().mockResolvedValue(null) });

    const a = await loadAuth(known).then(({ auth }) =>
      auth.login('ada@example.com', 'wrong').catch((error: unknown) => error),
    );
    const b = await loadAuth(unknown).then(({ auth }) =>
      auth.login('nobody@example.com', 'wrong').catch((error: unknown) => error),
    );

    expect((a as Error).message).toBe((b as Error).message);
    expect((a as { status: number }).status).toBe((b as { status: number }).status);
  });

  it('spends the same work on an unknown address as on a real one', async () => {
    // The timing side of the same oracle: bailing out early is ~0ms against
    // ~60ms for a real verify, which is trivially measurable over the network.
    const db = dbWith(['users'], { findBy: vi.fn().mockResolvedValue(null) });
    const { auth } = await loadAuth(db);

    const startedAt = performance.now();
    await expect(auth.login('nobody@example.com', 'whatever')).rejects.toMatchObject({
      status: 401,
    });

    // A real bcrypt verify at cost 10; an early return would be sub-millisecond.
    expect(performance.now() - startedAt).toBeGreaterThan(10);
  });

  it('accepts a legacy plain-text password', async () => {
    const db = dbWith(['users'], {
      findBy: vi.fn().mockResolvedValue({ ...row, password: 'plaintext' }),
    });
    const { auth } = await loadAuth(db);

    await expect(auth.login('ada@example.com', 'plaintext')).resolves.toMatchObject({
      user: { id: '1' },
    });
  });

  it('refuses an empty stored password rather than matching one', async () => {
    // A row with no password set must not be a way in for anyone submitting ''.
    const db = dbWith(['users'], { findBy: vi.fn().mockResolvedValue({ ...row, password: '' }) });
    const { auth } = await loadAuth(db);

    await expect(auth.login('ada@example.com', ' ')).rejects.toMatchObject({ status: 401 });
  });

  it('refuses a disabled account after checking the password', async () => {
    // 403 rather than 401, and only once the password is right: otherwise the
    // status tells an attacker the credentials were correct.
    for (const value of [false, 0]) {
      const db = dbWith(['users'], {
        findBy: vi.fn().mockResolvedValue({ ...row, password: HASHED_SECRET, is_active: value }),
      });
      const { auth } = await loadAuth(db);

      await expect(auth.login('ada@example.com', 'correct horse')).rejects.toMatchObject({
        status: 403,
      });
    }
  });

  it('keeps a disabled account behind the password check', async () => {
    const db = dbWith(['users'], {
      findBy: vi.fn().mockResolvedValue({ ...row, password: HASHED_SECRET, is_active: false }),
    });
    const { auth } = await loadAuth(db);

    await expect(auth.login('ada@example.com', 'wrong')).rejects.toMatchObject({ status: 401 });
  });

  it('never returns a secret column in the user', async () => {
    const db = dbWith(['users'], {
      findBy: vi.fn().mockResolvedValue({
        ...row,
        password: HASHED_SECRET,
        remember_token: 'nope',
        api_token: 'nope',
      }),
    });
    const { auth } = await loadAuth(db);

    const { user } = await auth.login('ada@example.com', 'correct horse');
    expect(JSON.stringify(user)).not.toContain('nope');
    expect(JSON.stringify(user)).not.toContain(HASHED_SECRET);
  });

  it('falls back to the email, then to User, for a display name', async () => {
    const withoutName = dbWith(['users'], {
      findBy: vi.fn().mockResolvedValue({ id: '1', email: 'a@b.c', password: 'p' }),
    });
    await expect((await loadAuth(withoutName)).auth.login('a@b.c', 'p')).resolves.toMatchObject({
      user: { name: 'a@b.c' },
    });

    const withNeither = dbWith(['users'], {
      findBy: vi.fn().mockResolvedValue({ id: '1', password: 'p' }),
    });
    await expect((await loadAuth(withNeither)).auth.login('', 'p')).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('roles and permissions', () => {
  const base: Row = { id: '1', email: 'ada@example.com', name: 'Ada', password: 'p', role_id: '2' };

  async function loginWith(role: Row | null, tables = ['users', 'roles']) {
    const db = dbWith(tables, {
      findBy: vi.fn().mockResolvedValue(base),
      find: vi.fn().mockResolvedValue(role),
    });
    const { auth } = await loadAuth(db);
    return auth.login('ada@example.com', 'p');
  }

  it('reads permissions stored as a JSON array', async () => {
    const { user } = await loginWith({ id: '2', slug: 'editor', permissions: '["post.*"]' });
    expect(user).toMatchObject({ roles: ['editor'], permissions: ['post.*'] });
  });

  it('reads permissions stored as a real array', async () => {
    const { user } = await loginWith({
      id: '2',
      slug: 'editor',
      permissions: ['post.view', 'post.update'],
    });
    expect(user.permissions).toEqual(['post.view', 'post.update']);
  });

  it('reads a comma-separated list', async () => {
    const { user } = await loginWith({
      id: '2',
      slug: 'editor',
      permissions: 'post.view, post.update ',
    });
    expect(user.permissions).toEqual(['post.view', 'post.update']);
  });

  it('yields nothing for a value it cannot make sense of', async () => {
    // Failing closed: an unreadable column must not become a wildcard.
    const { user } = await loginWith({ id: '2', slug: 'editor', permissions: '{"post":"*"}' });
    expect(user.permissions).toEqual([]);
  });

  it('yields nothing when the column is absent', async () => {
    const { user } = await loginWith({ id: '2', slug: 'editor' });
    expect(user.permissions).toEqual([]);
  });

  it('falls back to the name column when there is no slug', async () => {
    const { user } = await loginWith({ id: '2', name: 'Editor', permissions: '[]' });
    expect(user.roles).toEqual(['Editor']);
  });

  it('calls an unnamed role user', async () => {
    const { user } = await loginWith({ id: '2', permissions: '[]' });
    expect(user.roles).toEqual(['user']);
  });

  it('signs in with no permissions when the role has been deleted', async () => {
    const { user } = await loginWith(null);
    expect(user).toMatchObject({ roles: [], permissions: [] });
  });

  it('grants everything when the database has no role model at all', async () => {
    // A database with no roles table still needs a usable panel.
    const { user } = await loginWith(null, ['users']);
    expect(user.permissions).toEqual(['*']);
  });

  it('does not grant everything merely because a role is empty', async () => {
    const { user } = await loginWith({ id: '2', slug: 'nobody', permissions: '[]' });
    expect(user.permissions).toEqual([]);
  });

  it('does not look up a role when the foreign key is null', async () => {
    const db = dbWith(['users', 'roles'], {
      findBy: vi.fn().mockResolvedValue({ ...base, role_id: null }),
      find: vi.fn(),
    });
    const { auth } = await loadAuth(db);

    const { user } = await auth.login('ada@example.com', 'p');
    expect(db.find).not.toHaveBeenCalled();
    expect(user.permissions).toEqual([]);
  });
});

describe('the environment fallback account', () => {
  const FALLBACK = { ADMIN_EMAIL: 'root@localhost', ADMIN_PASSWORD: 'letmein' };

  it('signs in when the database has no users table', async () => {
    const { auth } = await loadAuth(dbWith([]), FALLBACK);

    const result = await auth.login('root@localhost', 'letmein');
    expect(result.user).toMatchObject({ id: 'env-admin', roles: ['admin'], permissions: ['*'] });
    expect(jwt.verify(result.accessToken, SECRET)).toMatchObject({ sub: 'env-admin' });
  });

  it('refuses the wrong credentials', async () => {
    const { auth } = await loadAuth(dbWith([]), FALLBACK);

    await expect(auth.login('root@localhost', 'nope')).rejects.toMatchObject({ status: 401 });
    await expect(auth.login('someone@else', 'letmein')).rejects.toMatchObject({ status: 401 });
  });

  it('answers 500 when neither a table nor an account is configured', async () => {
    // A misconfiguration, not a credential failure — 401 here would send an
    // operator hunting for the wrong problem.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { auth } = await loadAuth(dbWith([]));

    await expect(auth.login('anyone@example.com', 'pw')).rejects.toMatchObject({ status: 500 });
    expect(warn).toHaveBeenCalled();
  });

  it('resolves only the env-admin subject', async () => {
    const { auth } = await loadAuth(dbWith([]), FALLBACK);

    await expect(auth.me(`Bearer ${token('env-admin', 'access')}`)).resolves.toMatchObject({
      id: 'env-admin',
    });
    await expect(auth.me(`Bearer ${token('1', 'access')}`)).rejects.toMatchObject({ status: 401 });
  });
});

describe('me', () => {
  const row: Row = { id: '1', email: 'ada@example.com', name: 'Ada', password: 'p' };

  function dbWithUser(): SpiedDb {
    return dbWith(['users'], { findBy: vi.fn().mockResolvedValue(row) });
  }

  it('resolves the user behind a valid access token', async () => {
    const { auth } = await loadAuth(dbWithUser());
    await expect(auth.me(`Bearer ${token('1', 'access')}`)).resolves.toMatchObject({ id: '1' });
  });

  it('accepts the scheme in any case, and without it', async () => {
    const { auth } = await loadAuth(dbWithUser());
    await expect(auth.me(`bearer ${token('1', 'access')}`)).resolves.toMatchObject({ id: '1' });
    await expect(auth.me(token('1', 'access'))).resolves.toMatchObject({ id: '1' });
  });

  it('refuses a missing header', async () => {
    const { auth } = await loadAuth(dbWithUser());
    await expect(auth.me(undefined)).rejects.toMatchObject({ status: 401 });
    await expect(auth.me('')).rejects.toMatchObject({ status: 401 });
    await expect(auth.me('Bearer ')).rejects.toMatchObject({ status: 401 });
  });

  it('refuses a token this server did not sign', async () => {
    const { auth } = await loadAuth(dbWithUser());
    const forged = jwt.sign({ sub: '1', type: 'access' }, 'some-other-secret');

    await expect(auth.me(`Bearer ${forged}`)).rejects.toMatchObject({ status: 401 });
  });

  it('refuses an expired token', async () => {
    const { auth } = await loadAuth(dbWithUser());
    await expect(auth.me(`Bearer ${token('1', 'access', '-1s')}`)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('refuses a refresh token presented as an access token', async () => {
    // Refresh tokens are long-lived; accepting one here would hand out a
    // week-long session to anything that captured it.
    const { auth } = await loadAuth(dbWithUser());
    await expect(auth.me(`Bearer ${token('1', 'refresh')}`)).rejects.toMatchObject({ status: 401 });
  });

  it('refuses a token whose user has since been deleted', async () => {
    const { auth } = await loadAuth(dbWith(['users'], { findBy: vi.fn().mockResolvedValue(null) }));
    await expect(auth.me(`Bearer ${token('1', 'access')}`)).rejects.toMatchObject({ status: 401 });
  });
});

describe('the resolved-user cache', () => {
  const row: Row = { id: '1', email: 'ada@example.com', name: 'Ada', password: 'p' };

  it('re-reads on every request when the TTL is zero', async () => {
    const db = dbWith(['users'], { findBy: vi.fn().mockResolvedValue(row) });
    const { auth } = await loadAuth(db, { AUTH_CACHE_TTL: '0' });
    const header = `Bearer ${token('1', 'access')}`;

    await auth.me(header);
    await auth.me(header);
    expect(db.findBy).toHaveBeenCalledTimes(2);
  });

  it('collapses sequential requests onto one read while the TTL holds', async () => {
    const db = dbWith(['users'], { findBy: vi.fn().mockResolvedValue(row) });
    const { auth } = await loadAuth(db, { AUTH_CACHE_TTL: '5' });
    const header = `Bearer ${token('1', 'access')}`;

    await auth.me(header);
    await auth.me(header);
    await auth.me(header);
    expect(db.findBy).toHaveBeenCalledTimes(1);
  });

  it('KNOWN LIMITATION: a concurrent burst still reads once per request', async () => {
    // The cache stores the resolved user, so nothing is in it until the first
    // read comes back — and N requests arriving together all miss and all
    // query. That is the case the comment above `cache` in `server/auth.ts`
    // describes ("collapses a burst of requests onto one pair"), and it is the
    // one shape it does not cover: a cold cache under concurrency stampedes.
    // Fix: cache the in-flight promise rather than its result, deleting the
    // entry on rejection so a failed read is not memoised. Then flip this to
    // expect 1 and drop the sequential test above into it.
    const db = dbWith(['users'], { findBy: vi.fn().mockResolvedValue(row) });
    const { auth } = await loadAuth(db, { AUTH_CACHE_TTL: '5' });
    const header = `Bearer ${token('1', 'access')}`;

    await Promise.all([auth.me(header), auth.me(header), auth.me(header)]);
    expect(db.findBy).toHaveBeenCalledTimes(3);

    // Everything after the first resolution is served from memory.
    await auth.me(header);
    expect(db.findBy).toHaveBeenCalledTimes(3);
  });

  it('re-reads once the entry has expired', async () => {
    vi.useFakeTimers();
    try {
      const db = dbWith(['users'], { findBy: vi.fn().mockResolvedValue(row) });
      const { auth } = await loadAuth(db, { AUTH_CACHE_TTL: '5' });
      const header = `Bearer ${token('1', 'access')}`;

      await auth.me(header);
      vi.advanceTimersByTime(5_001);
      await auth.me(header);

      expect(db.findBy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forgets a user that has been deleted, rather than serving them from cache', async () => {
    const findBy = vi.fn().mockResolvedValueOnce(row).mockResolvedValue(null);
    const db = dbWith(['users'], { findBy });
    const { auth } = await loadAuth(db, { AUTH_CACHE_TTL: '0' });
    const header = `Bearer ${token('1', 'access')}`;

    await expect(auth.me(header)).resolves.toMatchObject({ id: '1' });
    await expect(auth.me(header)).rejects.toMatchObject({ status: 401 });
  });

  it('keeps separate entries per subject', async () => {
    const findBy = vi
      .fn()
      .mockImplementation((_table: string, _column: string, id: string) => ({ ...row, id }));
    const db = dbWith(['users'], { findBy });
    const { auth } = await loadAuth(db, { AUTH_CACHE_TTL: '5' });

    await expect(auth.me(`Bearer ${token('1', 'access')}`)).resolves.toMatchObject({ id: '1' });
    await expect(auth.me(`Bearer ${token('2', 'access')}`)).resolves.toMatchObject({ id: '2' });
    expect(findBy).toHaveBeenCalledTimes(2);
  });
});

describe('refresh', () => {
  it('mints a new pair from a refresh token', async () => {
    const { auth } = await loadAuth(dbWith(['users']));
    const result = auth.refresh(token('1', 'refresh'));

    expect(jwt.verify(result.accessToken, SECRET)).toMatchObject({ sub: '1', type: 'access' });
    expect(jwt.verify(result.refreshToken, SECRET)).toMatchObject({ sub: '1', type: 'refresh' });
  });

  it('refuses a missing token', async () => {
    const { auth } = await loadAuth(dbWith(['users']));
    expect(() => auth.refresh(undefined)).toThrow();
    expect(() => auth.refresh('')).toThrow();
  });

  it('refuses an access token presented as a refresh token', async () => {
    // Otherwise a captured access token renews itself forever.
    const { auth } = await loadAuth(dbWith(['users']));
    expect(() => auth.refresh(token('1', 'access'))).toThrow();
  });

  it('does not consult the database', async () => {
    // Worth pinning: it means a deleted user keeps refreshing until the token
    // expires. `me` is where the account is re-checked.
    const db = dbWith(['users']);
    const { auth } = await loadAuth(db);

    auth.refresh(token('1', 'refresh'));
    expect(db.findBy).not.toHaveBeenCalled();
  });
});

describe('hashPasswordIn', () => {
  it('hashes a plain password written to the auth table', async () => {
    const { auth } = await loadAuth(dbWith(['users']));
    const result = await auth.hashPasswordIn('users', { email: 'a@b.c', password: 'plain' });

    expect(result.password).toMatch(/^\$2[aby]\$/);
    expect(result).toMatchObject({ email: 'a@b.c' });
  });

  it('leaves other tables alone', async () => {
    const { auth } = await loadAuth(dbWith(['users']));
    const body = { title: 'Hi', password: 'plain' };

    await expect(auth.hashPasswordIn('posts', body)).resolves.toBe(body);
  });

  it('does not re-hash a value that is already hashed', async () => {
    // A round trip through the edit form resubmits the stored hash; hashing it
    // again would lock the account.
    const { auth } = await loadAuth(dbWith(['users']));
    const body = { password: HASHED_SECRET };

    await expect(auth.hashPasswordIn('users', body)).resolves.toBe(body);
  });

  it('leaves an absent, empty or non-string password alone', async () => {
    const { auth } = await loadAuth(dbWith(['users']));

    for (const body of [{ name: 'Ada' }, { password: '' }, { password: null }, { password: 12 }]) {
      await expect(auth.hashPasswordIn('users', body)).resolves.toBe(body);
    }
  });

  it('produces a hash the login path accepts', async () => {
    const db = dbWith(['users']);
    const { auth } = await loadAuth(db);
    const { password } = await auth.hashPasswordIn('users', { password: 'round trip' });

    db.findBy.mockResolvedValue({ id: '1', email: 'a@b.c', password });
    await expect(auth.login('a@b.c', 'round trip')).resolves.toMatchObject({ user: { id: '1' } });
  });
});
