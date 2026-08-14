import { act, renderHook } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { SelectFilter } from '@/core/tables/filters/SelectFilter';
import type { TableSchema } from '@/core/tables/types';
import { useTableState } from '@/core/tables/useTableState';

const schema: TableSchema = {
  columns: [
    TextColumn.make('name').sortable(),
    TextColumn.make('email').toggleable({ hiddenByDefault: true }),
    TextColumn.make('role.name').sortable({ column: 'role_id' }),
  ],
};

function setup(initialUrl = '/users', tableSchema: TableSchema = schema, storageKey = 'users') {
  return renderHook(
    () => ({ state: useTableState(tableSchema, storageKey), location: useLocation() }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
      ),
    },
  );
}

describe('reading state from the URL', () => {
  it('uses defaults for a bare URL', () => {
    const { result } = setup();

    expect(result.current.state.page).toBe(1);
    expect(result.current.state.perPage).toBe(25);
    expect(result.current.state.search).toBe('');
    expect(result.current.state.sort).toBeNull();
    expect(result.current.state.filters).toEqual({});
  });

  it('reads page, perPage and search', () => {
    const { result } = setup('/users?page=3&perPage=50&q=ada');

    expect(result.current.state.page).toBe(3);
    expect(result.current.state.perPage).toBe(50);
    expect(result.current.state.search).toBe('ada');
  });

  it('clamps a nonsensical page to 1', () => {
    expect(setup('/users?page=0').result.current.state.page).toBe(1);
    expect(setup('/users?page=-5').result.current.state.page).toBe(1);
    expect(setup('/users?page=abc').result.current.state.page).toBe(1);
  });

  it('falls back to the default perPage for a junk value', () => {
    expect(setup('/users?perPage=abc').result.current.state.perPage).toBe(25);
  });

  it('honours the schema default perPage', () => {
    const custom = { ...schema, defaultPerPage: 10 };
    expect(setup('/users', custom).result.current.state.perPage).toBe(10);
  });

  it('reads an ascending sort', () => {
    expect(setup('/users?sort=name').result.current.state.sort).toEqual({
      column: 'name',
      direction: 'asc',
    });
  });

  it('reads a descending sort from the leading dash', () => {
    expect(setup('/users?sort=-created_at').result.current.state.sort).toEqual({
      column: 'created_at',
      direction: 'desc',
    });
  });

  it('falls back to the schema default sort', () => {
    const custom: TableSchema = { ...schema, defaultSort: { column: 'id', direction: 'desc' } };
    expect(setup('/users', custom).result.current.state.sort).toEqual({
      column: 'id',
      direction: 'desc',
    });
  });

  it('lets the URL override the default sort', () => {
    const custom: TableSchema = { ...schema, defaultSort: { column: 'id', direction: 'desc' } };
    expect(setup('/users?sort=name', custom).result.current.state.sort).toEqual({
      column: 'name',
      direction: 'asc',
    });
  });

  it('collects prefixed filter params', () => {
    const { result } = setup('/users?f_status=draft&f_role=admin&other=x');
    expect(result.current.state.filters).toEqual({ status: 'draft', role: 'admin' });
  });

  it('ignores an empty filter value', () => {
    expect(setup('/users?f_status=').result.current.state.filters).toEqual({});
  });
});

