import { describe, expect, it } from 'vitest';
import { createPermissionChecker } from '@/core/auth/can';
import type { AuthUser } from '../../server/auth';
import { permissionsFor } from '../../server/db/introspect';
import { HttpError } from '../../server/db/types';
import { authorize, granted, permissionFor } from '../../server/permissions';

function user(permissions: string[]): AuthUser {
  return {
    id: 1,
    name: 'Ada',
    email: 'ada@example.com',
    roles: ['editor'],
    permissions,
  };
}

describe('granted', () => {
  it('lets * through for anything', () => {
    expect(granted(['*'], 'post.delete')).toBe(true);
    expect(granted(['*'], 'anything.at.all')).toBe(true);
  });

  it('matches an exact grant', () => {
    expect(granted(['post.update'], 'post.update')).toBe(true);
  });

  it('refuses when nothing matches', () => {
    expect(granted([], 'post.update')).toBe(false);
    expect(granted(['post.view'], 'post.update')).toBe(false);
    expect(granted(['comment.update'], 'post.update')).toBe(false);
  });

  it('expands a one-level wildcard', () => {
    expect(granted(['post.*'], 'post.update')).toBe(true);
    expect(granted(['post.*'], 'post.delete')).toBe(true);
    expect(granted(['post.*'], 'comment.delete')).toBe(false);
  });

  it('expands a wildcard at any depth', () => {
    // `post.*` has to reach the ownership escape hatch too, or granting a role
    // everything on posts still refuses it other people's rows.
    expect(granted(['post.*'], 'post.update.any')).toBe(true);
    expect(granted(['post.update.*'], 'post.update.any')).toBe(true);
  });

  it('does not let a deeper wildcard grant the shallower permission', () => {
    // `post.update.*` says "any qualifier on update", not "update". The loop
    // starts one segment in from the right for exactly this reason.
    expect(granted(['post.update.*'], 'post.update')).toBe(false);
  });

  it('does not let a wildcard grant a bare single-segment permission', () => {
    expect(granted(['post.*'], 'post')).toBe(false);
  });

  it('treats a literal * grant as the only global one', () => {
    // `*.view` is not "view on everything" — nothing splits on the left side.
    expect(granted(['*.view'], 'post.view')).toBe(false);
  });

  it('is not fooled by a prefix that is not a segment boundary', () => {
    expect(granted(['post.*'], 'postscript.update')).toBe(false);
  });
});

describe('permissionFor', () => {
  it('singularises the table', () => {
    expect(permissionFor('posts', 'update')).toBe('post.update');
    expect(permissionFor('users', 'delete')).toBe('user.delete');
    expect(permissionFor('categories', 'view')).toBe('category.view');
  });

  it('produces strings the published catalogue actually contains', () => {
    // `permissionsFor` is what the role editor lists; `permissionFor` is what
    // the gate demands. Derived separately, so if they drift the panel offers
    // a checkbox that grants a permission no endpoint ever checks.
    const schemas = ['posts', 'users', 'categories'].map((name) => ({
      name,
      primaryKey: 'id',
      columns: [],
      searchable: [],
      relations: [],
    }));
    const published = permissionsFor(schemas);

    for (const schema of schemas) {
      for (const ability of ['view', 'create', 'update', 'delete'] as const) {
        expect(published).toContain(permissionFor(schema.name, ability));
      }
    }
  });
});

describe('authorize', () => {
  it('returns silently when the caller holds the permission', () => {
    expect(() => authorize(user(['post.update']), 'posts', 'update')).not.toThrow();
    expect(() => authorize(user(['post.*']), 'posts', 'delete')).not.toThrow();
    expect(() => authorize(user(['*']), 'posts', 'delete')).not.toThrow();
  });

  it('throws 403 when it does not', () => {
    expect(() => authorize(user(['post.view']), 'posts', 'delete')).toThrow(HttpError);

    try {
      authorize(user(['post.view']), 'posts', 'delete');
      expect.unreachable('authorize should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(403);
      // Naming the missing permission is deliberate: the caller is already
      // authenticated, and a role editor is unusable without it.
      expect((error as HttpError).message).toContain('post.delete');
    }
  });

  it('refuses a caller with no permissions at all', () => {
    for (const ability of ['view', 'create', 'update', 'delete'] as const) {
      expect(() => authorize(user([]), 'posts', ability)).toThrow(HttpError);
    }
  });

  it('does not let permission on one resource reach another', () => {
    expect(() => authorize(user(['post.delete']), 'users', 'delete')).toThrow(HttpError);
  });
});

/**
 * `granted` and `createPermissionChecker` are separate implementations on
 * purpose — the client one is UX, this one is the boundary — but a divergence
 * means the UI shows a button the API refuses, or hides one it would allow.
 * Nothing but this test holds them together.
 */
describe('parity with the client checker', () => {
  const cases: Array<[string[], string]> = [
    [[], 'post.view'],
    [['*'], 'post.view'],
    [['*'], 'anything.at.all'],
    [['post.view'], 'post.view'],
    [['post.view'], 'post.update'],
    [['post.*'], 'post.update'],
    [['post.*'], 'post.update.any'],
    [['post.*'], 'comment.update'],
    [['post.*'], 'post'],
    [['post.*'], 'postscript.update'],
    [['post.update.*'], 'post.update.any'],
    [['post.update.*'], 'post.update'],
    [['*.view'], 'post.view'],
    [['post.view', 'comment.*'], 'comment.delete'],
    [['user.update.any'], 'user.update.any'],
    [['user.update.any'], 'user.update'],
  ];

  it.each(cases)('%j vs %s agree', (permissions, required) => {
    expect(granted(permissions, required)).toBe(createPermissionChecker(permissions).can(required));
  });

  it('KNOWN LIMITATION: the two disagree on the empty permission', () => {
    // The client reads "no permission required" as "allowed" so `<Can>` can be
    // used with an optional permission prop. The server has no such caller —
    // `authorize` always builds `<singular>.<ability>` — so an empty string
    // there means a bug, and refusing is the safer answer.
    // Fix, if a caller ever needs it: give the server the same early return and
    // flip this assertion. Documented rather than aligned, because making the
    // boundary permissive to match the UI is the wrong direction.
    expect(granted([], '')).toBe(false);
    expect(createPermissionChecker([]).can('')).toBe(true);
  });
});
