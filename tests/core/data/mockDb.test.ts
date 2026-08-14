import { beforeEach, describe, expect, it } from 'vitest';
import {
  collection,
  isCollection,
  nextId,
  queryCollection,
  resetDatabase,
  writeCollection,
  type QueryOptions,
} from '@/core/data/mock/db';

const rows = [
  { id: 1, name: 'Ada', email: 'ada@example.com', is_active: true, created_at: '2024-01-10' },
  { id: 2, name: 'Grace', email: 'grace@example.com', is_active: false, created_at: '2024-02-20' },
  { id: 3, name: 'Alan', email: 'alan@example.com', is_active: true, created_at: '2024-03-30' },
];

const query = (overrides: Partial<QueryOptions> = {}) =>
  queryCollection('users', {
    page: 1,
    perPage: 25,
    sortOrder: 'asc',
    filters: {},
    ...overrides,
  });

beforeEach(() => {
  resetDatabase();
  writeCollection('users', [...rows]);
});

describe('isCollection', () => {
  it.each(['users', 'roles', 'posts'])('accepts %s', (name) => {
    expect(isCollection(name)).toBe(true);
  });

  it.each(['products', '', 'Users'])('rejects %o', (name) => {
    expect(isCollection(name)).toBe(false);
  });
});

describe('collection and writeCollection', () => {
  it('round-trips rows', () => {
    expect(collection('users')).toHaveLength(3);
  });

  it('persists to localStorage so a reload keeps the data', () => {
    expect(localStorage.getItem('admin.mock-db.v1')).toContain('ada@example.com');
  });

  it('resetDatabase restores the seed', () => {
    writeCollection('users', []);
    resetDatabase();

    expect(collection('users').length).toBeGreaterThan(0);
  });
});

describe('nextId', () => {
  it('is one past the highest id', () => {
    expect(nextId('users')).toBe(4);
  });

  it('is 1 for an empty collection', () => {
    writeCollection('users', []);
    expect(nextId('users')).toBe(1);
  });

  it('ignores gaps and unordered ids', () => {
    writeCollection('users', [{ id: 9 }, { id: 2 }]);
    expect(nextId('users')).toBe(10);
  });
});

describe('search', () => {
  it('matches any searchable field', () => {
    expect(query({ search: 'ada' }).rows).toHaveLength(1);
    expect(query({ search: 'example.com' }).rows).toHaveLength(3);
  });

  it('is case-insensitive', () => {
    expect(query({ search: 'GRACE' }).rows).toHaveLength(1);
  });

  it('matches a substring, not only a prefix', () => {
    expect(query({ search: 'lan' }).rows).toHaveLength(1);
  });

  it('returns nothing for a term that matches no row', () => {
    expect(query({ search: 'zzz' }).rows).toEqual([]);
  });

  it('does not search a non-searchable field', () => {
    expect(query({ search: '2024-01-10' }).rows).toEqual([]);
  });
});

describe('filters', () => {
  it('matches a boolean filter', () => {
    expect(query({ filters: { is_active: 'true' } }).rows).toHaveLength(2);
    expect(query({ filters: { is_active: 'false' } }).rows).toHaveLength(1);
  });

  it('treats a comma-separated value as "any of"', () => {
    expect(query({ filters: { name: 'Ada,Alan' } }).rows).toHaveLength(2);
  });

  it('filters by a set of ids', () => {
    const result = query({ filters: { id: '1,3' } });
    expect(result.rows.map((row) => row.id)).toEqual([1, 3]);
  });

  it('ignores an empty filter value', () => {
    expect(query({ filters: { name: '' } }).rows).toHaveLength(3);
  });

  it('applies several filters conjunctively', () => {
    expect(query({ filters: { is_active: 'true', name: 'Ada' } }).rows).toHaveLength(1);
  });

  it('returns nothing when a filter matches no row', () => {
    expect(query({ filters: { name: 'Nobody' } }).rows).toEqual([]);
  });
});

describe('date range filters', () => {
  it('matches a closed range inclusively', () => {
    const result = query({ filters: { created_at: '2024-01-01..2024-02-28' } });
    expect(result.rows.map((row) => row.id)).toEqual([1, 2]);
  });

  it('matches an open-ended lower bound', () => {
    expect(query({ filters: { created_at: '2024-02-01..' } }).rows).toHaveLength(2);
  });

  it('matches an open-ended upper bound', () => {
    expect(query({ filters: { created_at: '..2024-02-01' } }).rows).toHaveLength(1);
  });

  it('includes the whole of the final day', () => {
    expect(query({ filters: { created_at: '..2024-01-10' } }).rows).toHaveLength(1);
  });

  it('drops rows whose value is not a date', () => {
    writeCollection('users', [{ id: 1, name: 'X', email: 'x@x', created_at: 'nonsense' }]);
    expect(query({ filters: { created_at: '2024-01-01..2024-12-31' } }).rows).toEqual([]);
  });
});

