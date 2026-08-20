import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../server/auth';
// Only ever used to *build* a rejection here, never to assert identity against
// one thrown by the reloaded graph — see `withServerEnv`.
import { HttpError, type DatabaseAdapter } from '../../server/db/types';
import type { Router } from '../../server/http';
import { withServerEnv } from './helpers/env';
import {
  dispatch,
  makeAuth,
  makeDb,
  makeUser,
  registeredRouteCount,
  schemaFor,
  type SpiedAuth,
  type SpiedDb,
} from './helpers/router';

const NO_RATE_LIMIT = { RATE_LIMIT_ENABLED: 'false', OWNED_TABLES: '' };

/**
 * `createRouter` captures `env.rateLimit` when it is built and `ownership.ts`
 * captures `OWNED_TABLES` when it is imported, so the whole graph is reloaded
 * per configuration rather than per test.
 */
async function loadRouter(
  vars: Record<string, string>,
  db: DatabaseAdapter,
  auth: SpiedAuth,
): Promise<Router> {
  const { createRouter } = await withServerEnv(vars, () => import('../../server/routes'));
  return createRouter(db, auth as unknown as Auth);
}

/**
 * Every endpoint that moves table data. `gate` — not `requireAuth` — is what
 * each of these must go through; `requireAuth` alone proves only who the caller
 * is, which is what let any valid token reach any exposed table.
 */
const DATA_ROUTES: Array<[string, string]> = [
  ['GET', '/posts'],
  ['GET', '/posts/1'],
  ['POST', '/posts'],
  ['PATCH', '/posts/1'],
  ['PUT', '/posts/1'],
  ['DELETE', '/posts/1'],
  ['POST', '/posts/bulk-delete'],
];

/** Endpoints that deliberately authenticate without gating on a resource. */
const NON_DATA_ROUTES: Array<[string, string]> = [
  ['GET', '/'],
  ['GET', '/_schema'],
  ['POST', '/auth/login'],
  ['GET', '/auth/me'],
  ['POST', '/auth/refresh'],
  ['POST', '/auth/logout'],
  ['GET', '/permissions'],
  ['GET', '/dashboard/stats'],
];

