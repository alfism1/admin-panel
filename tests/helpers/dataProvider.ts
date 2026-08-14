import { vi } from 'vitest';
import type { DataProvider, ListResult, RecordShape } from '@/core/data/types';

export type MockDataProvider = {
  [K in keyof DataProvider]: ReturnType<typeof vi.fn>;
} & DataProvider;

/** A `DataProvider` whose every method is a spy, wired to resolve by default. */
export function makeDataProvider(): MockDataProvider {
  return {
    getList: vi.fn().mockResolvedValue(listResult([])),
    getOne: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockImplementation((_resource, data) => Promise.resolve({ id: 1, ...data })),
    update: vi.fn().mockImplementation((_resource, id, data) => Promise.resolve({ id, ...data })),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    getMany: vi.fn().mockResolvedValue([]),
  } as MockDataProvider;
}

export function listResult<T extends RecordShape>(
  rows: T[],
  meta: Partial<ListResult<T>['meta']> = {},
): ListResult<T> {
  const perPage = meta.perPage ?? 25;
  const total = meta.total ?? rows.length;

  return {
    data: rows,
    meta: {
      total,
      page: meta.page ?? 1,
      perPage,
      lastPage: meta.lastPage ?? Math.max(1, Math.ceil(total / perPage)),
    },
  };
}

/** Never-settling promise, for asserting on loading states. */
export function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}
