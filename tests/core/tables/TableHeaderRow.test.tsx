import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { TableHeaderRow } from '@/core/tables/TableHeaderRow';
import { Table } from '@/core/ui/table';
import { renderWithProviders } from '../../helpers/render';

type HeaderProps = React.ComponentProps<typeof TableHeaderRow>;

const columns = [
  TextColumn.make('title').sortable(),
  TextColumn.make('status'),
  TextColumn.make('role.name').sortable({ column: 'role_id' }),
];

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  const props: HeaderProps = {
    columns,
    sort: null,
    onToggleSort: vi.fn(),
    showSelection: false,
    allSelected: false,
    someSelected: false,
    onToggleAll: vi.fn(),
    hasRowActions: false,
    ...overrides,
  };

  return {
    props,
    ...renderWithProviders(
      <Table>
        <TableHeaderRow {...props} />
      </Table>,
    ),
  };
}

describe('column headers', () => {
  it('renders a header per column with its resolved label', () => {
    renderHeader();

    expect(screen.getByRole('columnheader', { name: /Title/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument();
  });

  it('renders a sort button only for sortable columns', () => {
    renderHeader();

    expect(
      within(screen.getByRole('columnheader', { name: /Title/ })).getByRole('button'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('columnheader', { name: /Status/ })).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('applies a configured width', () => {
    renderHeader({ columns: [TextColumn.make('title').width('12rem')] });

    expect(screen.getByRole('columnheader')).toHaveStyle({ width: '12rem' });
  });

  it('applies the column alignment', () => {
    renderHeader({ columns: [BooleanColumn.make('active')] });

    expect(screen.getByRole('columnheader').querySelector('.justify-center')).toBeInTheDocument();
  });
});

describe('sort state', () => {
  it('marks no column sorted by default', () => {
    renderHeader();

    expect(screen.getByRole('columnheader', { name: /Title/ })).not.toHaveAttribute('aria-sort');
  });

  it('announces an ascending sort', () => {
    renderHeader({ sort: { column: 'title', direction: 'asc' } });

    expect(screen.getByRole('columnheader', { name: /Title/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('announces a descending sort', () => {
    renderHeader({ sort: { column: 'title', direction: 'desc' } });

    expect(screen.getByRole('columnheader', { name: /Title/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('matches the sort against the overriding sort column', () => {
    renderHeader({ sort: { column: 'role_id', direction: 'asc' } });

    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('does not mark a different column as sorted', () => {
    renderHeader({ sort: { column: 'title', direction: 'asc' } });

    expect(screen.getByRole('columnheader', { name: /Name/ })).not.toHaveAttribute('aria-sort');
  });

  it('passes the column itself to onToggleSort', async () => {
    const onToggleSort = vi.fn();
    renderHeader({ onToggleSort });

    await userEvent.click(
      within(screen.getByRole('columnheader', { name: /Title/ })).getByRole('button'),
    );

    expect(onToggleSort).toHaveBeenCalledWith(columns[0]);
  });
});

describe('selection header', () => {
  it('renders no checkbox when selection is off', () => {
    renderHeader();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('renders a labelled select-all checkbox', () => {
    renderHeader({ showSelection: true });

    expect(
      screen.getByRole('checkbox', { name: 'Select all rows on this page' }),
    ).toBeInTheDocument();
  });

  it('is checked when every row is selected', () => {
    renderHeader({ showSelection: true, allSelected: true });

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('is indeterminate when only some rows are selected', () => {
    renderHeader({ showSelection: true, someSelected: true });

    expect(screen.getByRole('checkbox')).toHaveAttribute('data-state', 'indeterminate');
  });

  it('reports a check as true', async () => {
    const onToggleAll = vi.fn();
    renderHeader({ showSelection: true, onToggleAll });

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it('reports an uncheck as false', async () => {
    const onToggleAll = vi.fn();
    renderHeader({ showSelection: true, allSelected: true, onToggleAll });

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onToggleAll).toHaveBeenCalledWith(false);
  });
});

describe('actions header', () => {
  it('adds a screen-reader-only actions header when there are row actions', () => {
    renderHeader({ hasRowActions: true });

    expect(screen.getByText('Actions')).toHaveClass('sr-only');
  });

  it('omits it otherwise', () => {
    renderHeader();

    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  it('renders one header per column plus the extras', () => {
    renderHeader({ showSelection: true, hasRowActions: true });

    expect(screen.getAllByRole('columnheader')).toHaveLength(columns.length + 2);
  });
});