describe('the gate contract', () => {
  let router: Router;
  let auth: SpiedAuth;

  beforeEach(async () => {
    auth = makeAuth(makeUser([]));
    router = await loadRouter(NO_RATE_LIMIT, makeDb(), auth);
  });

  it('probes every registered route', () => {
    // A tripwire, not a formality: a new endpoint added without a probe fails
    // here, which is the prompt to decide whether it needs `gate`.
    expect(registeredRouteCount(router)).toBe(DATA_ROUTES.length + NON_DATA_ROUTES.length);
  });

  it.each(DATA_ROUTES)('%s %s refuses a caller with no permissions', async (method, path) => {
    await expect(dispatch(router, method, path, { body: { ids: ['1'] } })).rejects.toMatchObject({
      status: 403,
    });
  });

  it.each(DATA_ROUTES)('%s %s refuses an unauthenticated caller', async (method, path) => {
    auth.me.mockRejectedValue(new HttpError(401, 'Unauthenticated.'));

    await expect(dispatch(router, method, path, { body: { ids: ['1'] } })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('checks the ability the route needs, not merely some permission', async () => {
    const db = makeDb();
    const viewer = makeAuth(makeUser(['post.view']));
    const scoped = await loadRouter(NO_RATE_LIMIT, db, viewer);

    await expect(dispatch(scoped, 'GET', '/posts')).resolves.toMatchObject({ status: 200 });
    await expect(dispatch(scoped, 'DELETE', '/posts/1')).rejects.toMatchObject({ status: 403 });
    await expect(dispatch(scoped, 'POST', '/posts')).rejects.toMatchObject({ status: 403 });
    await expect(dispatch(scoped, 'PATCH', '/posts/1')).rejects.toMatchObject({ status: 403 });
  });

  it('names the missing permission in singular form', async () => {
    await expect(dispatch(router, 'DELETE', '/posts/1')).rejects.toMatchObject({
      message: expect.stringContaining('post.delete'),
    });
  });

  it('does not let permission on one resource reach another', async () => {
    const scoped = await loadRouter(NO_RATE_LIMIT, makeDb(), makeAuth(makeUser(['post.view'])));
    await expect(dispatch(scoped, 'GET', '/users')).rejects.toMatchObject({ status: 403 });
  });

  it('authenticates the meta routes', async () => {
    auth.me.mockRejectedValue(new HttpError(401, 'Unauthenticated.'));

    for (const path of ['/_schema', '/permissions', '/dashboard/stats']) {
      await expect(dispatch(router, 'GET', path)).rejects.toMatchObject({ status: 401 });
    }
  });

  it('leaves the health route open', async () => {
    const { body } = await dispatch(router, 'GET', '/');
    expect(body).toMatchObject({ status: 'ok', dialect: 'postgres' });
    expect(auth.me).not.toHaveBeenCalled();
  });
});

describe('list parameters', () => {
  let db: SpiedDb;
  let router: Router;

  beforeEach(async () => {
    db = makeDb();
    router = await loadRouter(NO_RATE_LIMIT, db, makeAuth());
  });

  it('defaults to the first page of 25', async () => {
    await dispatch(router, 'GET', '/posts');
    expect(db.list).toHaveBeenCalledWith('posts', {
      page: 1,
      perPage: 25,
      search: undefined,
      sort: undefined,
      filters: {},
    });
  });

  it('reads page, per_page and search', async () => {
    await dispatch(router, 'GET', '/posts?page=3&per_page=10&search=hello');
    expect(db.list).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ page: 3, perPage: 10, search: 'hello' }),
    );
  });

  it('falls back to defaults for values that are not numbers', async () => {
    await dispatch(router, 'GET', '/posts?page=abc&per_page=0');
    expect(db.list).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ page: 1, perPage: 25 }),
    );
  });

  it('reads a leading minus as descending', async () => {
    await dispatch(router, 'GET', '/posts?sort=-created_at');
    expect(db.list).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ sort: { column: 'created_at', direction: 'desc' } }),
    );
  });

  it('reads a bare column as ascending', async () => {
    await dispatch(router, 'GET', '/posts?sort=title');
    expect(db.list).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ sort: { column: 'title', direction: 'asc' } }),
    );
  });

  it('collects filter[...] and nothing else', async () => {
    await dispatch(router, 'GET', '/posts?filter[status]=published&filter[author_id]=3&page=2');
    expect(db.list).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ filters: { status: 'published', author_id: '3' } }),
    );
  });

  it('passes a cursor through only when present', async () => {
    await dispatch(router, 'GET', '/posts?cursor=abc');
    expect(db.list).toHaveBeenCalledWith('posts', expect.objectContaining({ cursor: 'abc' }));

    db.list.mockClear();
    await dispatch(router, 'GET', '/posts');
    expect(db.list.mock.calls[0][1]).not.toHaveProperty('cursor');
  });
});

describe('list response', () => {
  it('computes last_page from the total', async () => {
    const db = makeDb({ list: vi.fn().mockResolvedValue({ rows: [{ id: '1' }], total: 51 }) });
    const router = await loadRouter(NO_RATE_LIMIT, db, makeAuth());

    const { body } = await dispatch(router, 'GET', '/posts?per_page=25');
    expect(body).toMatchObject({
      data: [{ id: '1' }],
      meta: { total: 51, page: 1, per_page: 25, last_page: 3 },
    });
  });

  it('reports at least one page for an empty table', async () => {
    // `Math.ceil(0 / 25)` is 0, and a pager rendering "page 1 of 0" is wrong.
    const db = makeDb({ list: vi.fn().mockResolvedValue({ rows: [], total: 0 }) });
    const router = await loadRouter(NO_RATE_LIMIT, db, makeAuth());

    const { body } = await dispatch(router, 'GET', '/posts');
    expect(body).toMatchObject({ meta: { last_page: 1 } });
  });

  it('surfaces an approximate count and a cursor when the adapter offers them', async () => {
    const db = makeDb({
      list: vi.fn().mockResolvedValue({
        rows: [],
        total: 5_000_000,
        approximate: true,
        nextCursor: 'next',
      }),
    });
    const router = await loadRouter(NO_RATE_LIMIT, db, makeAuth());

    const { body } = await dispatch(router, 'GET', '/posts');
    expect(body).toMatchObject({ meta: { approximate: true, next_cursor: 'next' } });
  });

  it('omits both keys when the adapter does not', async () => {
    const db = makeDb({ list: vi.fn().mockResolvedValue({ rows: [], total: 2 }) });
    const router = await loadRouter(NO_RATE_LIMIT, db, makeAuth());

    const { body } = await dispatch(router, 'GET', '/posts');
    const meta = (body as { meta: Record<string, unknown> }).meta;
    expect(meta).not.toHaveProperty('approximate');
    expect(meta).not.toHaveProperty('next_cursor');
  });
});

