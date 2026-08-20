import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Action } from '@/core/actions/Action';
import { DeleteBulkAction } from '@/core/actions/BulkAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { ExportBulkAction } from '@/core/actions/ExportBulkAction';
import { ReplicateAction, ReplicateBulkAction } from '@/core/actions/ReplicateAction';
import { useActionRunner } from '@/core/actions/useActionRunner';
import { setDataProvider } from '@/core/data/DataProvider';
import { queryKeys } from '@/core/data/queryKeys';
import { restDataProvider } from '@/core/data/restDataProvider';
import type { DataProvider, RecordShape } from '@/core/data/types';
import { defineResource } from '@/core/resources/Resource';
import { ResourceProvider } from '@/core/resources/ResourceContext';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { makeQueryClient } from '../../helpers/render';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const { notify } = await import('@/core/ui/notify');

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  recordTitleKey: 'title',
  table: { columns: [TextColumn.make('title')] },
});

const record: RecordShape = { id: 7, title: 'Hello world' };

/** What `getOne` hands back: the row in the table carries only its columns. */
const full: RecordShape = {
  id: 7,
  title: 'Hello world',
  views: 12,
  created_at: '2026-01-01',
  updated_at: '2026-01-02',
};

const provider = {
  getList: vi.fn(),
  getOne: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  getMany: vi.fn(),
} satisfies DataProvider;

beforeEach(() => {
  setDataProvider(provider);
  navigate.mockReset();
  provider.delete.mockReset().mockResolvedValue(undefined);
  provider.deleteMany.mockReset().mockResolvedValue(undefined);
  provider.getOne.mockReset().mockResolvedValue(full);
  provider.create.mockReset().mockResolvedValue({ id: 8, title: 'Hello world' });
});

afterEach(() => {
  setDataProvider(restDataProvider);
});

function setup(action: Action, { withResource = true, using = resource } = {}) {
  const queryClient = makeQueryClient();

  const { result } = renderHook(() => useActionRunner(action), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {withResource ? (
            <ResourceProvider resource={using} refresh={() => undefined}>
              {children}
            </ResourceProvider>
          ) : (
            children
          )}
        </MemoryRouter>
      </QueryClientProvider>
    ),
  });

  return { result, queryClient };
}

const payload = (
  overrides: Partial<Parameters<ReturnType<typeof useActionRunner>['run']>[0]> = {},
) => ({
  record,
  records: [] as RecordShape[],
  data: {},
  ...overrides,
});

describe('custom handlers', () => {
  it('runs the handler with a full action context', async () => {
    const handler = vi.fn();
    const { result } = setup(Action.make('publish').action(handler));

    await result.current.run(payload());

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toMatchObject({ record, records: [], data: {} });
    expect(typeof handler.mock.calls[0][0].navigate).toBe('function');
    expect(typeof handler.mock.calls[0][0].refresh).toBe('function');
  });

  it('passes form data through', async () => {
    const handler = vi.fn();
    const { result } = setup(Action.make('reject').action(handler));

    await result.current.run(payload({ data: { reason: 'Not ready' } }));

    expect(handler.mock.calls[0][0].data).toEqual({ reason: 'Not ready' });
  });

  it('resolves without a handler, so a no-op action is legal', async () => {
    const { result } = setup(Action.make('ping'));
    await expect(result.current.run(payload())).resolves.toBeDefined();
  });

  it('is idle before anything runs and settles back afterwards', async () => {
    const { result } = setup(Action.make('publish').action(vi.fn()));

    expect(result.current.isRunning).toBe(false);

    await result.current.run(payload());

    await waitFor(() => expect(result.current.isRunning).toBe(false));
  });
});

describe('built-in delete', () => {
  it('deletes the record through the provider', async () => {
    const { result } = setup(DeleteAction.make());

    await result.current.run(payload());

    expect(provider.delete).toHaveBeenCalledWith('posts', '7');
  });

  it('stringifies the id, since routes are strings', async () => {
    const { result } = setup(DeleteAction.make());

    await result.current.run(payload({ record: { id: 42 } }));

    expect(provider.delete).toHaveBeenCalledWith('posts', '42');
  });

  it('does nothing without a record', async () => {
    const { result } = setup(DeleteAction.make());

    await result.current.run(payload({ record: null }));

    expect(provider.delete).not.toHaveBeenCalled();
  });

  it('deleteBulk passes every selected id', async () => {
    const { result } = setup(DeleteBulkAction.make());

    await result.current.run(payload({ record: null, records: [{ id: 1 }, { id: 2 }] }));

    expect(provider.deleteMany).toHaveBeenCalledWith('posts', ['1', '2']);
  });

  it('runs a handler alongside the built-in deletion', async () => {
    const handler = vi.fn();
    const { result } = setup(DeleteAction.make().action(handler));

    await result.current.run(payload());

    expect(provider.delete).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });
});

