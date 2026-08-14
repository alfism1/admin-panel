import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/core/data/queryKeys';
import type { ListParams } from '@/core/data/types';

const params: ListParams = { page: 1, perPage: 25 };

describe('queryKeys', () => {
  it('scopes everything under the resource name', () => {
    expect(queryKeys.all('users')).toEqual(['users']);
  });

  it('nests lists under the resource', () => {
    expect(queryKeys.lists('users')).toEqual(['users', 'list']);
    expect(queryKeys.list('users', params)).toEqual(['users', 'list', params]);
  });

  it('nests details under the resource', () => {
    expect(queryKeys.details('users')).toEqual(['users', 'detail']);
    expect(queryKeys.detail('users', 7)).toEqual(['users', 'detail', '7']);
  });

  it('normalises a numeric id to a string, so 7 and "7" share a cache entry', () => {
    expect(queryKeys.detail('users', 7)).toEqual(queryKeys.detail('users', '7'));
  });

  it('keys options by search term, defaulting to an empty string', () => {
    expect(queryKeys.options('roles')).toEqual(['roles', 'options', '']);
    expect(queryKeys.options('roles', 'adm')).toEqual(['roles', 'options', 'adm']);
  });

  it('makes a list key a prefix match for the lists key, so invalidation cascades', () => {
    const listsKey = queryKeys.lists('users');
    const listKey = queryKeys.list('users', params);

    expect(listKey.slice(0, listsKey.length)).toEqual([...listsKey]);
  });

  it('distinguishes different list params', () => {
    expect(queryKeys.list('users', { page: 1, perPage: 25 })).not.toEqual(
      queryKeys.list('users', { page: 2, perPage: 25 }),
    );
  });

  it('keeps resources apart', () => {
    expect(queryKeys.all('users')).not.toEqual(queryKeys.all('posts'));
  });
});
