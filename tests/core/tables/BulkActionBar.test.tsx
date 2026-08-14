import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkAction, DeleteBulkAction } from '@/core/actions/BulkAction';
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import { defineResource } from '@/core/resources/Resource';
import { ResourceProvider } from '@/core/resources/ResourceContext';
import { BulkActionBar } from '@/core/tables/BulkActionBar';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { TooltipProvider } from '@/core/ui/tooltip';
import { makeUser } from '../../helpers/context';
import { makeDataProvider } from '../../helpers/dataProvider';
import { renderWithProviders } from '../../helpers/render';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  permissions: { delete: 'post.delete' },
  table: { columns: [TextColumn.make('title')] },
});

const records = [
  { id: 1, title: 'First' },
  { id: 2, title: 'Second' },
];

function renderBar(
  overrides: Partial<React.ComponentProps<typeof BulkActionBar>> = {},
  permissions = ['*'],
) {
  const onClear = vi.fn();
  const props = { actions: [], records, onClear, ...overrides };

  const utils = renderWithProviders(
    <TooltipProvider>
      <ResourceProvider resource={resource} refresh={() => undefined}>
        <BulkActionBar {...props} />
      </ResourceProvider>
    </TooltipProvider>,
    { user: makeUser({ permissions }) },
  );

  return { ...utils, onClear };
}

describe('visibility', () => {
  it('renders nothing with no selection', () => {
    const { container } = renderBar({ records: [] });

    expect(container).toBeEmptyDOMElement();
  });

  it('appears once something is selected', () => {
    renderBar();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('reports the selection count', () => {
    renderBar();

    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('reports a single selection', () => {
    renderBar({ records: [records[0]] });

    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});

describe('actions', () => {
  it('renders each bulk action', () => {
    renderBar({ actions: [BulkAction.make('archive').action(vi.fn())] });

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('hands every selected record to the action', async () => {
    const handler = vi.fn();
    renderBar({ actions: [BulkAction.make('archive').action(handler)] });

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
    expect(handler.mock.calls[0][0].records).toEqual(records);
  });

  it('clears the selection after an action completes', async () => {
    const { onClear } = renderBar({ actions: [BulkAction.make('archive').action(vi.fn())] });

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await vi.waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it('hides an action the user is not permitted to run', () => {
    renderBar({ actions: [DeleteBulkAction.make()] }, ['post.view']);

    expect(screen.queryByRole('button', { name: /Delete selected/ })).not.toBeInTheDocument();
  });

  it('deletes every selected record through the provider', async () => {
    const provider = makeDataProvider();
    setDataProvider(provider);

    try {
      renderBar({ actions: [DeleteBulkAction.make()] });

      await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
      await screen.findByRole('alertdialog');
      await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));

      await vi.waitFor(() => expect(provider.deleteMany).toHaveBeenCalledWith('posts', ['1', '2']));
    } finally {
      setDataProvider(restDataProvider);
    }
  });
});

describe('clearing', () => {
  it('offers a labelled clear button', async () => {
    const { onClear } = renderBar();

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onClear).toHaveBeenCalledOnce();
  });

  it('keeps the bar itself click-through so it does not block the table', () => {
    renderBar();

    expect(screen.getByRole('status')).toHaveClass('pointer-events-none');
    const inner = within(screen.getByRole('status')).getByText('2 selected').parentElement;
    expect(inner).toHaveClass('pointer-events-auto');
  });
});
