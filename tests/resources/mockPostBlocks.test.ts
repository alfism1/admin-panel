import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import { AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withMockPostBlocks } from '@/resources/data/mockPostBlocks';

const STORAGE_KEY = 'admin.mock-post-blocks.v1';

const passthrough = vi.fn<AxiosAdapter>();
const adapter = withMockPostBlocks(passthrough);

type Body = Record<string, unknown>;

const call = (config: AxiosRequestConfig) => adapter(config as Parameters<AxiosAdapter>[0]);

const rows = (): Body[] => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Body[];

// `restoreMocks` is on globally, so the implementation is re-applied per test.
beforeEach(() => {
  localStorage.clear();
  passthrough.mockReset();
  passthrough.mockResolvedValue({
    data: { delegated: true },
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config: {} as AxiosRequestConfig,
  } as AxiosResponse);
});

describe('delegation', () => {
  it('hands any other path to the adapter it wraps', async () => {
    const response = await call({ url: '/posts/1', method: 'get' });

    expect(passthrough).toHaveBeenCalledOnce();
    expect(response.data).toEqual({ delegated: true });
  });

  it('delegates a request with no url at all', async () => {
    await call({ method: 'get' });

    expect(passthrough).toHaveBeenCalledOnce();
  });
});

describe('seeding', () => {
  it('seeds two blocks for each of the first twelve posts', async () => {
    await call({ url: '/post_blocks', method: 'get', params: { per_page: 100 } });

    expect(rows()).toHaveLength(24);
    expect(rows()[0]).toMatchObject({ post_id: 1, kind: 'paragraph', position: 0 });
  });

  it('reseeds over a corrupt payload rather than throwing', async () => {
    localStorage.setItem(STORAGE_KEY, 'not json');

    const response = await call({ url: '/post_blocks', method: 'get', params: { per_page: 100 } });

    expect((response.data as { meta: { total: number } }).meta.total).toBe(24);
  });
});

describe('listing', () => {
  it('filters by a single parent and paginates', async () => {
    const response = await call({
      url: '/post_blocks',
      method: 'get',
      params: { 'filter[post_id]': 3, page: 1, per_page: 100 },
    });

    const body = response.data as { data: Body[]; meta: Body };
    expect(body.data.map((row) => row.post_id)).toEqual([3, 3]);
    expect(body.meta).toEqual({ total: 2, page: 1, per_page: 100, last_page: 1 });
  });

  it('accepts a comma-separated set of parents', async () => {
    const response = await call({
      url: '/post_blocks',
      method: 'get',
      params: { 'filter[post_id]': '1,2', per_page: 100 },
    });

    expect((response.data as { data: Body[] }).data).toHaveLength(4);
  });

  it('ignores an empty filter', async () => {
    const response = await call({
      url: '/post_blocks',
      method: 'get',
      params: { 'filter[post_id]': '', per_page: 100 },
    });

    expect((response.data as { data: Body[] }).data).toHaveLength(24);
  });

  it('sorts ascending and descending', async () => {
    const ascending = await call({
      url: '/post_blocks',
      method: 'get',
      params: { 'filter[post_id]': 1, sort: 'position' },
    });
    const descending = await call({
      url: '/post_blocks',
      method: 'get',
      params: { 'filter[post_id]': 1, sort: '-position' },
    });

    expect((ascending.data as { data: Body[] }).data.map((row) => row.position)).toEqual([0, 1]);
    expect((descending.data as { data: Body[] }).data.map((row) => row.position)).toEqual([1, 0]);
  });

  it('defaults the page size', async () => {
    const response = await call({ url: '/post_blocks', method: 'get' });

    expect((response.data as { data: Body[] }).data).toHaveLength(24);
    expect((response.data as { meta: Body }).meta).toMatchObject({ per_page: 25, last_page: 1 });
  });
});

describe('writing', () => {
  it('creates a row with the next id', async () => {
    const response = await call({
      url: '/post_blocks',
      method: 'post',
      data: JSON.stringify({ post_id: 1, body: 'New' }),
    });

    expect(response.status).toBe(201);
    expect((response.data as { data: Body }).data).toMatchObject({ id: 25, body: 'New' });
    expect(rows()).toHaveLength(25);
  });

  it('ignores a stored row whose id is not a number when picking the next one', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'legacy' }, { id: 4 }]));

    const response = await call({
      url: '/post_blocks',
      method: 'post',
      data: JSON.stringify({ post_id: 1 }),
    });

    expect((response.data as { data: Body }).data.id).toBe(5);
  });

  it('accepts an object body as well as a string', async () => {
    const response = await call({
      url: '/post_blocks',
      method: 'post',
      data: { post_id: 1, body: 'Object' },
    });

    expect((response.data as { data: Body }).data).toMatchObject({ body: 'Object' });
  });

  it('treats an unparseable body as empty', async () => {
    const response = await call({ url: '/post_blocks', method: 'post', data: '{oops' });

    expect((response.data as { data: Body }).data).toMatchObject({ id: 25 });
  });

  it('updates a row', async () => {
    const response = await call({
      url: '/post_blocks/1',
      method: 'patch',
      data: JSON.stringify({ body: 'Edited' }),
    });

    expect((response.data as { data: Body }).data).toMatchObject({ id: 1, body: 'Edited' });
    expect(rows()[0]).toMatchObject({ body: 'Edited' });
  });

  it('404s on an update to a row that is gone', async () => {
    await expect(call({ url: '/post_blocks/999', method: 'put', data: '{}' })).rejects.toThrow(
      'Record not found.',
    );
  });

  it('deletes one row', async () => {
    await call({ url: '/post_blocks/1', method: 'delete' });

    expect(rows().some((row) => row.id === 1)).toBe(false);
  });

  it('bulk deletes', async () => {
    const response = await call({
      url: '/post_blocks/bulk-delete',
      method: 'post',
      data: JSON.stringify({ ids: [1, 2, 3] }),
    });

    expect(response.data).toEqual({ success: true, deleted: 3 });
    expect(rows()).toHaveLength(21);
  });

  it('bulk deletes nothing when no ids are sent', async () => {
    await call({ url: '/post_blocks/bulk-delete', method: 'post', data: JSON.stringify({}) });

    expect(rows()).toHaveLength(24);
  });
});

describe('unknown routes', () => {
  it('404s rather than falling through to the wrapped adapter', async () => {
    await expect(call({ url: '/post_blocks/1/publish', method: 'get' })).rejects.toThrow(
      'No mock route for GET /post_blocks/1/publish',
    );
    expect(passthrough).not.toHaveBeenCalled();
  });

  it('defaults a missing method to get', async () => {
    const response = await call({ url: '/post_blocks' });

    expect((response.data as { data: Body[] }).data).toHaveLength(24);
  });
});
