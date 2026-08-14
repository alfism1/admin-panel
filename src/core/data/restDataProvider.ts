import { apiClient } from './apiClient';
import type { DataProvider, ID, ListParams, ListResult, RecordShape } from './types';

interface RawListResponse<T> {
  data?: T[];
  meta?: Partial<{ total: number; page: number; per_page: number; last_page: number }>;
  total?: number;
  current_page?: number;
  per_page?: number;
  last_page?: number;
}

function buildQuery(params: ListParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: params.page,
    per_page: params.perPage,
  };

  if (params.sort) {
    query.sort = `${params.sort.order === 'desc' ? '-' : ''}${params.sort.field}`;
  }
  if (params.search) query.search = params.search;

  for (const [key, value] of Object.entries(params.filters ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    query[`filter[${key}]`] = Array.isArray(value) ? value.join(',') : String(value);
  }

  return query;
}

/** Reads pagination metadata from either a `meta` envelope or Laravel's flat shape. */
function readMeta<T>(body: RawListResponse<T>, params: ListParams, rows: T[]) {
  const total = body.meta?.total ?? body.total ?? rows.length;
  const perPage = body.meta?.per_page ?? body.per_page ?? params.perPage;
  return {
    total,
    page: body.meta?.page ?? body.current_page ?? params.page,
    perPage,
    lastPage: body.meta?.last_page ?? body.last_page ?? Math.max(1, Math.ceil(total / perPage)),
  };
}

export const restDataProvider: DataProvider = {
  async getList<T = RecordShape>(resource: string, params: ListParams): Promise<ListResult<T>> {
    const response = await apiClient.get<RawListResponse<T> | T[]>(`/${resource}`, {
      params: buildQuery(params),
    });
    const body = response.data;
    const rows = Array.isArray(body) ? body : (body.data ?? []);
    const meta = Array.isArray(body)
      ? { total: rows.length, page: 1, perPage: params.perPage, lastPage: 1 }
      : readMeta(body, params, rows);
    return { data: rows, meta };
  },

  async getOne<T = RecordShape>(resource: string, id: ID): Promise<T> {
    const response = await apiClient.get<{ data?: T } | T>(`/${resource}/${id}`);
    const body = response.data as { data?: T };
    return body?.data ?? (response.data as T);
  },

  async create<T = RecordShape>(resource: string, data: Partial<T>): Promise<T> {
    const response = await apiClient.post<{ data?: T } | T>(`/${resource}`, data);
    const body = response.data as { data?: T };
    return body?.data ?? (response.data as T);
  },

  async update<T = RecordShape>(resource: string, id: ID, data: Partial<T>): Promise<T> {
    const response = await apiClient.patch<{ data?: T } | T>(`/${resource}/${id}`, data);
    const body = response.data as { data?: T };
    return body?.data ?? (response.data as T);
  },

  async delete(resource: string, id: ID): Promise<void> {
    await apiClient.delete(`/${resource}/${id}`);
  },

  async deleteMany(resource: string, ids: ID[]): Promise<void> {
    await apiClient.post(`/${resource}/bulk-delete`, { ids });
  },

  async getMany<T = RecordShape>(resource: string, ids: ID[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const response = await apiClient.get<RawListResponse<T> | T[]>(`/${resource}`, {
      params: { 'filter[id]': ids.join(','), per_page: ids.length },
    });
    const body = response.data;
    return Array.isArray(body) ? body : (body.data ?? []);
  },
};
