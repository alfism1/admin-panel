import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateAction } from '@/core/actions/CreateAction';
import { defineResource } from '@/core/resources/Resource';
import { ResourceProvider } from '@/core/resources/ResourceContext';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { TableEmptyState, TableErrorState, TableLoadingRows } from '@/core/tables/TableStates';
import { Table, TableBody } from '@/core/ui/table';
import { TooltipProvider } from '@/core/ui/tooltip';
import { renderWithProviders } from '../../helpers/render';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  permissions: { create: 'post.create' },
  table: { columns: [TextColumn.make('title')] },
});

describe('<TableLoadingRows>', () => {
  const renderRows = (columns: number, rows?: number) =>
    renderWithProviders(
      <Table>
        <TableBody>
          <TableLoadingRows columns={columns} rows={rows} />
        </TableBody>
      </Table>,
    );

  it('renders six placeholder rows by default', () => {
    renderRows(3);

    expect(screen.getAllByRole('row')).toHaveLength(6);
  });

  it('honours an explicit row count', () => {
    renderRows(3, 2);

    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('renders one cell per column', () => {
    renderRows(4, 1);

    expect(within(screen.getByRole('row')).getAllByRole('cell')).toHaveLength(4);
  });

  it('renders animated skeletons of varying width', () => {
    const { container } = renderRows(3, 2);
    const skeletons = container.querySelectorAll('.animate-pulse');

    expect(skeletons).toHaveLength(6);
    const widths = new Set([...skeletons].map((node) => node.getAttribute('style')));
    expect(widths.size).toBeGreaterThan(1);
  });

  it('renders nothing for zero rows', () => {
    renderRows(3, 0);

    expect(screen.queryByRole('row')).not.toBeInTheDocument();
  });
});

describe('<TableEmptyState>', () => {
  const renderEmpty = (props: Partial<React.ComponentProps<typeof TableEmptyState>> = {}) =>
    renderWithProviders(
      <TooltipProvider>
        <ResourceProvider resource={resource} refresh={() => undefined}>
          <TableEmptyState {...props} />
        </ResourceProvider>
      </TooltipProvider>,
    );

  it('shows a default heading and description', () => {
    renderEmpty();

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('Records you create will show up in this table.')).toBeInTheDocument();
  });

  it('uses configured copy', () => {
    renderEmpty({ options: { heading: 'No posts', description: 'Write one.' } });

    expect(screen.getByText('No posts')).toBeInTheDocument();
    expect(screen.getByText('Write one.')).toBeInTheDocument();
  });

  it('renders a create action when one is supplied', () => {
    renderEmpty({ createAction: CreateAction.make() });

    expect(screen.getByRole('link', { name: 'New post' })).toBeInTheDocument();
  });

  it('renders no create action when none is supplied', () => {
    renderEmpty();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('switches to filtered copy when a filter is narrowing the results', () => {
    renderEmpty({ filtered: true });

    expect(screen.getByText('No matching records')).toBeInTheDocument();
    expect(screen.getByText(/clear the active filters/)).toBeInTheDocument();
  });

  it('offers a clear-filters button instead of create when filtered', () => {
    const onClearFilters = vi.fn();
    renderEmpty({ filtered: true, createAction: CreateAction.make(), onClearFilters });

    expect(screen.queryByRole('link', { name: 'New post' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('invokes onClearFilters', async () => {
    const onClearFilters = vi.fn();
    renderEmpty({ filtered: true, onClearFilters });

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('renders the configured icon', () => {
    const { container } = renderEmpty({ options: { icon: 'file-text' } });

    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('<TableErrorState>', () => {
  it('shows the failure message', () => {
    renderWithProviders(<TableErrorState message="Database unreachable" onRetry={vi.fn()} />);

    expect(screen.getByText('Could not load this table')).toBeInTheDocument();
    expect(screen.getByText('Database unreachable')).toBeInTheDocument();
  });

  it('invokes onRetry', async () => {
    const onRetry = vi.fn();
    renderWithProviders(<TableErrorState message="Boom" onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
