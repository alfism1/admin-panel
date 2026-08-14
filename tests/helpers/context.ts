import type { AuthUser } from '@/core/auth/types';
import { createPermissionChecker } from '@/core/auth/can';
import type { FieldContext, FormValues, Operation } from '@/core/forms/types';
import type { TableContext } from '@/core/tables/types';

export interface ContextOverrides {
  values?: FormValues;
  record?: FormValues | null;
  operation?: Operation;
  ownName?: string;
  user?: AuthUser | null;
  permissions?: string[];
  set?: FieldContext['set'];
}

export function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    avatar: null,
    roles: ['admin'],
    permissions: ['*'],
    ...overrides,
  };
}

/**
 * A `FieldContext` backed by a plain object. Mirrors `createStaticContext` but
 * lets a test hand in permissions without standing up an auth provider.
 */
export function makeFieldContext(overrides: ContextOverrides = {}): FieldContext {
  const values = overrides.values ?? {};
  const { can } = createPermissionChecker(overrides.permissions ?? ['*']);

  const read = <T>(path: string): T =>
    path.split('.').reduce<unknown>((cursor, segment) => {
      if (cursor == null || typeof cursor !== 'object') return undefined;
      return (cursor as FormValues)[segment];
    }, values) as T;

  return {
    state: overrides.ownName ? read(overrides.ownName) : undefined,
    get: read,
    set: overrides.set ?? (() => undefined),
    record: overrides.record ?? null,
    operation: overrides.operation ?? 'create',
    user: overrides.user === undefined ? makeUser() : overrides.user,
    can,
  };
}

export function makeTableContext(overrides: Partial<ContextOverrides> = {}): TableContext {
  const { can } = createPermissionChecker(overrides.permissions ?? ['*']);
  return { user: overrides.user === undefined ? makeUser() : overrides.user, can };
}
