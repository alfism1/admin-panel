import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../server/auth';
import type { DatabaseAdapter, Row } from '../../server/db/types';
import type * as OwnershipModule from '../../server/ownership';
import { withServerEnv } from './helpers/env';

type Ownership = typeof OwnershipModule;

/**
 * Loads `server/ownership.ts` against a given `OWNED_TABLES` setting.
 *
 * Every load goes through `vi.resetModules()`, so the `HttpError` these throw
 * is a *different class object* from a statically imported one — assert on
 * `status` rather than reaching for `toBeInstanceOf`.
 */
function loadOwnership(ownedTables: string): Promise<Ownership> {
  return withServerEnv({ OWNED_TABLES: ownedTables }, () => import('../../server/ownership'));
}

function user(permissions: string[] = [], id: string | number = 7): AuthUser {
  return { id, name: 'Ada', email: 'ada@example.com', roles: ['author'], permissions };
}

/** Only `find` is ever reached from here; the rest exist to satisfy the type. */
function makeDb(row: Row | null): DatabaseAdapter & { find: ReturnType<typeof vi.fn> } {
  const find = vi.fn().mockResolvedValue(row);
  return {
    dialect: 'postgres',
    resources: vi.fn().mockReturnValue([]),
    schema: vi.fn(),
    has: vi.fn().mockReturnValue(true),
    list: vi.fn(),
    find,
    findBy: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeMany: vi.fn(),
    count: vi.fn(),
    close: vi.fn(),
  } as unknown as DatabaseAdapter & { find: ReturnType<typeof vi.fn> };
}

describe('ownerColumn', () => {
  it('reads a configured table:column pair', async () => {
    const { ownerColumn } = await loadOwnership('posts:author_id,comments:user_id');
    expect(ownerColumn('posts')).toBe('author_id');
    expect(ownerColumn('comments')).toBe('user_id');
  });

  it('is undefined for a table nobody configured', async () => {
    const { ownerColumn } = await loadOwnership('posts:author_id');
    expect(ownerColumn('users')).toBeUndefined();
  });

  it('is undefined everywhere when OWNED_TABLES is unset', async () => {
    // The opt-in default: with no configuration the behaviour must be exactly
    // what it was before ownership existed.
    const { ownerColumn } = await loadOwnership('');
    expect(ownerColumn('posts')).toBeUndefined();
  });

  it('ignores a malformed entry rather than half-applying it', async () => {
    // `posts` with no column would otherwise scope by `undefined` and match
    // nothing, turning a config typo into an empty list page.
    const { ownerColumn } = await loadOwnership('posts,comments:,orders:user_id');
    expect(ownerColumn('posts')).toBeUndefined();
    expect(ownerColumn('comments')).toBeUndefined();
    expect(ownerColumn('orders')).toBe('user_id');
  });

  it('tolerates whitespace around the pairs', async () => {
    const { ownerColumn } = await loadOwnership(' posts : author_id , comments : user_id ');
    expect(ownerColumn('posts')).toBe('author_id');
    expect(ownerColumn('comments')).toBe('user_id');
  });
});

describe('mayActOnAny', () => {
  let ownership: Ownership;

  beforeEach(async () => {
    ownership = await loadOwnership('posts:author_id');
  });

  it('is true for the explicit .any grant', () => {
    expect(ownership.mayActOnAny(user(['post.update.any']), 'posts', 'update')).toBe(true);
  });

  it('is false for the plain grant', () => {
    // Holding `post.update` means "may update posts", not "may update anyone's
    // post" — the whole point of the escape hatch being a separate string.
    expect(ownership.mayActOnAny(user(['post.update']), 'posts', 'update')).toBe(false);
  });

  it('is true for * and for a resource wildcard', () => {
    expect(ownership.mayActOnAny(user(['*']), 'posts', 'delete')).toBe(true);
    expect(ownership.mayActOnAny(user(['post.*']), 'posts', 'delete')).toBe(true);
  });

  it('does not leak across abilities', () => {
    expect(ownership.mayActOnAny(user(['post.view.any']), 'posts', 'delete')).toBe(false);
  });

  it('does not leak across resources', () => {
    expect(ownership.mayActOnAny(user(['comment.update.any']), 'posts', 'update')).toBe(false);
  });
});

