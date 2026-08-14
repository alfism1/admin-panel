import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Action } from '@/core/actions/Action';
import { BulkAction } from '@/core/actions/BulkAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import { defineResource } from '@/core/resources/Resource';
import { ResourceProvider } from '@/core/resources/ResourceContext';
import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { SelectFilter } from '@/core/tables/filters/SelectFilter';
import { SchemaTable } from '@/core/tables/SchemaTable';
import type { TableSchema } from '@/core/tables/types';
import { TooltipProvider } from '@/core/ui/tooltip';
import { makeUser } from '../../helpers/context';
import {
  listResult,
  makeDataProvider,
  pending,
  type MockDataProvider,
} from '../../helpers/dataProvider';
import { renderWithProviders } from '../../helpers/render';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  recordTitleKey: 'title',
  permissions: { view: 'post.view', update: 'post.update', delete: 'post.delete' },
  table: { columns: [TextColumn.make('title')] },
});

const rows = [
  { id: 1, title: 'First post', status: 'draft', is_featured: true },
  { id: 2, title: 'Second post', status: 'published', is_featured: false },
];

const baseSchema: TableSchema = {
  columns: [
    TextColumn.make('title').sortable().searchable(),
    TextColumn.make('status'),
    BooleanColumn.make('is_featured').toggleable(),
  ],
};

let provider: MockDataProvider;

beforeEach(() => {
  provider = makeDataProvider();
  provider.getList.mockResolvedValue(listResult(rows));
  setDataProvider(provider);
});

afterEach(() => {
  setDataProvider(restDataProvider);
});

function renderTable(
  schema: Partial<TableSchema> = {},
  options: { permissions?: string[]; route?: string } = {},
) {
  const merged: TableSchema = { ...baseSchema, ...schema };

  return renderWithProviders(
    <TooltipProvider>
      <ResourceProvider resource={resource} refresh={() => undefined}>
        <SchemaTable resource="posts" schema={merged} />
      </ResourceProvider>
    </TooltipProvider>,
    {
      route: options.route ?? '/posts',
      user: makeUser({ permissions: options.permissions ?? ['*'] }),
    },
  );
}

/**
 * The desktop table and the mobile card list are both in the DOM — jsdom applies
 * no CSS, so `md:hidden` hides nothing. Every row assertion is scoped to one.
 */
const table = () => screen.getByRole('table');

async function waitForRows() {
  await waitFor(() => expect(within(table()).getByText('First post')).toBeInTheDocument());
}

describe('data loading', () => {
  it('requests the first page with the schema defaults', async () => {
    renderTable();

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith('posts', {
        page: 1,
        perPage: 25,
        search: undefined,
        sort: undefined,
        filters: {},
      }),
    );
  });

  it('renders a row per record', async () => {
    renderTable();
    await waitForRows();

    expect(within(table()).getByText('Second post')).toBeInTheDocument();
    expect(within(table()).getAllByRole('row')).toHaveLength(3); // header + 2
  });

  it('renders column headers from the schema', async () => {
    renderTable();
    await waitForRows();

    expect(within(table()).getByRole('columnheader', { name: /Title/ })).toBeInTheDocument();
    expect(within(table()).getByRole('columnheader', { name: /Status/ })).toBeInTheDocument();
  });

  it('shows skeleton rows while loading', () => {
    provider.getList.mockReturnValue(pending());

    const { container } = renderTable();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('honours the schema default sort in the initial request', async () => {
    renderTable({ defaultSort: { column: 'title', direction: 'desc' } });

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ sort: { field: 'title', order: 'desc' } }),
      ),
    );
  });

  it('honours the schema default page size', async () => {
    renderTable({ defaultPerPage: 10 });

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ perPage: 10 }),
      ),
    );
  });

  it('reads page and search from the URL', async () => {
    renderTable({}, { route: '/posts?page=2&q=hello' });

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ page: 2, search: 'hello' }),
      ),
    );
  });
});

