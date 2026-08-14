import { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockAdapter, mockPermissionCatalog } from '@/core/data/mock/mockAdapter';
import { collection, resetDatabase, writeCollection } from '@/core/data/mock/db';

type Row = Record<string, unknown>;

async function request(
  method: string,
  url: string,
  { params, data }: { params?: Record<string, unknown>; data?: unknown } = {},
): Promise<{ status: number; data: Row }> {
  const config = {
    method,
    url,
    params,
    data: data === undefined ? undefined : JSON.stringify(data),
    headers: new AxiosHeaders(),
  } as InternalAxiosRequestConfig;

  const response = await mockAdapter(config);
  return { status: response.status, data: response.data as Row };
}

async function expectFailure(promise: Promise<unknown>, status: number) {
  await expect(promise).rejects.toSatisfy((error: AxiosError) => error.response?.status === status);
}

/** Logs in as the seeded admin so protected routes have a session. */
async function login() {
  return request('post', 'auth/login', {
    data: { email: 'admin@example.com', password: 'password' },
  });
}

beforeEach(async () => {
  resetDatabase();
  await request('post', 'auth/logout');
});

describe('auth', () => {
  it('signs in a seeded user and returns tokens', async () => {
    const { data } = await login();

    expect(data.accessToken).toBe('mock-access-token');
    expect(data.refreshToken).toBe('mock-refresh-token');
    expect(data.user).toMatchObject({ email: 'admin@example.com' });
  });

  it('exposes the role slug and permissions on the session user', async () => {
    const { data } = await login();
    const user = data.user as Row;

    expect(Array.isArray(user.roles)).toBe(true);
    expect(Array.isArray(user.permissions)).toBe(true);
  });

  it('rejects an unknown email', async () => {
    await expectFailure(
      request('post', 'auth/login', { data: { email: 'nobody@example.com', password: 'x' } }),
      401,
    );
  });

  it('rejects a wrong password', async () => {
    await expectFailure(
      request('post', 'auth/login', { data: { email: 'admin@example.com', password: 'wrong' } }),
      401,
    );
  });

  it('refuses a disabled account with 403, not 401', async () => {
    const disabled = collection('users').find((user) => !user.is_active);
    expect(disabled).toBeDefined();

    await expectFailure(
      request('post', 'auth/login', {
        data: { email: disabled!.email, password: disabled!.password },
      }),
      403,
    );
  });

  it('returns the current user after signing in', async () => {
    await login();

    const { data } = await request('get', 'auth/me');
    expect(data).toMatchObject({ email: 'admin@example.com' });
  });

  it('rejects /auth/me without a session', async () => {
    await expectFailure(request('get', 'auth/me'), 401);
  });

  it('refreshes an active session', async () => {
    await login();

    const { data } = await request('post', 'auth/refresh');
    expect(data.accessToken).toBe('mock-access-token');
  });

  it('rejects a refresh with no session', async () => {
    await expectFailure(request('post', 'auth/refresh'), 401);
  });

  it('ends the session on logout', async () => {
    await login();
    await request('post', 'auth/logout');

    await expectFailure(request('get', 'auth/me'), 401);
  });

  it('404s an unknown auth route', async () => {
    await expectFailure(request('get', 'auth/nonsense'), 404);
  });

  it('never returns the password hash', async () => {
    const { data } = await request('get', 'users');
    const rows = data.data as Row[];

    expect(rows[0]).not.toHaveProperty('password');
  });
});

describe('collections', () => {
  it('lists a collection with pagination metadata', async () => {
    const { data } = await request('get', 'users', { params: { page: 1, per_page: 2 } });

    expect((data.data as Row[]).length).toBeLessThanOrEqual(2);
    expect(data.meta).toMatchObject({ page: 1, per_page: 2 });
  });

  it('404s an unknown collection', async () => {
    await expectFailure(request('get', 'widgets'), 404);
  });

  it('searches by the collection search fields', async () => {
    const { data } = await request('get', 'users', { params: { search: 'admin@example.com' } });

    expect((data.data as Row[]).length).toBeGreaterThan(0);
  });

  it('applies a filter[...] parameter', async () => {
    const { data } = await request('get', 'users', { params: { 'filter[is_active]': 'false' } });

    expect((data.data as Row[]).every((row) => row.is_active === false)).toBe(true);
  });

  it('sorts ascending and descending', async () => {
    const asc = await request('get', 'users', { params: { sort: 'name', per_page: 100 } });
    const desc = await request('get', 'users', { params: { sort: '-name', per_page: 100 } });

    const first = (asc.data.data as Row[])[0].name;
    const last = [...(desc.data.data as Row[])][0].name;
    expect(String(first) <= String(last)).toBe(true);
  });

  it('decorates a user with its role', async () => {
    const { data } = await request('get', 'users');
    const row = (data.data as Row[])[0];

    expect(row.role).toMatchObject({ slug: expect.any(String) });
  });

  it('decorates a post with its author', async () => {
    const { data } = await request('get', 'posts');
    const row = (data.data as Row[])[0];

    expect(row.author).toMatchObject({ name: expect.any(String) });
  });

  it('reads a single record', async () => {
    const { data } = await request('get', 'users/1');

    expect((data.data as Row).id).toBe(1);
  });

  it('404s a missing record', async () => {
    await expectFailure(request('get', 'users/99999'), 404);
  });
});