describe('ownershipFilter', () => {
  it('scopes a list to the caller', async () => {
    const { ownershipFilter } = await loadOwnership('posts:author_id');
    expect(ownershipFilter(user(['post.view']), 'posts', 'view')).toEqual({ author_id: '7' });
  });

  it('stringifies a numeric id, because filters are strings on the wire', async () => {
    const { ownershipFilter } = await loadOwnership('posts:author_id');
    const scope = ownershipFilter(user([], 42), 'posts', 'view');
    expect(scope).toEqual({ author_id: '42' });
    expect(typeof scope?.author_id).toBe('string');
  });

  it('defaults to the view ability', async () => {
    const { ownershipFilter } = await loadOwnership('posts:author_id');
    expect(ownershipFilter(user(['post.view.any']), 'posts')).toBeUndefined();
    expect(ownershipFilter(user(['post.update.any']), 'posts')).toEqual({ author_id: '7' });
  });

  it('is undefined when the table is not owned', async () => {
    const { ownershipFilter } = await loadOwnership('posts:author_id');
    expect(ownershipFilter(user(['user.view']), 'users', 'view')).toBeUndefined();
  });

  it('is undefined when the caller may see everything', async () => {
    const { ownershipFilter } = await loadOwnership('posts:author_id');
    expect(ownershipFilter(user(['post.view.any']), 'posts', 'view')).toBeUndefined();
    expect(ownershipFilter(user(['*']), 'posts', 'view')).toBeUndefined();
  });

  it('cannot be widened by a caller-supplied filter on the same column', async () => {
    // `routes.ts` merges this last for exactly this reason. Spreading the
    // scope first would let `?filter[author_id]=9` read someone else's rows.
    const { ownershipFilter } = await loadOwnership('posts:author_id');
    const supplied = { author_id: '9', status: 'published' };
    const scope = ownershipFilter(user(['post.view']), 'posts', 'view');

    expect({ ...supplied, ...scope }).toEqual({ author_id: '7', status: 'published' });
  });
});