describe('row-level ownership', () => {
  const OWNED = { RATE_LIMIT_ENABLED: 'false', OWNED_TABLES: 'posts:author_id' };

  it('scopes a list to the caller', async () => {
    const db = makeDb();
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.view'])));

    await dispatch(router, 'GET', '/posts');
    expect(db.list).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ filters: { author_id: '7' } }),
    );
  });

  it('cannot be widened by a hand-written filter on the owner column', async () => {
    // The scope is merged *last* for exactly this reason. Reverse the spread in
    // `routes.ts` and this is the only thing that notices.
    const db = makeDb();
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.view'])));

    await dispatch(router, 'GET', '/posts?filter[author_id]=999&filter[status]=published');
    expect(db.list).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ filters: { author_id: '7', status: 'published' } }),
    );
  });

  it('leaves the list unscoped for a caller holding .any', async () => {
    const db = makeDb();
    const user = makeUser(['post.view', 'post.view.any']);
    const router = await loadRouter(OWNED, db, makeAuth(user));

    await dispatch(router, 'GET', '/posts?filter[author_id]=999');
    expect(db.list).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ filters: { author_id: '999' } }),
    );
  });

  it('does not treat .any on its own as permission to reach the route', async () => {
    // `.any` is a modifier on top of the base grant, not a replacement for it:
    // `gate` demands `post.view` and never sees the qualifier. A role granted
    // only `post.view.any` therefore reads nothing at all — worth knowing,
    // because it looks like the more powerful of the two strings.
    const router = await loadRouter(OWNED, makeDb(), makeAuth(makeUser(['post.view.any'])));

    await expect(dispatch(router, 'GET', '/posts')).rejects.toMatchObject({ status: 403 });
  });

  it('is satisfied by a resource wildcard, which covers both', async () => {
    const db = makeDb();
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.*'])));

    await dispatch(router, 'GET', '/posts');
    expect(db.list).toHaveBeenCalledWith('posts', expect.objectContaining({ filters: {} }));
  });

  it('answers 404 when reading somebody else’s row', async () => {
    const db = makeDb({ find: vi.fn().mockResolvedValue({ id: '1', author_id: '999' }) });
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.view'])));

    await expect(dispatch(router, 'GET', '/posts/1')).rejects.toMatchObject({ status: 404 });
  });

  it('stamps the owner on create', async () => {
    const db = makeDb();
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.create'])));

    await dispatch(router, 'POST', '/posts', { body: { title: 'Hi', author_id: 999 } });
    expect(db.insert).toHaveBeenCalledWith('posts', { title: 'Hi', author_id: 7 });
  });

  it('drops an attempt to reassign the owner on update', async () => {
    const db = makeDb({ find: vi.fn().mockResolvedValue({ id: '1', author_id: '7' }) });
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.update'])));

    await dispatch(router, 'PATCH', '/posts/1', { body: { title: 'Hi', author_id: 999 } });
    expect(db.update).toHaveBeenCalledWith('posts', '1', { title: 'Hi' });
  });

  it('refuses to update somebody else’s row before writing anything', async () => {
    const db = makeDb({ find: vi.fn().mockResolvedValue({ id: '1', author_id: '999' }) });
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.update'])));

    await expect(
      dispatch(router, 'PATCH', '/posts/1', { body: { title: 'Hi' } }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('refuses to delete somebody else’s row', async () => {
    const db = makeDb({ find: vi.fn().mockResolvedValue({ id: '1', author_id: '999' }) });
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.delete'])));

    await expect(dispatch(router, 'DELETE', '/posts/1')).rejects.toMatchObject({ status: 404 });
    expect(db.remove).not.toHaveBeenCalled();
  });

  it('checks every id of a bulk delete, not the batch', async () => {
    // Deleting the reachable subset would let a caller learn which ids exist by
    // comparing the deleted count against what they asked for.
    const db = makeDb({
      find: vi
        .fn()
        .mockResolvedValueOnce({ id: '1', author_id: '7' })
        .mockResolvedValueOnce({ id: '2', author_id: '999' }),
    });
    const router = await loadRouter(OWNED, db, makeAuth(makeUser(['post.delete'])));

    await expect(
      dispatch(router, 'POST', '/posts/bulk-delete', { body: { ids: ['1', '2'] } }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.removeMany).not.toHaveBeenCalled();
  });
});

describe('CRUD', () => {
  let db: SpiedDb;
  let auth: SpiedAuth;
  let router: Router;

  beforeEach(async () => {
    db = makeDb();
    auth = makeAuth();
    router = await loadRouter(NO_RATE_LIMIT, db, auth);
  });

  it('answers 201 on create and 200 everywhere else', async () => {
    await expect(dispatch(router, 'POST', '/posts', { body: {} })).resolves.toMatchObject({
      status: 201,
    });
    await expect(dispatch(router, 'GET', '/posts/1')).resolves.toMatchObject({ status: 200 });
    await expect(dispatch(router, 'PATCH', '/posts/1', { body: {} })).resolves.toMatchObject({
      status: 200,
    });
  });

  it('hashes an incoming password on create and on update', async () => {
    await dispatch(router, 'POST', '/users', { body: { password: 'secret' } });
    await dispatch(router, 'PATCH', '/users/1', { body: { password: 'secret' } });

    expect(auth.hashPasswordIn).toHaveBeenCalledTimes(2);
    expect(auth.hashPasswordIn).toHaveBeenCalledWith('users', { password: 'secret' });
  });

  it('answers 404 for a row the adapter does not have', async () => {
    db.find.mockResolvedValue(null);
    await expect(dispatch(router, 'GET', '/posts/1')).rejects.toMatchObject({ status: 404 });
  });

  it('decodes a url-encoded id', async () => {
    await dispatch(router, 'GET', '/posts/a%2Fb');
    expect(db.find).toHaveBeenCalledWith('posts', 'a/b');
  });

  it('routes PUT through the same handler as PATCH', async () => {
    await dispatch(router, 'PUT', '/posts/1', { body: { title: 'Hi' } });
    expect(db.update).toHaveBeenCalledWith('posts', '1', { title: 'Hi' });
  });

  it('treats a bulk delete with no ids as an empty batch', async () => {
    const { body } = await dispatch(router, 'POST', '/posts/bulk-delete', { body: {} });
    expect(db.removeMany).toHaveBeenCalledWith('posts', []);
    expect(body).toMatchObject({ success: true });
  });

  it('stringifies bulk-delete ids', async () => {
    await dispatch(router, 'POST', '/posts/bulk-delete', { body: { ids: [1, 2] } });
    expect(db.removeMany).toHaveBeenCalledWith('posts', ['1', '2']);
  });
});

describe('dashboard stats', () => {
  it('counts only what the caller may view', async () => {
    // A tile reporting "1,204 users" to someone with no `user.view` leaks the
    // size of a table they cannot open.
    const db = makeDb({ count: vi.fn().mockResolvedValue(42) });
    const router = await loadRouter(NO_RATE_LIMIT, db, makeAuth(makeUser(['post.view'])));

    const { body } = await dispatch(router, 'GET', '/dashboard/stats');
    expect(body).toMatchObject({
      data: { users: 0, activeUsers: 0, posts: 42, published: 42, roles: 0 },
    });
  });

  it('reports zero for a table the database does not expose', async () => {
    const db = makeDb({
      resources: vi.fn().mockReturnValue([schemaFor('posts')]),
      count: vi.fn().mockResolvedValue(9),
    });
    const router = await loadRouter(NO_RATE_LIMIT, db, makeAuth());

    const { body } = await dispatch(router, 'GET', '/dashboard/stats');
    expect(body).toMatchObject({ data: { users: 0, roles: 0, posts: 9, tables: 1 } });
  });

  it('reports zero rather than failing when a count throws', async () => {
    const db = makeDb({ count: vi.fn().mockRejectedValue(new Error('no such column')) });
    const router = await loadRouter(NO_RATE_LIMIT, db, makeAuth());

    const { body } = await dispatch(router, 'GET', '/dashboard/stats');
    expect(body).toMatchObject({ data: { users: 0, posts: 0, views: 0 } });
  });

  it('narrows the two qualified counts', async () => {
    const db = makeDb({ count: vi.fn().mockResolvedValue(1) });
    const router = await loadRouter(NO_RATE_LIMIT, db, makeAuth());

    await dispatch(router, 'GET', '/dashboard/stats');
    expect(db.count).toHaveBeenCalledWith('users', { is_active: true });
    expect(db.count).toHaveBeenCalledWith('posts', { status: 'published' });
  });
});

describe('auth routes', () => {
  it('signs in without a token', async () => {
    const auth = makeAuth();
    const router = await loadRouter(NO_RATE_LIMIT, makeDb(), auth);

    const { body } = await dispatch(router, 'POST', '/auth/login', {
      body: { email: 'ada@example.com', password: 'secret' },
    });

    expect(auth.login).toHaveBeenCalledWith('ada@example.com', 'secret');
    expect(body).toMatchObject({ accessToken: 'a' });
  });

  it('coerces missing credentials to empty strings rather than undefined', async () => {
    // `auth.login` decides the 422; handing it `undefined` would make the
    // message depend on how the caller omitted the field.
    const auth = makeAuth();
    const router = await loadRouter(NO_RATE_LIMIT, makeDb(), auth);

    await dispatch(router, 'POST', '/auth/login', { body: {} });
    expect(auth.login).toHaveBeenCalledWith('', '');
  });

  it('logs out without consulting the token', async () => {
    const auth = makeAuth();
    const router = await loadRouter(NO_RATE_LIMIT, makeDb(), auth);

    const { body } = await dispatch(router, 'POST', '/auth/logout');
    expect(body).toEqual({ success: true });
    expect(auth.me).not.toHaveBeenCalled();
  });

  it('passes the refresh token through', async () => {
    const auth = makeAuth();
    const router = await loadRouter(NO_RATE_LIMIT, makeDb(), auth);

    await dispatch(router, 'POST', '/auth/refresh', { body: { refreshToken: 'r' } });
    expect(auth.refresh).toHaveBeenCalledWith('r');
  });

  it('publishes the permission catalogue', async () => {
    const router = await loadRouter(NO_RATE_LIMIT, makeDb(), makeAuth());
    const { body } = await dispatch(router, 'GET', '/permissions');

    expect((body as { data: string[] }).data).toEqual(
      expect.arrayContaining(['post.view', 'post.create', 'user.delete', 'role.update']),
    );
  });
});

describe('rate limiting', () => {
  const LIMITED = {
    RATE_LIMIT_ENABLED: 'true',
    RATE_LIMIT_LOGIN: '2',
    RATE_LIMIT_LOGIN_WINDOW: '300',
    RATE_LIMIT_API: '3',
    RATE_LIMIT_API_WINDOW: '60',
    OWNED_TABLES: '',
  };

  it('is off when the environment says so', async () => {
    const router = await loadRouter(NO_RATE_LIMIT, makeDb(), makeAuth());

    for (let i = 0; i < 50; i += 1) {
      await expect(dispatch(router, 'GET', '/posts')).resolves.toBeDefined();
    }
  });

  /**
   * The budget is only spent by attempts that fail — `throttleLogin` runs
   * before `auth.login`, and a success resets both keys — so every one of these
   * has to sign in wrongly to reach the limit at all.
   */
  async function limitedWithBadPassword() {
    const auth = makeAuth();
    auth.login.mockRejectedValue(new HttpError(401, 'These credentials do not match our records.'));
    return loadRouter(LIMITED, makeDb(), auth);
  }

  it('throttles sign-in by address', async () => {
    const router = await limitedWithBadPassword();
    const attempt = () =>
      dispatch(router, 'POST', '/auth/login', {
        body: { email: 'ada@example.com', password: 'wrong' },
        ip: '10.0.0.1',
      });

    await expect(attempt()).rejects.toMatchObject({ status: 401 });
    await expect(attempt()).rejects.toMatchObject({ status: 401 });
    await expect(attempt()).rejects.toMatchObject({ status: 429 });
  });

  it('throttles sign-in by address even as the email rotates', async () => {
    // Otherwise cycling addresses is a free pass around the per-account budget.
    const router = await limitedWithBadPassword();
    const attempt = (email: string) =>
      dispatch(router, 'POST', '/auth/login', { body: { email, password: 'x' }, ip: '10.0.0.1' });

    await expect(attempt('a@example.com')).rejects.toMatchObject({ status: 401 });
    await expect(attempt('b@example.com')).rejects.toMatchObject({ status: 401 });
    await expect(attempt('c@example.com')).rejects.toMatchObject({ status: 429 });
  });

  it('throttles sign-in by account even as the address rotates', async () => {
    // And otherwise a botnet walks the password list one address per try.
    const router = await limitedWithBadPassword();
    const attempt = (ip: string) =>
      dispatch(router, 'POST', '/auth/login', {
        body: { email: 'ada@example.com', password: 'x' },
        ip,
      });

    await expect(attempt('10.0.0.1')).rejects.toMatchObject({ status: 401 });
    await expect(attempt('10.0.0.2')).rejects.toMatchObject({ status: 401 });
    await expect(attempt('10.0.0.3')).rejects.toMatchObject({ status: 429 });
  });

  it('keys the account budget case-insensitively', async () => {
    const router = await limitedWithBadPassword();
    const attempt = (email: string, ip: string) =>
      dispatch(router, 'POST', '/auth/login', { body: { email, password: 'x' }, ip });

    await expect(attempt('ada@example.com', '10.0.0.1')).rejects.toMatchObject({ status: 401 });
    await expect(attempt('ADA@example.com', '10.0.0.2')).rejects.toMatchObject({ status: 401 });
    await expect(attempt('Ada@Example.com', '10.0.0.3')).rejects.toMatchObject({ status: 429 });
  });

  it('clears the budget once a sign-in succeeds', async () => {
    // A user who fat-fingered twice must not still be locked out when they get
    // it right on the third try.
    const auth = makeAuth();
    const router = await loadRouter(LIMITED, makeDb(), auth);
    const attempt = () =>
      dispatch(router, 'POST', '/auth/login', {
        body: { email: 'ada@example.com', password: 'x' },
        ip: '10.0.0.1',
      });

    auth.login.mockRejectedValueOnce(Object.assign(new Error('bad'), { status: 401 }));
    await expect(attempt()).rejects.toMatchObject({ status: 401 });
    await attempt();

    await expect(attempt()).resolves.toBeDefined();
    await expect(attempt()).resolves.toBeDefined();
  });

  it('gives refresh its own budget, so it is not the unthrottled way back in', async () => {
    const router = await loadRouter(LIMITED, makeDb(), makeAuth());
    const refresh = () =>
      dispatch(router, 'POST', '/auth/refresh', { body: { refreshToken: 'r' }, ip: '10.0.0.9' });

    await refresh();
    await refresh();
    await expect(refresh()).rejects.toMatchObject({ status: 429 });
  });

  it('throttles data routes on a separate, larger budget', async () => {
    const router = await loadRouter(LIMITED, makeDb(), makeAuth());
    const read = () => dispatch(router, 'GET', '/posts', { ip: '10.0.0.5' });

    await read();
    await read();
    await read();
    await expect(read()).rejects.toMatchObject({ status: 429 });
  });

  it('does not let a data burst spend the sign-in budget', async () => {
    const router = await loadRouter(LIMITED, makeDb(), makeAuth());

    await dispatch(router, 'GET', '/posts', { ip: '10.0.0.7' });
    await dispatch(router, 'GET', '/posts', { ip: '10.0.0.7' });
    await dispatch(router, 'GET', '/posts', { ip: '10.0.0.7' });

    await expect(
      dispatch(router, 'POST', '/auth/login', {
        body: { email: 'ada@example.com', password: 'x' },
        ip: '10.0.0.7',
      }),
    ).resolves.toBeDefined();
  });

  it('sends a Retry-After a client can act on', async () => {
    const router = await loadRouter(LIMITED, makeDb(), makeAuth());
    const read = () => dispatch(router, 'GET', '/posts', { ip: '10.0.0.6' });

    await read();
    await read();
    await read();
    await expect(read()).rejects.toMatchObject({ retryAfter: expect.any(Number) });
  });
});