describe('writes', () => {
  it('creates a record with a fresh id and timestamps', async () => {
    const { status, data } = await request('post', 'users', {
      data: { name: 'New User', email: 'new@example.com', role_id: 1, is_active: true },
    });

    const created = data.data as Row;
    expect(status).toBe(201);
    expect(created.id).toEqual(expect.any(Number));
    expect(created.created_at).toEqual(expect.any(String));
  });

  it('prepends the new record to the collection', async () => {
    await request('post', 'users', {
      data: { name: 'New User', email: 'new@example.com', role_id: 1 },
    });

    const { data } = await request('get', 'users');
    expect((data.data as Row[])[0]).toMatchObject({ name: 'New User' });
  });

  it('rejects a duplicate email with a 422 field error', async () => {
    await expect(
      request('post', 'users', { data: { name: 'Clone', email: 'admin@example.com' } }),
    ).rejects.toSatisfy((error: AxiosError) => {
      const body = error.response?.data as { errors?: Record<string, string[]> };
      return error.response?.status === 422 && Boolean(body.errors?.email);
    });
  });

  it('updates a record and bumps updated_at', async () => {
    const { data } = await request('patch', 'users/1', { data: { name: 'Renamed' } });

    expect((data.data as Row).name).toBe('Renamed');
    expect((data.data as Row).updated_at).toEqual(expect.any(String));
  });

  it('accepts PUT as well as PATCH', async () => {
    const { data } = await request('put', 'users/1', { data: { name: 'Replaced' } });

    expect((data.data as Row).name).toBe('Replaced');
  });

  it('lets a record keep its own email on update', async () => {
    const existing = collection('users')[0];

    const { data } = await request('patch', `users/${existing.id}`, {
      data: { email: existing.email },
    });

    expect((data.data as Row).email).toBe(existing.email);
  });

  it('rejects taking another record’s email', async () => {
    const [first, second] = collection('users');

    await expectFailure(
      request('patch', `users/${first.id}`, { data: { email: second.email } }),
      422,
    );
  });

  it('404s updating a missing record', async () => {
    await expectFailure(request('patch', 'users/99999', { data: { name: 'x' } }), 404);
  });

  it('deletes a record', async () => {
    const before = collection('users').length;

    await request('delete', 'users/1');

    expect(collection('users')).toHaveLength(before - 1);
  });

  it('404s deleting a missing record', async () => {
    await expectFailure(request('delete', 'users/99999'), 404);
  });

  it('bulk-deletes by id', async () => {
    const before = collection('posts').length;

    const { data } = await request('post', 'posts/bulk-delete', { data: { ids: [1, 2] } });

    expect(data.deleted).toBe(2);
    expect(collection('posts')).toHaveLength(before - 2);
  });

  it('tolerates a bulk delete with no ids', async () => {
    const before = collection('posts').length;

    await request('post', 'posts/bulk-delete', { data: {} });

    expect(collection('posts')).toHaveLength(before);
  });

  it('resets a user password', async () => {
    await request('post', 'users/1/reset-password', { data: { password: 'newsecret' } });

    const user = collection('users').find((row) => row.id === 1);
    expect(user?.password).toBe('newsecret');
  });

  it('404s an unrecognised sub-route', async () => {
    await expectFailure(request('post', 'users/1/nonsense'), 404);
  });
});