describe('assertOwned', () => {
  it('passes and reads nothing when the table is not owned', async () => {
    const { assertOwned } = await loadOwnership('');
    const db = makeDb(null);

    await expect(assertOwned(db, user(), 'posts', '1', 'update')).resolves.toBeUndefined();
    expect(db.find).not.toHaveBeenCalled();
  });

  it('passes and reads nothing when the caller may act on any row', async () => {
    // The extra round trip would buy nothing: the answer cannot change.
    const { assertOwned } = await loadOwnership('posts:author_id');
    const db = makeDb({ id: '1', author_id: '999' });

    await expect(
      assertOwned(db, user(['post.update.any']), 'posts', '1', 'update'),
    ).resolves.toBeUndefined();
    expect(db.find).not.toHaveBeenCalled();
  });

  it('passes for the caller’s own row', async () => {
    const { assertOwned } = await loadOwnership('posts:author_id');
    const db = makeDb({ id: '1', author_id: '7' });

    await expect(assertOwned(db, user(), 'posts', '1', 'update')).resolves.toBeUndefined();
    expect(db.find).toHaveBeenCalledWith('posts', '1');
  });

  it('compares owner and caller as strings', async () => {
    // The column is an integer in Postgres and a string in the JWT subject.
    const { assertOwned } = await loadOwnership('posts:author_id');
    const db = makeDb({ id: '1', author_id: 7 });

    await expect(assertOwned(db, user([], '7'), 'posts', '1', 'update')).resolves.toBeUndefined();
  });

  it('answers 404 for somebody else’s row, not 403', async () => {
    // A 403 here would confirm the row exists, which is the thing a caller who
    // may not touch it should not be able to learn.
    const { assertOwned } = await loadOwnership('posts:author_id');
    const db = makeDb({ id: '1', author_id: '999' });

    await expect(assertOwned(db, user(), 'posts', '1', 'update')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('answers 404 for a row that does not exist', async () => {
    // Same status as the foreign-row case, deliberately: the two must be
    // indistinguishable or the difference is itself the oracle.
    const { assertOwned } = await loadOwnership('posts:author_id');
    const db = makeDb(null);

    await expect(assertOwned(db, user(), 'posts', '1', 'update')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('answers 404 when the owner column is null', async () => {
    // An unowned row is not a free-for-all.
    const { assertOwned } = await loadOwnership('posts:author_id');
    const db = makeDb({ id: '1', author_id: null });

    await expect(assertOwned(db, user(), 'posts', '1', 'update')).rejects.toMatchObject({
      status: 404,
      message: 'Record not found.',
    });
  });

  it('checks the ability it was given', async () => {
    // `.any` on view must not wave through a delete of a foreign row.
    const { assertOwned } = await loadOwnership('posts:author_id');
    const db = makeDb({ id: '1', author_id: '999' });

    await expect(
      assertOwned(db, user(['post.view.any']), 'posts', '1', 'delete'),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.find).toHaveBeenCalledOnce();
  });
});

describe('applyOwnership', () => {
  it('stamps the owner on create', async () => {
    const { applyOwnership } = await loadOwnership('posts:author_id');
    expect(applyOwnership(user(), 'posts', { title: 'Hello' }, 'create')).toEqual({
      title: 'Hello',
      author_id: 7,
    });
  });

  it('overwrites an author_id the caller supplied on create', async () => {
    // Otherwise ownership is self-service: post as someone else, then own it.
    const { applyOwnership } = await loadOwnership('posts:author_id');
    expect(applyOwnership(user(), 'posts', { title: 'Hello', author_id: 999 }, 'create')).toEqual({
      title: 'Hello',
      author_id: 7,
    });
  });

  it('strips the owner column on update', async () => {
    // Not overwritten — removed, so the stored value is left exactly as it is
    // and a caller cannot hand their row to somebody else either.
    const { applyOwnership } = await loadOwnership('posts:author_id');
    expect(applyOwnership(user(), 'posts', { title: 'Hi', author_id: 999 }, 'update')).toEqual({
      title: 'Hi',
    });
  });

  it('leaves an update without the owner column untouched', async () => {
    const { applyOwnership } = await loadOwnership('posts:author_id');
    expect(applyOwnership(user(), 'posts', { title: 'Hi' }, 'update')).toEqual({ title: 'Hi' });
  });

  it('does not mutate the body it was given', async () => {
    const { applyOwnership } = await loadOwnership('posts:author_id');
    const body = { title: 'Hi', author_id: 999 };

    applyOwnership(user(), 'posts', body, 'update');
    expect(body).toEqual({ title: 'Hi', author_id: 999 });
  });

  it('passes the body through for a table that is not owned', async () => {
    const { applyOwnership } = await loadOwnership('posts:author_id');
    const body = { name: 'Ada', role_id: 3 };
    expect(applyOwnership(user(), 'users', body, 'create')).toBe(body);
  });

  it('lets a caller with .any set the owner explicitly', async () => {
    // An editor reassigning a draft is the reason the escape hatch exists.
    const { applyOwnership } = await loadOwnership('posts:author_id');
    expect(
      applyOwnership(user(['post.update.any']), 'posts', { author_id: 999 }, 'update'),
    ).toEqual({ author_id: 999 });
  });

  it('does not stamp the owner for a caller with .any on create', async () => {
    const { applyOwnership } = await loadOwnership('posts:author_id');
    expect(applyOwnership(user(['post.create.any']), 'posts', { title: 'Hi' }, 'create')).toEqual({
      title: 'Hi',
    });
  });

  it('checks the ability it was given, not a fixed one', async () => {
    const { applyOwnership } = await loadOwnership('posts:author_id');
    // `.any` on create says nothing about update.
    expect(
      applyOwnership(user(['post.create.any']), 'posts', { author_id: 999 }, 'update'),
    ).toEqual({});
  });
});
