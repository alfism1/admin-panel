import { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios';
import type { AuthUser } from '@/core/auth/types';
import { collection, isCollection, nextId, queryCollection, writeCollection } from './db';
import { PERMISSION_CATALOG } from './seed';
import type { MockCollection, MockRole, MockUser } from './types';

const LATENCY_MS = 220;
const ACCESS_TOKEN = 'mock-access-token';
const REFRESH_TOKEN = 'mock-refresh-token';

type Row = Record<string, unknown>;

class MockHttpError extends Error {
  constructor(
    readonly status: number,
    /** Typed so every throw site has to say what went wrong. */
    readonly payload: Row & { message: string },
  ) {
    super(payload.message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Session state is intentionally in-memory: reloading the page re-runs the login flow. */
let currentUserId: number | null = Number(sessionStorage.getItem('admin.mock-session')) || null;

function toAuthUser(user: MockUser): AuthUser {
  const role = collection('roles').find((item) => item.id === user.role_id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    roles: role ? [role.slug] : [],
    permissions: role?.permissions ?? [],
  };
}

function decorate(name: MockCollection, row: Row): Row {
  if (name === 'users') {
    const role = collection('roles').find((item) => item.id === row.role_id);
    const { password: _password, ...rest } = row as unknown as MockUser & Row;
    return { ...rest, role: role ? { id: role.id, name: role.name, slug: role.slug } : null };
  }
  if (name === 'posts') {
    const author = collection('users').find((item) => item.id === row.author_id);
    return { ...row, author: author ? { id: author.id, name: author.name } : null };
  }
  return row;
}

function requireCollection(name: string): MockCollection {
  if (!isCollection(name)) throw new MockHttpError(404, { message: `Unknown resource "${name}".` });
  return name;
}

function findRow(name: MockCollection, id: string): Row {
  const row = (collection(name) as unknown as Row[]).find((item) => String(item.id) === id);
  if (!row) throw new MockHttpError(404, { message: 'Record not found.' });
  return row;
}

function assertUniqueEmail(email: unknown, ignoreId?: string): void {
  const taken = collection('users').some(
    (user) => user.email === email && String(user.id) !== ignoreId,
  );
  if (taken) {
    throw new MockHttpError(422, {
      message: 'The given data was invalid.',
      errors: { email: ['This email address is already registered.'] },
    });
  }
}

function handleAuth(method: string, path: string, body: Row): Row {
  if (method === 'post' && path === 'auth/login') {
    const user = collection('users').find((item) => item.email === body.email);
    if (!user || user.password !== body.password) {
      throw new MockHttpError(401, { message: 'These credentials do not match our records.' });
    }
    if (!user.is_active) throw new MockHttpError(403, { message: 'This account is disabled.' });
    currentUserId = user.id;
    sessionStorage.setItem('admin.mock-session', String(user.id));
    return { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, user: toAuthUser(user) };
  }

  if (method === 'get' && path === 'auth/me') {
    const user = collection('users').find((item) => item.id === currentUserId);
    if (!user) throw new MockHttpError(401, { message: 'Unauthenticated.' });
    return toAuthUser(user) as unknown as Row;
  }

  if (method === 'post' && path === 'auth/refresh') {
    if (!currentUserId) throw new MockHttpError(401, { message: 'Session expired.' });
    return { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN };
  }

  if (method === 'post' && path === 'auth/logout') {
    currentUserId = null;
    sessionStorage.removeItem('admin.mock-session');
    return { success: true };
  }

  throw new MockHttpError(404, { message: `No mock route for ${method.toUpperCase()} /${path}` });
}

function handleCrud(
  method: string,
  segments: string[],
  params: Record<string, string>,
  body: Row,
): Row {
  const name = requireCollection(segments[0]);
  const rows = collection(name) as unknown as Row[];

  if (method === 'get' && segments.length === 1) {
    const filters: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      const match = /^filter\[(.+)\]$/.exec(key);
      if (match) filters[match[1]] = value;
    }
    const sortParam = params.sort ?? '';
    const result = queryCollection(name, {
      page: Number(params.page) || 1,
      perPage: Number(params.per_page) || 25,
      sortField: sortParam.replace(/^-/, '') || undefined,
      sortOrder: sortParam.startsWith('-') ? 'desc' : 'asc',
      search: params.search,
      filters,
    });
    return {
      data: result.rows.map((row) => decorate(name, row)),
      meta: {
        total: result.total,
        page: Number(params.page) || 1,
        per_page: Number(params.per_page) || 25,
        last_page: result.lastPage,
      },
    };
  }

  if (method === 'get' && segments.length === 2) {
    return { data: decorate(name, findRow(name, segments[1])) };
  }

  if (method === 'post' && segments.length === 1) {
    if (name === 'users') assertUniqueEmail(body.email);
    const now = new Date().toISOString();
    const created: Row = { ...body, id: nextId(name), created_at: now, updated_at: now };
    writeCollection(name, [created, ...rows]);
    return { data: decorate(name, created) };
  }

  if ((method === 'patch' || method === 'put') && segments.length === 2) {
    const id = segments[1];
    if (name === 'users' && body.email) assertUniqueEmail(body.email, id);
    const existing = findRow(name, id);
    const updated = { ...existing, ...body, updated_at: new Date().toISOString() };
    writeCollection(
      name,
      rows.map((row) => (String(row.id) === id ? updated : row)),
    );
    return { data: decorate(name, updated) };
  }

  if (method === 'delete' && segments.length === 2) {
    findRow(name, segments[1]);
    writeCollection(
      name,
      rows.filter((row) => String(row.id) !== segments[1]),
    );
    return { success: true };
  }

  if (method === 'post' && segments[1] === 'bulk-delete') {
    const ids = new Set((body.ids as unknown[])?.map(String) ?? []);
    writeCollection(
      name,
      rows.filter((row) => !ids.has(String(row.id))),
    );
    return { success: true, deleted: ids.size };
  }

  if (method === 'post' && name === 'users' && segments[2] === 'reset-password') {
    const id = segments[1];
    const user = findRow(name, id);
    writeCollection(
      name,
      rows.map((row) => (String(row.id) === id ? { ...user, password: body.password } : row)),
    );
    return { success: true };
  }

  throw new MockHttpError(404, {
    message: `No mock route for ${method.toUpperCase()} /${segments.join('/')}`,
  });
}

function route(method: string, path: string, params: Record<string, string>, body: Row): Row {
  if (path.startsWith('auth/')) return handleAuth(method, path, body);

  if (method === 'get' && path === 'permissions') {
    return { data: PERMISSION_CATALOG };
  }

  if (method === 'post' && path === 'uploads') {
    const file = body.file;
    const url = file instanceof File ? URL.createObjectURL(file) : '';
    return { url, name: file instanceof File ? file.name : 'upload' };
  }

  if (path === 'dashboard/stats') {
    const users = collection('users');
    const posts = collection('posts');
    return {
      data: {
        users: users.length,
        activeUsers: users.filter((user) => user.is_active).length,
        posts: posts.length,
        published: posts.filter((post) => post.status === 'published').length,
        roles: collection('roles').length,
        views: posts.reduce((sum, post) => sum + post.views, 0),
      },
    };
  }

  return handleCrud(method, path.split('/').filter(Boolean), params, body);
}

function toResponse(config: Parameters<AxiosAdapter>[0], status: number, data: Row): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Created',
    headers: new AxiosHeaders(),
    config,
    request: null,
  };
}

function parseBody(data: unknown): Row {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Row;
    } catch {
      return {};
    }
  }
  if (data instanceof FormData) return Object.fromEntries(data.entries()) as Row;
  return data as Row;
}

export const mockAdapter: AxiosAdapter = async (config) => {
  await sleep(LATENCY_MS);

  const method = (config.method ?? 'get').toLowerCase();
  const path = (config.url ?? '').replace(/^\/+/, '');
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    (config.params ?? {}) as Record<string, string | number>,
  )) {
    params[key] = String(value);
  }

  try {
    const data = route(method, path, params, parseBody(config.data));
    return toResponse(config, method === 'post' ? 201 : 200, data);
  } catch (error) {
    if (error instanceof MockHttpError) {
      const response = toResponse(config, error.status, error.payload);
      throw new AxiosError(error.message, String(error.status), config, null, response);
    }
    throw error;
  }
};

/** Roles carry the permission catalog, so expose it for the role editor UI. */
export function mockPermissionCatalog(): string[] {
  return PERMISSION_CATALOG;
}

export type { MockRole };
