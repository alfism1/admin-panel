import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDataProvider } from '@/core/data/DataProvider';
import { queryKeys } from '@/core/data/queryKeys';
import { restDataProvider } from '@/core/data/restDataProvider';
import { defineResource } from '@/core/resources/Resource';
import { useResourceMutation, useResourceRecord } from '@/core/resources/useResourceRecord';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { makeDataProvider, type MockDataProvider } from '../../helpers/dataProvider';
import { makeQueryClient } from '../../helpers/render';

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  table: { columns: [TextColumn.make('title')] },
});

let provider: MockDataProvider;

beforeEach(() => {
  provider = makeDataProvider();
  setDataProvider(provider);
});

afterEach(() => {
  setDataProvider(restDataProvider);
});

function setup<T>(hook: () => T) {
  const queryClient = makeQueryClient();
  const { result } = renderHook(hook, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { result, queryClient };
}

describe('useResourceRecord', () => {
  it('fetches the record by id', async () => {
    provider.getOne.mockResolvedValue({ id: '7', title: 'Hello' });

    const { result } = setup(() => useResourceRecord(resource, '7'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(provider.getOne).toHaveBeenCalledWith('posts', '7');
    expect(result.current.data).toEqual({ id: '7', title: 'Hello' });
  });

  it('stays disabled without an id, so a create page issues no request', () => {
    const { result } = setup(() => useResourceRecord(resource, undefined));

    expect(result.current.fetchStatus).toBe('idle');
    expect(provider.getOne).not.toHaveBeenCalled();
  });

  it('surfaces a fetch failure', async () => {
    provider.getOne.mockRejectedValue(new Error('Not found'));

    const { result } = setup(() => useResourceRecord(resource, '7'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Not found'));
  });

  it('keys the query by resource and id', async () => {
    provider.getOne.mockResolvedValue({ id: '7' });

    const { result, queryClient } = setup(() => useResourceRecord(resource, '7'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.detail('posts', '7'))).toEqual({ id: '7' });
  });

  it('uses the resource-scoped provider when one is set', async () => {
    const scoped = makeDataProvider();
    scoped.getOne.mockResolvedValue({ id: '7', title: 'Scoped' });
    const scopedResource = { ...resource, dataProvider: scoped };

    const { result } = setup(() => useResourceRecord(scopedResource, '7'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(scoped.getOne).toHaveBeenCalled();
    expect(provider.getOne).not.toHaveBeenCalled();
  });
});

describe('useResourceMutation', () => {
  it('creates when no id is given', async () => {
    const { result } = setup(() => useResourceMutation(resource));

    await result.current.mutateAsync({ title: 'New' });

    expect(provider.create).toHaveBeenCalledWith('posts', { title: 'New' });
    expect(provider.update).not.toHaveBeenCalled();
  });

  it('updates when an id is given', async () => {
    const { result } = setup(() => useResourceMutation(resource, '7'));

    await result.current.mutateAsync({ title: 'Edited' });

    expect(provider.update).toHaveBeenCalledWith('posts', '7', { title: 'Edited' });
    expect(provider.create).not.toHaveBeenCalled();
  });

  it('returns the saved record', async () => {
    provider.create.mockResolvedValue({ id: 9, title: 'New' });

    const { result } = setup(() => useResourceMutation(resource));

    await expect(result.current.mutateAsync({ title: 'New' })).resolves.toEqual({
      id: 9,
      title: 'New',
    });
  });

  it('invalidates the list after a successful save', async () => {
    const { result, queryClient } = setup(() => useResourceMutation(resource));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await result.current.mutateAsync({ title: 'New' });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.lists('posts') });
  });

  it('invalidates the saved record detail, keyed by the returned id', async () => {
    provider.create.mockResolvedValue({ id: 9 });

    const { result, queryClient } = setup(() => useResourceMutation(resource));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await result.current.mutateAsync({ title: 'New' });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.detail('posts', '9') });
  });

  it('skips detail invalidation when the response carries no id', async () => {
    provider.create.mockResolvedValue({ title: 'New' });

    const { result, queryClient } = setup(() => useResourceMutation(resource));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await result.current.mutateAsync({ title: 'New' });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.lists('posts') });
  });

  it('rejects and invalidates nothing when the save fails', async () => {
    provider.create.mockRejectedValue(new Error('Validation failed'));

    const { result, queryClient } = setup(() => useResourceMutation(resource));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await expect(result.current.mutateAsync({ title: 'New' })).rejects.toThrow('Validation failed');
    expect(invalidate).not.toHaveBeenCalled();
  });
});
