import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/data/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  API_URL: '/api',
  USE_MOCK: false,
}));

const { apiClient } = await import('@/core/data/apiClient');
const { restDataProvider } = await import('@/core/data/restDataProvider');

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const patch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

const params = { page: 2, perPage: 10 };

describe('getList query building', () => {
  beforeEach(() => get.mockResolvedValue({ data: { data: [] } }));

  it('sends page and per_page', async () => {
    await restDataProvider.getList('users', params);

    expect(get).toHaveBeenCalledWith('/users', { params: { page: 2, per_page: 10 } });
  });

  it('encodes an ascending sort as a bare field', async () => {
    await restDataProvider.getList('users', { ...params, sort: { field: 'name', order: 'asc' } });

    expect(get.mock.calls[0][1].params.sort).toBe('name');
  });

  it('encodes a descending sort with a leading dash', async () => {
    await restDataProvider.getList('users', { ...params, sort: { field: 'name', order: 'desc' } });

    expect(get.mock.calls[0][1].params.sort).toBe('-name');
  });

  it('sends the search term', async () => {
    await restDataProvider.getList('users', { ...params, search: 'ada' });

    expect(get.mock.calls[0][1].params.search).toBe('ada');
  });

  it('omits an empty search term', async () => {
    await restDataProvider.getList('users', { ...params, search: '' });

    expect(get.mock.calls[0][1].params).not.toHaveProperty('search');
  });

  it('rewrites filters into filter[key] form', async () => {
    await restDataProvider.getList('users', { ...params, filters: { status: 'draft' } });

    expect(get.mock.calls[0][1].params['filter[status]']).toBe('draft');
  });

  it('joins an array filter with commas', async () => {
    await restDataProvider.getList('users', { ...params, filters: { id: [1, 2, 3] } });

    expect(get.mock.calls[0][1].params['filter[id]']).toBe('1,2,3');
  });

  it('drops empty, null and undefined filters', async () => {
    await restDataProvider.getList('users', {
      ...params,
      filters: { a: '', b: null, c: undefined, d: 'keep' },
    });

    const query = get.mock.calls[0][1].params;
    expect(Object.keys(query).filter((key) => key.startsWith('filter['))).toEqual(['filter[d]']);
  });

  it('keeps a false filter, which is a real value', async () => {
    await restDataProvider.getList('users', { ...params, filters: { active: false } });

    expect(get.mock.calls[0][1].params['filter[active]']).toBe('false');
  });
});

describe('getList response shapes', () => {
  const rows = [{ id: 1 }, { id: 2 }];

  it('reads a meta envelope', async () => {
    get.mockResolvedValue({
      data: { data: rows, meta: { total: 42, page: 2, per_page: 10, last_page: 5 } },
    });

    expect(await restDataProvider.getList('users', params)).toEqual({
      data: rows,
      meta: { total: 42, page: 2, perPage: 10, lastPage: 5 },
    });
  });

  it("reads Laravel's flat pagination shape", async () => {
    get.mockResolvedValue({
      data: { data: rows, total: 42, current_page: 2, per_page: 10, last_page: 5 },
    });

    expect((await restDataProvider.getList('users', params)).meta).toEqual({
      total: 42,
      page: 2,
      perPage: 10,
      lastPage: 5,
    });
  });

  it('derives lastPage when the server omits it', async () => {
    get.mockResolvedValue({ data: { data: rows, total: 42 } });

    expect((await restDataProvider.getList('users', params)).meta.lastPage).toBe(5);
  });

  it('never reports fewer than one page', async () => {
    get.mockResolvedValue({ data: { data: [], total: 0 } });

    expect((await restDataProvider.getList('users', params)).meta.lastPage).toBe(1);
  });

  it('handles a bare array response as a single page', async () => {
    get.mockResolvedValue({ data: rows });

    expect(await restDataProvider.getList('users', params)).toEqual({
      data: rows,
      meta: { total: 2, page: 1, perPage: 10, lastPage: 1 },
    });
  });

  it('falls back to an empty list when data is missing', async () => {
    get.mockResolvedValue({ data: {} });

    const result = await restDataProvider.getList('users', params);
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });
});