describe('built-in replicate', () => {
  it('copies the record the provider knows, not the row the table drew', async () => {
    const { result } = setup(ReplicateAction.make());

    await result.current.run(payload());

    expect(provider.getOne).toHaveBeenCalledWith('posts', '7');
    expect(provider.create).toHaveBeenCalledWith('posts', { title: 'Hello world', views: 12 });
  });

  it('drops the columns the action excludes', async () => {
    const { result } = setup(ReplicateAction.make().exclude('views'));

    await result.current.run(payload());

    expect(provider.create).toHaveBeenCalledWith('posts', { title: 'Hello world' });
  });

  it('passes the copy and its source through the mutator', async () => {
    const mutate = vi.fn(async (replica: RecordShape) => ({ ...replica, title: 'Hello (copy)' }));
    const { result } = setup(ReplicateAction.make().beforeReplicaSaved(mutate));

    await result.current.run(payload());

    expect(mutate).toHaveBeenCalledWith({ title: 'Hello world', views: 12 }, full);
    expect(provider.create).toHaveBeenCalledWith('posts', {
      title: 'Hello (copy)',
      views: 12,
    });
  });

  it('opens the copy when a redirect is configured', async () => {
    const { result } = setup(ReplicateAction.make().redirectTo('edit'));

    await result.current.run(payload());

    expect(navigate).toHaveBeenCalledWith('/posts/8/edit');
  });

  it('stays on the page by default', async () => {
    const { result } = setup(ReplicateAction.make());

    await result.current.run(payload());

    expect(navigate).not.toHaveBeenCalled();
  });

  it('copies every selected record in a bulk run, and redirects to none of them', async () => {
    provider.getOne.mockImplementation((_resource: string, id: string) =>
      Promise.resolve({ id, title: `Post ${String(id)}` }),
    );
    const { result } = setup(ReplicateBulkAction.make().redirectTo('edit'));

    await result.current.run(payload({ record: null, records: [{ id: 1 }, { id: 2 }] }));

    expect(provider.create).toHaveBeenNthCalledWith(1, 'posts', { title: 'Post 1' });
    expect(provider.create).toHaveBeenNthCalledWith(2, 'posts', { title: 'Post 2' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('has nothing to copy, and nowhere to go, without a record', async () => {
    const { result } = setup(ReplicateAction.make().redirectTo('edit'));

    await result.current.run(payload({ record: null }));

    expect(provider.create).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reports the built-in success message', async () => {
    const { result } = setup(ReplicateAction.make());

    await result.current.run(payload());

    expect(notify.success).toHaveBeenCalledWith('Post duplicated.');
  });
});

describe('built-in export', () => {
  const rows = [
    { id: 1, title: 'First', author: { name: 'Ada' } },
    { id: 2, title: 'Second', author: { name: 'Grace' } },
  ];

  let click: MockInstance;

  beforeEach(() => {
    // jsdom would otherwise try to navigate to the blob URL.
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
  });

  /** Reads back what `downloadCsv` put in the Blob. */
  async function downloaded(): Promise<{ text: string; name: string }> {
    const link = click.mock.instances[0] as HTMLAnchorElement;
    const blob = (URL.createObjectURL as unknown as MockInstance).mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    return { text, name: link.download };
  }

  it('downloads the selection under the table headers', async () => {
    const { result } = setup(ExportBulkAction.make());

    await result.current.run(payload({ record: null, records: rows }));

    const { text, name } = await downloaded();
    expect(text).toBe('Title\r\nFirst\r\nSecond');
    expect(name).toBe(`posts-${new Date().toISOString().slice(0, 10)}.csv`);
  });

  it('exports the columns the action names, embeds included', async () => {
    const action = ExportBulkAction.make().columns({ id: 'ID', 'author.name': 'Author' });
    const { result } = setup(action);

    await result.current.run(payload({ record: null, records: rows }));

    expect((await downloaded()).text).toBe('ID,Author\r\n1,Ada\r\n2,Grace');
  });

  it('honours a custom file name and delimiter', async () => {
    const action = ExportBulkAction.make()
      .columns({ id: 'ID', title: 'Title' })
      .fileName(() => 'chosen.csv')
      .delimiter(';');
    const { result } = setup(action);

    await result.current.run(payload({ record: null, records: rows }));

    const { text, name } = await downloaded();
    expect(text).toBe('ID;Title\r\n1;First\r\n2;Second');
    expect(name).toBe('chosen.csv');
  });

  it('exports the one row a row action was rendered against', async () => {
    const { result } = setup(ExportBulkAction.make());

    await result.current.run(payload());

    expect((await downloaded()).text).toBe('Title\r\nHello world');
  });

  it('falls back to the record keys when the resource declares no columns', async () => {
    const bare = defineResource({ name: 'notes', table: { columns: [] } });
    const { result } = setup(ExportBulkAction.make(), { using: bare });

    await result.current.run(payload({ record: null, records: [{ id: 1, body: 'Hi' }] }));

    expect((await downloaded()).text).toBe('ID,Body\r\n1,Hi');
  });

  it('fails with a readable message when nothing is selected', async () => {
    const { result } = setup(ExportBulkAction.make());

    await expect(result.current.run(payload({ record: null }))).rejects.toThrow(
      'There is nothing to export.',
    );

    expect(click).not.toHaveBeenCalled();
  });
});

describe('notifications', () => {
  it('reports the built-in success message', async () => {
    const { result } = setup(DeleteAction.make());

    await result.current.run(payload());

    expect(notify.success).toHaveBeenCalledWith('Post deleted.');
  });

  it('falls back to "<Label> completed." for a custom action', async () => {
    const { result } = setup(Action.make('publish').action(vi.fn()));

    await result.current.run(payload());

    expect(notify.success).toHaveBeenCalledWith('Publish completed.');
  });

  it('prefers an explicit success message', async () => {
    const { result } = setup(Action.make('publish').action(vi.fn()).successNotification('Live!'));

    await result.current.run(payload());

    expect(notify.success).toHaveBeenCalledWith('Live!');
  });

  it('stays silent when success notifications are off', async () => {
    const { result } = setup(Action.make('publish').action(vi.fn()).successNotification(false));

    await result.current.run(payload());

    expect(notify.success).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it('rejects and toasts the normalized message when the handler throws', async () => {
    const action = Action.make('publish').action(() => {
      throw new Error('Upstream refused');
    });
    const { result } = setup(action);

    await expect(result.current.run(payload())).rejects.toThrow('Upstream refused');

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Upstream refused'));
  });

  it('toasts when the data provider rejects', async () => {
    provider.delete.mockRejectedValue(new Error('Row is referenced elsewhere'));
    const { result } = setup(DeleteAction.make());

    await expect(result.current.run(payload())).rejects.toThrow('Row is referenced elsewhere');

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Row is referenced elsewhere'));
  });

  it('prefers an explicit failure message', async () => {
    provider.delete.mockRejectedValue(new Error('Boom'));
    const { result } = setup(DeleteAction.make().failureNotification('Could not delete.'));

    await expect(result.current.run(payload())).rejects.toThrow();

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Could not delete.'));
  });

  it('stays silent when failure notifications are off', async () => {
    provider.delete.mockRejectedValue(new Error('Boom'));
    const { result } = setup(DeleteAction.make().failureNotification(false));

    await expect(result.current.run(payload())).rejects.toThrow();

    expect(notify.error).not.toHaveBeenCalled();
  });

  it('does not report success when the action failed', async () => {
    provider.delete.mockRejectedValue(new Error('Boom'));
    const { result } = setup(DeleteAction.make());

    await expect(result.current.run(payload())).rejects.toThrow();

    expect(notify.success).not.toHaveBeenCalled();
  });
});

describe('cache invalidation', () => {
  it('invalidates the list and detail queries after a successful run', async () => {
    const { result, queryClient } = setup(Action.make('publish').action(vi.fn()));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await result.current.run(payload());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.lists('posts') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.details('posts') });
  });

  it('calls onDone after a successful run', async () => {
    const onDone = vi.fn();
    const { result } = setup(Action.make('publish').action(vi.fn()));

    await result.current.run(payload({ onDone }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it('does not call onDone when the action failed', async () => {
    const onDone = vi.fn();
    provider.delete.mockRejectedValue(new Error('Boom'));
    const { result } = setup(DeleteAction.make());

    await expect(result.current.run(payload({ onDone }))).rejects.toThrow();

    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('outside a resource', () => {
  it('runs a custom handler and reports success', async () => {
    const handler = vi.fn();
    const { result } = setup(Action.make('ping').action(handler), { withResource: false });

    await result.current.run(payload());

    expect(handler).toHaveBeenCalled();
    expect(notify.success).toHaveBeenCalledWith('Ping completed.');
  });

  it('skips the provider call for a built-in delete with no resource', async () => {
    const { result } = setup(DeleteAction.make(), { withResource: false });

    await result.current.run(payload());

    expect(provider.delete).not.toHaveBeenCalled();
  });

  it('exposes no resource', () => {
    const { result } = setup(Action.make('ping'), { withResource: false });
    expect(result.current.resource).toBeUndefined();
  });
});

describe('ctx.close', () => {
  it('lets a handler dismiss the modal it was opened from', async () => {
    const onDone = vi.fn();
    const { result } = setup(
      Action.make('publish').action((ctx) => {
        ctx.close();
      }),
    );

    await result.current.run(payload({ onDone }));

    // Once from the handler, once from `onSuccess`.
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it('is safe when no onDone was supplied', async () => {
    const { result } = setup(
      Action.make('publish').action((ctx) => {
        ctx.close();
      }),
    );

    await expect(result.current.run(payload())).resolves.toBeDefined();
  });
});