describe('empty and error states', () => {
  it('shows the empty state when there are no records', async () => {
    provider.getList.mockResolvedValue(listResult([]));

    renderTable();

    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('uses the configured empty-state copy', async () => {
    provider.getList.mockResolvedValue(listResult([]));

    renderTable({ emptyState: { heading: 'No posts', description: 'Write one.' } });

    expect(await screen.findByText('No posts')).toBeInTheDocument();
    expect(screen.getByText('Write one.')).toBeInTheDocument();
  });

  it('shows a filtered empty state when a search is active', async () => {
    provider.getList.mockResolvedValue(listResult([]));

    renderTable({}, { route: '/posts?q=nothing' });

    expect(await screen.findByText('No matching records')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('clears the search from the filtered empty state', async () => {
    provider.getList.mockResolvedValue(listResult([]));

    renderTable({}, { route: '/posts?q=nothing' });
    await userEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));

    await waitFor(() =>
      expect(provider.getList).toHaveBeenLastCalledWith(
        'posts',
        expect.objectContaining({ search: undefined }),
      ),
    );
  });

  it('shows an error state with the failure message', async () => {
    provider.getList.mockRejectedValue(new Error('Database unreachable'));

    renderTable();

    expect(await screen.findByText('Could not load this table')).toBeInTheDocument();
    expect(screen.getByText('Database unreachable')).toBeInTheDocument();
  });

  it('refetches from the error state', async () => {
    provider.getList.mockRejectedValueOnce(new Error('Boom'));
    provider.getList.mockResolvedValue(listResult(rows));

    renderTable();
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitForRows();
  });

  it('hides the table body entirely while erroring', async () => {
    provider.getList.mockRejectedValue(new Error('Boom'));

    renderTable();
    await screen.findByText('Could not load this table');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('sorting', () => {
  it('sorts ascending on the first header click', async () => {
    renderTable();
    await waitForRows();

    await userEvent.click(within(table()).getByRole('button', { name: /Title/ }));

    await waitFor(() =>
      expect(provider.getList).toHaveBeenLastCalledWith(
        'posts',
        expect.objectContaining({ sort: { field: 'title', order: 'asc' } }),
      ),
    );
  });

  it('cycles to descending, then back to unsorted', async () => {
    renderTable();
    await waitForRows();
    const header = () => within(table()).getByRole('button', { name: /Title/ });

    await userEvent.click(header());
    await waitFor(() =>
      expect(within(table()).getByRole('columnheader', { name: /Title/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      ),
    );

    await userEvent.click(header());
    await waitFor(() =>
      expect(within(table()).getByRole('columnheader', { name: /Title/ })).toHaveAttribute(
        'aria-sort',
        'descending',
      ),
    );

    await userEvent.click(header());
    await waitFor(() =>
      expect(within(table()).getByRole('columnheader', { name: /Title/ })).not.toHaveAttribute(
        'aria-sort',
      ),
    );
  });

  it('offers no sort control on a non-sortable column', async () => {
    renderTable();
    await waitForRows();

    const status = within(table()).getByRole('columnheader', { name: /Status/ });
    expect(within(status).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('search', () => {
  it('debounces the search term into the query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderTable();
    await waitFor(() => expect(provider.getList).toHaveBeenCalled());

    await user.type(screen.getByRole('searchbox', { name: 'Search records' }), 'hello');
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() =>
      expect(provider.getList).toHaveBeenLastCalledWith(
        'posts',
        expect.objectContaining({ search: 'hello' }),
      ),
    );
    vi.useRealTimers();
  });

  it('renders no search box when no column is searchable', async () => {
    renderTable({ columns: [TextColumn.make('title')] });
    await waitForRows();

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});

describe('column visibility', () => {
  it('offers a toggle only for toggleable columns', async () => {
    renderTable();
    await waitForRows();

    await userEvent.click(screen.getByRole('button', { name: /Columns/ }));

    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Is Featured' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Title' })).not.toBeInTheDocument();
  });

  it('hides a column when its toggle is switched off', async () => {
    renderTable();
    await waitForRows();
    expect(within(table()).getByRole('columnheader', { name: /Is Featured/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Columns/ }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Is Featured' }));

    // The menu stays open (onSelect is prevented) and Radix marks the rest of
    // the page aria-hidden, so the table is out of the a11y tree until it closes.
    await userEvent.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        within(table()).queryByRole('columnheader', { name: /Is Featured/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it('starts with a hiddenByDefault column hidden', async () => {
    renderTable({
      columns: [
        TextColumn.make('title').sortable(),
        TextColumn.make('status').toggleable({ hiddenByDefault: true }),
      ],
    });
    await waitForRows();

    expect(within(table()).queryByRole('columnheader', { name: /Status/ })).not.toBeInTheDocument();
  });
});

describe('column authorization', () => {
  it('drops a column the user may not see', async () => {
    renderTable(
      {
        columns: [TextColumn.make('title'), TextColumn.make('revenue').authorize('finance.view')],
      },
      { permissions: ['post.view'] },
    );
    await waitForRows();

    expect(
      within(table()).queryByRole('columnheader', { name: /Revenue/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the column when the permission is held', async () => {
    renderTable(
      {
        columns: [TextColumn.make('title'), TextColumn.make('revenue').authorize('finance.view')],
      },
      { permissions: ['finance.view'] },
    );
    await waitForRows();

    expect(within(table()).getByRole('columnheader', { name: /Revenue/ })).toBeInTheDocument();
  });
});

describe('filters', () => {
  const filters = [SelectFilter.make('status').options({ draft: 'Draft', published: 'Published' })];

  it('sends an active filter from the URL to the provider', async () => {
    renderTable({ filters }, { route: '/posts?f_status=draft' });

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ filters: { status: 'draft' } }),
      ),
    );
  });

  it('omits an empty filter from the query', async () => {
    renderTable({ filters }, { route: '/posts?f_status=' });

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ filters: {} }),
      ),
    );
  });

  it('shows a removable chip describing the active filter', async () => {
    renderTable({ filters }, { route: '/posts?f_status=draft' });
    await waitForRows();

    const chip = screen.getByRole('button', { name: /Status:\s*Draft/ });
    await userEvent.click(chip);

    await waitFor(() =>
      expect(provider.getList).toHaveBeenLastCalledWith(
        'posts',
        expect.objectContaining({ filters: {} }),
      ),
    );
  });

  it('counts active filters on the Filters button', async () => {
    renderTable({ filters }, { route: '/posts?f_status=draft' });
    await waitForRows();

    expect(
      within(screen.getByRole('button', { name: /Filters/ })).getByText('1'),
    ).toBeInTheDocument();
  });

  it('renders no filter control when the schema declares none', async () => {
    renderTable();
    await waitForRows();

    expect(screen.queryByRole('button', { name: /Filters/ })).not.toBeInTheDocument();
  });
});

describe('row actions', () => {
  it('renders an action per row', async () => {
    renderTable({ actions: [EditAction.make()] });
    await waitForRows();

    expect(within(table()).getAllByRole('link', { name: 'Edit' })).toHaveLength(2);
  });

  it('hides an action the user is not permitted to run', async () => {
    renderTable({ actions: [EditAction.make()] }, { permissions: ['post.view'] });
    await waitForRows();

    expect(within(table()).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('renders no actions column when the schema declares none', async () => {
    renderTable();
    await waitForRows();

    expect(within(table()).queryByText('Actions')).not.toBeInTheDocument();
  });

  it('passes the row record to a custom action', async () => {
    const handler = vi.fn();
    renderTable({ actions: [Action.make('flag').action(handler)] });
    await waitForRows();

    await userEvent.click(within(table()).getAllByRole('button', { name: 'Flag' })[0]);

    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(handler.mock.calls[0][0].record).toMatchObject({ id: 1 });
  });
});

describe('row selection and bulk actions', () => {
  const bulkActions = [BulkAction.make('archive').action(vi.fn())];

  it('renders no selection column without bulk actions', async () => {
    renderTable();
    await waitForRows();

    expect(within(table()).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('renders a checkbox per row plus a select-all', async () => {
    renderTable({ bulkActions });
    await waitForRows();

    expect(
      within(table()).getByRole('checkbox', { name: 'Select all rows on this page' }),
    ).toBeInTheDocument();
    expect(within(table()).getAllByRole('checkbox')).toHaveLength(3);
  });

  it('shows the bulk bar once a row is selected', async () => {
    renderTable({ bulkActions });
    await waitForRows();

    await userEvent.click(within(table()).getByRole('checkbox', { name: 'Select row 1' }));

    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });

  it('select-all picks every row on the page', async () => {
    renderTable({ bulkActions });
    await waitForRows();

    await userEvent.click(
      within(table()).getByRole('checkbox', { name: 'Select all rows on this page' }),
    );

    expect(await screen.findByText('2 selected')).toBeInTheDocument();
  });

  it('clears the selection from the bulk bar', async () => {
    renderTable({ bulkActions });
    await waitForRows();

    await userEvent.click(within(table()).getByRole('checkbox', { name: 'Select row 1' }));
    await screen.findByText('1 selected');

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
  });

  it('hands the selected records to the bulk action', async () => {
    const handler = vi.fn();
    renderTable({ bulkActions: [BulkAction.make('archive').action(handler)] });
    await waitForRows();

    await userEvent.click(within(table()).getByRole('checkbox', { name: 'Select row 1' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(handler.mock.calls[0][0].records).toHaveLength(1);
  });

  it('drops the selection when the page changes', async () => {
    provider.getList.mockResolvedValue(listResult(rows, { total: 60 }));
    renderTable({ bulkActions });
    await waitForRows();

    await userEvent.click(within(table()).getByRole('checkbox', { name: 'Select row 1' }));
    await screen.findByText('1 selected');

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
  });
});

describe('pagination', () => {
  it('renders pagination when there are rows', async () => {
    provider.getList.mockResolvedValue(listResult(rows, { total: 60 }));

    renderTable();
    await waitForRows();

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('requests the next page', async () => {
    provider.getList.mockResolvedValue(listResult(rows, { total: 60 }));

    renderTable();
    await waitForRows();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() =>
      expect(provider.getList).toHaveBeenLastCalledWith(
        'posts',
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it('hides pagination when there are no rows', async () => {
    provider.getList.mockResolvedValue(listResult([]));

    renderTable();
    await screen.findByText('Nothing here yet');

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('uses the schema per-page options', async () => {
    provider.getList.mockResolvedValue(listResult(rows, { total: 60 }));

    renderTable({ perPageOptions: [5, 15] });
    await waitForRows();

    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toBeInTheDocument();
  });
});

describe('mobile card list', () => {
  it('renders a card per record alongside the table', async () => {
    renderTable();
    await waitForRows();

    const cards = screen.getByRole('list', { name: '' });
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders row actions on each card', async () => {
    renderTable({ actions: [DeleteAction.make()] });
    await waitForRows();

    // One per row in the table plus one per card.
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(4);
  });
});

describe('striped rows', () => {
  const dataRows = async () => {
    const table = await screen.findByRole('table');
    await within(table).findByText('First post');
    return within(table)
      .getAllByRole('row')
      .filter((row) => row.className.includes('group/row'));
  };

  it('tints every other row', async () => {
    renderTable({ striped: true });

    const bodyRows = await dataRows();

    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0]).not.toHaveClass('bg-muted/30');
    expect(bodyRows[1]).toHaveClass('bg-muted/30');
  });

  it('leaves every row plain when striping is off', async () => {
    renderTable();

    const bodyRows = await dataRows();

    expect(bodyRows[1]).not.toHaveClass('bg-muted/30');
  });
});
