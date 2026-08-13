import * as React from 'react';
import { useSearchParams } from 'react-router';
import type { Column } from './Column';
import type { Filter } from './filters/Filter';
import type { TableSchema, TableSortState } from './types';

const FILTER_PREFIX = 'f_';

function readSort(raw: string | null): TableSortState | null {
  if (!raw) return null;
  return raw.startsWith('-')
    ? { column: raw.slice(1), direction: 'desc' }
    : { column: raw, direction: 'asc' };
}

function writeSort(sort: TableSortState | null): string | null {
  if (!sort) return null;
  return sort.direction === 'desc' ? `-${sort.column}` : sort.column;
}

/**
 * Table state lives in the query string so a filtered view can be shared and
 * survives a refresh. Column visibility is a per-user preference, so it lives
 * in localStorage instead.
 */
export function useTableState(schema: TableSchema, storageKey: string) {
  const [params, setParams] = useSearchParams();

  const defaultPerPage = schema.defaultPerPage ?? 25;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const perPage = Number(params.get('perPage')) || defaultPerPage;
  const search = params.get('q') ?? '';
  const sort = readSort(params.get('sort')) ?? schema.defaultSort ?? null;

  const filters = React.useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      if (key.startsWith(FILTER_PREFIX) && value !== '')
        result[key.slice(FILTER_PREFIX.length)] = value;
    }
    return result;
  }, [params]);

  const update = React.useCallback(
    (mutate: (next: URLSearchParams) => void, { resetPage = true } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutate(next);
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setValue = React.useCallback(
    (key: string, value: string | number | null, resetPage = true) => {
      update(
        (next) => {
          if (value === null || value === '' || value === undefined) next.delete(key);
          else next.set(key, String(value));
        },
        { resetPage },
      );
    },
    [update],
  );

  const [hiddenColumns, setHiddenColumns] = React.useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`admin.columns.${storageKey}`);
      if (stored) return JSON.parse(stored) as string[];
    } catch {
      // Ignore malformed preferences and fall back to the schema defaults.
    }
    return schema.columns
      .filter((column) => column.definition.hiddenByDefault)
      .map((column) => column.name);
  });

  const toggleColumn = React.useCallback(
    (name: string) => {
      setHiddenColumns((current) => {
        const next = current.includes(name)
          ? current.filter((item) => item !== name)
          : [...current, name];
        localStorage.setItem(`admin.columns.${storageKey}`, JSON.stringify(next));
        return next;
      });
    },
    [storageKey],
  );

  const toggleSort = React.useCallback(
    (column: Column) => {
      const key = column.definition.sortColumn ?? column.name;
      const current = sort;
      let next: TableSortState | null;

      // asc -> desc -> unsorted
      if (!current || current.column !== key) next = { column: key, direction: 'asc' };
      else if (current.direction === 'asc') next = { column: key, direction: 'desc' };
      else next = null;

      setValue('sort', writeSort(next));
    },
    [sort, setValue],
  );

  const setFilter = React.useCallback(
    (filter: Filter, value: string) => setValue(`${FILTER_PREFIX}${filter.name}`, value || null),
    [setValue],
  );

  const resetFilters = React.useCallback(() => {
    update((next) => {
      for (const key of [...next.keys()]) {
        if (key.startsWith(FILTER_PREFIX)) next.delete(key);
      }
      next.delete('q');
    });
  }, [update]);

  return {
    page,
    perPage,
    search,
    sort,
    filters,
    hiddenColumns,
    setPage: (value: number) => setValue('page', value > 1 ? value : null, false),
    setPerPage: (value: number) => setValue('perPage', value === defaultPerPage ? null : value),
    setSearch: (value: string) => setValue('q', value || null),
    toggleSort,
    setFilter,
    resetFilters,
    toggleColumn,
  };
}