describe('sorting', () => {
  it('leaves the natural order when no sort field is given', () => {
    expect(query().rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it('sorts strings ascending and descending', () => {
    expect(query({ sortField: 'name' }).rows.map((row) => row.name)).toEqual([
      'Ada',
      'Alan',
      'Grace',
    ]);
    expect(query({ sortField: 'name', sortOrder: 'desc' }).rows.map((row) => row.name)).toEqual([
      'Grace',
      'Alan',
      'Ada',
    ]);
  });

  it('sorts numbers numerically, not lexicographically', () => {
    writeCollection('users', [{ id: 2 }, { id: 10 }, { id: 1 }]);
    expect(query({ sortField: 'id' }).rows.map((row) => row.id)).toEqual([1, 2, 10]);
  });

  it('sorts by a nested path', () => {
    writeCollection('users', [
      { id: 1, role: { name: 'Editor' } },
      { id: 2, role: { name: 'Admin' } },
    ]);
    expect(query({ sortField: 'role.name' }).rows.map((row) => row.id)).toEqual([2, 1]);
  });

  it('pushes null values to the end regardless of direction', () => {
    writeCollection('users', [
      { id: 1, name: null },
      { id: 2, name: 'B' },
      { id: 3, name: 'A' },
    ]);

    expect(query({ sortField: 'name' }).rows.map((row) => row.id)).toEqual([3, 2, 1]);
    expect(query({ sortField: 'name', sortOrder: 'desc' }).rows[0].id).toBe(2);
  });
});

describe('pagination', () => {
  it('reports the total before slicing', () => {
    const result = query({ perPage: 2 });
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(2);
  });

  it('slices the requested page', () => {
    expect(query({ page: 2, perPage: 2 }).rows.map((row) => row.id)).toEqual([3]);
  });

  it('returns an empty page past the end', () => {
    expect(query({ page: 99, perPage: 2 }).rows).toEqual([]);
  });

  it('computes lastPage from the filtered total', () => {
    expect(query({ perPage: 2 }).lastPage).toBe(2);
    expect(query({ perPage: 2, filters: { is_active: 'true' } }).lastPage).toBe(1);
  });

  it('never reports fewer than one page for an empty result', () => {
    expect(query({ filters: { name: 'Nobody' } }).lastPage).toBe(1);
  });

  it('applies search, filter, sort and pagination together', () => {
    const result = query({
      search: 'example.com',
      filters: { is_active: 'true' },
      sortField: 'name',
      sortOrder: 'desc',
      perPage: 1,
    });

    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.name)).toEqual(['Alan']);
  });
});

describe('rows with missing fields', () => {
  it('treats a missing searchable field as empty rather than "undefined"', () => {
    writeCollection('users', [{ id: 1, name: 'Ada' }, { id: 2 }]);

    expect(query({ search: 'undefined' }).rows).toHaveLength(0);
    expect(query({ search: 'ada' }).rows.map((row) => row.id)).toEqual([1]);
  });

  it('drops a row with no value from a date range filter', () => {
    writeCollection('users', [{ id: 1, created_at: '2024-02-01' }, { id: 2 }]);

    expect(query({ filters: { created_at: '2024-01-01..2024-12-31' } }).rows).toHaveLength(1);
  });

  it('ignores a non-numeric id when picking the next one', () => {
    writeCollection('users', [{ id: 'abc' }, { id: 4 }]);

    expect(nextId('users')).toBe(5);
  });

  it('starts ids at 1 for an empty collection', () => {
    writeCollection('users', []);

    expect(nextId('users')).toBe(1);
  });

  it('sorts a row whose sort key is missing to the end, whichever side it starts on', () => {
    writeCollection('users', [{ id: 1 }, { id: 2, name: 'B' }]);
    expect(query({ sortField: 'name' }).rows.map((row) => row.id)).toEqual([2, 1]);

    writeCollection('users', [{ id: 2, name: 'B' }, { id: 1 }]);
    expect(query({ sortField: 'name' }).rows.map((row) => row.id)).toEqual([2, 1]);
  });

  it('keeps two rows with the same missing key in their original order', () => {
    writeCollection('users', [{ id: 1 }, { id: 2 }]);

    expect(query({ sortField: 'name' }).rows.map((row) => row.id)).toEqual([1, 2]);
  });
});