describe('writing state to the URL', () => {
  it('setSearch writes q and resets the page', () => {
    const { result } = setup('/users?page=3');

    act(() => result.current.state.setSearch('ada'));

    expect(result.current.location.search).toContain('q=ada');
    expect(result.current.location.search).not.toContain('page=');
    expect(result.current.state.page).toBe(1);
  });

  it('setSearch with an empty string removes q', () => {
    const { result } = setup('/users?q=ada');

    act(() => result.current.state.setSearch(''));

    expect(result.current.location.search).not.toContain('q=');
  });

  it('setPage keeps the page for values above one', () => {
    const { result } = setup();

    act(() => result.current.state.setPage(4));

    expect(result.current.state.page).toBe(4);
  });

  it('setPage(1) drops the parameter rather than writing page=1', () => {
    const { result } = setup('/users?page=4');

    act(() => result.current.state.setPage(1));

    expect(result.current.location.search).not.toContain('page=');
    expect(result.current.state.page).toBe(1);
  });

  it('setPerPage drops the parameter when it matches the default', () => {
    const { result } = setup('/users?perPage=50');

    act(() => result.current.state.setPerPage(25));

    expect(result.current.location.search).not.toContain('perPage=');
  });

  it('setPerPage resets the page', () => {
    const { result } = setup('/users?page=3');

    act(() => result.current.state.setPerPage(50));

    expect(result.current.state.page).toBe(1);
  });

  it('setFilter writes the prefixed parameter and resets the page', () => {
    const { result } = setup('/users?page=3');

    act(() => result.current.state.setFilter(SelectFilter.make('status'), 'draft'));

    expect(result.current.state.filters).toEqual({ status: 'draft' });
    expect(result.current.state.page).toBe(1);
  });

  it('setFilter with an empty value clears it', () => {
    const { result } = setup('/users?f_status=draft');

    act(() => result.current.state.setFilter(SelectFilter.make('status'), ''));

    expect(result.current.state.filters).toEqual({});
  });

  it('resetFilters clears every filter and the search term', () => {
    const { result } = setup('/users?f_status=draft&f_role=admin&q=ada&perPage=50');

    act(() => result.current.state.resetFilters());

    expect(result.current.state.filters).toEqual({});
    expect(result.current.state.search).toBe('');
    expect(result.current.state.perPage).toBe(50);
  });
});

describe('toggleSort', () => {
  const nameColumn = schema.columns[0];

  it('cycles unsorted → asc → desc → unsorted', () => {
    const { result } = setup();

    act(() => result.current.state.toggleSort(nameColumn));
    expect(result.current.state.sort).toEqual({ column: 'name', direction: 'asc' });

    act(() => result.current.state.toggleSort(nameColumn));
    expect(result.current.state.sort).toEqual({ column: 'name', direction: 'desc' });

    act(() => result.current.state.toggleSort(nameColumn));
    expect(result.current.state.sort).toBeNull();
  });

  it('starts a new column at ascending', () => {
    const { result } = setup('/users?sort=-email');

    act(() => result.current.state.toggleSort(nameColumn));

    expect(result.current.state.sort).toEqual({ column: 'name', direction: 'asc' });
  });

  it('sorts by the overriding sort column', () => {
    const { result } = setup();

    act(() => result.current.state.toggleSort(schema.columns[2]));

    expect(result.current.state.sort).toEqual({ column: 'role_id', direction: 'asc' });
  });
});

describe('column visibility', () => {
  it('starts from the schema defaults', () => {
    expect(setup().result.current.state.hiddenColumns).toEqual(['email']);
  });

  it('reads a stored preference in place of the defaults', () => {
    localStorage.setItem('admin.columns.users', JSON.stringify(['name']));
    expect(setup().result.current.state.hiddenColumns).toEqual(['name']);
  });

  it('falls back to the defaults when the stored preference is corrupt', () => {
    localStorage.setItem('admin.columns.users', '{not json');
    expect(setup().result.current.state.hiddenColumns).toEqual(['email']);
  });

  it('toggleColumn hides a visible column and persists it', () => {
    const { result } = setup();

    act(() => result.current.state.toggleColumn('name'));

    expect(result.current.state.hiddenColumns).toEqual(['email', 'name']);
    expect(JSON.parse(localStorage.getItem('admin.columns.users')!)).toEqual(['email', 'name']);
  });

  it('toggleColumn shows a hidden column again', () => {
    const { result } = setup();

    act(() => result.current.state.toggleColumn('email'));

    expect(result.current.state.hiddenColumns).toEqual([]);
  });

  it('scopes the preference to the storage key', () => {
    localStorage.setItem('admin.columns.posts', JSON.stringify(['title']));
    expect(setup('/users', schema, 'users').result.current.state.hiddenColumns).toEqual(['email']);
  });

  it('keeps column visibility out of the URL', () => {
    const { result } = setup();

    act(() => result.current.state.toggleColumn('name'));

    expect(result.current.location.search).toBe('');
  });
});
