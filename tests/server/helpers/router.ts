import { vi } from 'vitest';
import type { AuthUser } from '../../../server/auth';
import type { Context, Router } from '../../../server/http';
import type { DatabaseAdapter, ListResult, ResourceSchema, Row } from '../../../server/db/types';

/**
 * The routes are exercised through `Router.match` rather than a real listener:
 * `createRequestListener` is what turns a thrown `HttpError` into a response,
 * and mixing the two would test Node's http module instead of the routing.
 */
export interface DispatchInit {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  ip?: string;
}

export interface Dispatched {
  status: number;
  body: unknown;
}

export async function dispatch(
  router: Router,
  method: string,
  path: string,
  init: DispatchInit = {},
): Promise<Dispatched> {
  const url = new URL(path, 'http://localhost');
  const matched = router.match(method, url.pathname);
  if (!matched) throw new Error(`no route for ${method} ${url.pathname}`);

  const ctx = {
    method,
    path: url.pathname,
    segments: url.pathname.split('/').filter(Boolean),
    query: url.searchParams,
    body: init.body ?? {},
    headers: { authorization: 'Bearer token', ...init.headers },
    ip: init.ip ?? '127.0.0.1',
    params: matched.params,
  } as unknown as Context;

  return { status: matched.status, body: await matched.handler(ctx) };
}

/**
 * Every registered route, as `METHOD /path`. Reaches past `private` on
 * purpose: it is what lets a test notice a *new* endpoint rather than only the
 * ones somebody remembered to probe.
 */
export function registeredRouteCount(router: Router): number {
  return (router as unknown as { routes: unknown[] }).routes.length;
}

export function schemaFor(name: string, primaryKey = 'id'): ResourceSchema {
  return { name, primaryKey, columns: [], searchable: [], relations: [] };
}

/**
 * The adapter with every method widened to a spy. An intersection would not do
 * it: `DatabaseAdapter['list']` wins over the index signature, so `.mockClear()`
 * would not typecheck on a value that has it at runtime.
 */
type Spied<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? ReturnType<typeof vi.fn> : T[K];
};

export type SpiedDb = Spied<DatabaseAdapter>;

export function makeDb(overrides: Partial<Record<keyof DatabaseAdapter, unknown>> = {}): SpiedDb {
  const list: ListResult = { rows: [], total: 0 };

  const db = {
    dialect: 'postgres',
    resources: vi
      .fn()
      .mockReturnValue([schemaFor('posts'), schemaFor('users'), schemaFor('roles')]),
    schema: vi.fn().mockImplementation((name: string) => schemaFor(name)),
    has: vi.fn().mockReturnValue(true),
    list: vi.fn().mockResolvedValue(list),
    find: vi.fn().mockResolvedValue({ id: '1' } as Row),
    findBy: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockImplementation((_resource: string, data: Row) => ({ id: '1', ...data })),
    update: vi.fn().mockImplementation((_resource: string, id: string, data: Row) => ({
      id,
      ...data,
    })),
    remove: vi.fn().mockResolvedValue(undefined),
    removeMany: vi.fn().mockResolvedValue(0),
    count: vi.fn().mockResolvedValue(0),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return db as unknown as SpiedDb;
}

export function makeUser(permissions: string[], id: string | number = 7): AuthUser {
  return { id, name: 'Ada', email: 'ada@example.com', roles: ['author'], permissions };
}

export interface SpiedAuth {
  hasUserTable: boolean;
  me: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  hashPasswordIn: ReturnType<typeof vi.fn>;
}

export function makeAuth(user: AuthUser = makeUser(['*'])): SpiedAuth {
  return {
    hasUserTable: true,
    me: vi.fn().mockResolvedValue(user),
    login: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user }),
    refresh: vi.fn().mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' }),
    // The real one only rewrites the auth table; routes must call it regardless.
    hashPasswordIn: vi.fn().mockImplementation((_resource: string, data: Row) => data),
  };
}