describe('single-record operations', () => {
  it('getOne unwraps a data envelope', async () => {
    get.mockResolvedValue({ data: { data: { id: 1, name: 'Ada' } } });

    expect(await restDataProvider.getOne('users', 1)).toEqual({ id: 1, name: 'Ada' });
    expect(get).toHaveBeenCalledWith('/users/1');
  });

  it('getOne accepts a bare record', async () => {
    get.mockResolvedValue({ data: { id: 1, name: 'Ada' } });

    expect(await restDataProvider.getOne('users', 1)).toEqual({ id: 1, name: 'Ada' });
  });

  it('getOne accepts a string id', async () => {
    get.mockResolvedValue({ data: { data: { id: 'abc' } } });

    await restDataProvider.getOne('users', 'abc');
    expect(get).toHaveBeenCalledWith('/users/abc');
  });

  it('create posts to the collection and unwraps the result', async () => {
    post.mockResolvedValue({ data: { data: { id: 3, name: 'New' } } });

    expect(await restDataProvider.create('users', { name: 'New' })).toEqual({
      id: 3,
      name: 'New',
    });
    expect(post).toHaveBeenCalledWith('/users', { name: 'New' });
  });

  it('update patches the record', async () => {
    patch.mockResolvedValue({ data: { data: { id: 1, name: 'Edited' } } });

    expect(await restDataProvider.update('users', 1, { name: 'Edited' })).toEqual({
      id: 1,
      name: 'Edited',
    });
    expect(patch).toHaveBeenCalledWith('/users/1', { name: 'Edited' });
  });

  it('delete issues a DELETE and resolves to nothing', async () => {
    del.mockResolvedValue({ data: {} });

    expect(await restDataProvider.delete('users', 1)).toBeUndefined();
    expect(del).toHaveBeenCalledWith('/users/1');
  });
});

describe('bulk operations', () => {
  it('deleteMany posts the ids to a bulk endpoint', async () => {
    post.mockResolvedValue({ data: {} });

    await restDataProvider.deleteMany('users', [1, 2, 3]);

    expect(post).toHaveBeenCalledWith('/users/bulk-delete', { ids: [1, 2, 3] });
  });

  it('getMany filters by a comma-joined id list sized to the request', async () => {
    get.mockResolvedValue({ data: { data: [{ id: 1 }, { id: 2 }] } });

    await restDataProvider.getMany('users', [1, 2]);

    expect(get).toHaveBeenCalledWith('/users', {
      params: { 'filter[id]': '1,2', per_page: 2 },
    });
  });

  it('getMany short-circuits on an empty id list', async () => {
    expect(await restDataProvider.getMany('users', [])).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('getMany accepts a bare array response', async () => {
    get.mockResolvedValue({ data: [{ id: 1 }] });

    expect(await restDataProvider.getMany('users', [1])).toEqual([{ id: 1 }]);
  });
});

describe('responses without a data envelope', () => {
  it('create accepts a bare record', async () => {
    post.mockResolvedValue({ data: { id: 3, name: 'New' } });

    expect(await restDataProvider.create('users', { name: 'New' })).toEqual({
      id: 3,
      name: 'New',
    });
  });

  it('update accepts a bare record', async () => {
    patch.mockResolvedValue({ data: { id: 1, name: 'Edited' } });

    expect(await restDataProvider.update('users', 1, { name: 'Edited' })).toEqual({
      id: 1,
      name: 'Edited',
    });
  });

  it('getMany falls back to an empty list when the envelope carries no data', async () => {
    get.mockResolvedValue({ data: { meta: { total: 0 } } });

    expect(await restDataProvider.getMany('users', [1])).toEqual([]);
  });
});