describe('auxiliary routes', () => {
  it('serves the permission catalog', async () => {
    const { data } = await request('get', 'permissions');

    expect(data.data).toEqual(mockPermissionCatalog());
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('serves dashboard statistics derived from the data', async () => {
    const { data } = await request('get', 'dashboard/stats');
    const stats = data.data as Row;

    expect(stats.users).toBe(collection('users').length);
    expect(stats.roles).toBe(collection('roles').length);
    expect(stats.posts).toBe(collection('posts').length);
  });

  it('counts only active users and published posts', async () => {
    const { data } = await request('get', 'dashboard/stats');
    const stats = data.data as Row;

    expect(stats.activeUsers).toBe(collection('users').filter((user) => user.is_active).length);
    expect(stats.published).toBe(
      collection('posts').filter((post) => post.status === 'published').length,
    );
  });

  it('accepts an upload and returns a url', async () => {
    const body = new FormData();
    body.append('file', new File(['x'], 'photo.png', { type: 'image/png' }));

    const response = await mockAdapter({
      method: 'post',
      url: 'uploads',
      data: body,
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig);

    expect((response.data as Row).name).toBe('photo.png');
  });
});

describe('request parsing', () => {
  it('tolerates a malformed JSON body', async () => {
    await expectFailure(
      mockAdapter({
        method: 'post',
        url: 'auth/login',
        data: '{not json',
        headers: new AxiosHeaders(),
      } as InternalAxiosRequestConfig),
      401,
    );
  });

  it('strips a leading slash from the url', async () => {
    const { data } = await request('get', '/users');

    expect(data.data).toBeDefined();
  });

  it('defaults to GET when no method is given', async () => {
    const response = await mockAdapter({
      url: 'users',
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig);

    expect(response.status).toBe(200);
  });
});

/** `writeCollection` speaks in plain rows; the seeded models are stricter. */
const asRows = (items: readonly object[]): Row[] => items.map((item) => ({ ...item }));

describe('rows whose relation is missing', () => {
  it('decorates a user with a null role', async () => {
    const users = collection('users');
    writeCollection('users', asRows([{ ...users[0], role_id: 999 }, ...users.slice(1)]));

    const { data } = await request('get', `users/${String(users[0].id)}`);

    expect((data.data as Row).role).toBeNull();
  });

  it('decorates a post with a null author', async () => {
    const posts = collection('posts');
    writeCollection('posts', asRows([{ ...posts[0], author_id: 999 }, ...posts.slice(1)]));

    const { data } = await request('get', `posts/${String(posts[0].id)}`);

    expect((data.data as Row).author).toBeNull();
  });

  it('leaves a collection with no relations untouched', async () => {
    const { data } = await request('get', 'roles');

    const rows = data.data as Row[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).not.toHaveProperty('role');
    expect(rows[0]).toHaveProperty('slug');
  });

  it('signs in a user whose role no longer exists with no permissions', async () => {
    const users = collection('users');
    const admin = users.find((user) => user.email === 'admin@example.com');
    writeCollection(
      'users',
      asRows([{ ...admin, role_id: 999 }, ...users.filter((user) => user.id !== admin?.id)]),
    );

    const { data } = await login();

    expect((data.user as Row).roles).toEqual([]);
    expect((data.user as Row).permissions).toEqual([]);
  });
});

describe('body parsing', () => {
  it('accepts a body that is already an object', async () => {
    const response = await mockAdapter({
      method: 'post',
      url: 'auth/login',
      data: { email: 'admin@example.com', password: 'password' },
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig);

    expect((response.data as Row).accessToken).toBe('mock-access-token');
  });

  it('treats a missing body as empty', async () => {
    await expectFailure(
      mockAdapter({
        method: 'post',
        url: 'auth/login',
        headers: new AxiosHeaders(),
      } as InternalAxiosRequestConfig),
      401,
    );
  });

  it('treats an upload with no file as an empty url', async () => {
    const body = new FormData();
    body.append('directory', 'covers');

    const response = await mockAdapter({
      method: 'post',
      url: 'uploads',
      data: body,
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig);

    expect(response.data).toEqual({ url: '', name: 'upload' });
  });

  it('treats a missing url as the root, which is not a collection', async () => {
    await expectFailure(
      mockAdapter({ method: 'get', headers: new AxiosHeaders() } as InternalAxiosRequestConfig),
      404,
    );
  });
});

describe('unexpected failures', () => {
  it('propagates an error that is not an HTTP error', async () => {
    await expect(
      request('post', 'posts/bulk-delete', { data: { ids: 'not-an-array' } }),
    ).rejects.toThrow(TypeError);
  });
});
