import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { DateRangeFilter } from '@/core/tables/filters/DateRangeFilter';
import { Filter } from '@/core/tables/filters/Filter';
import { SelectFilter } from '@/core/tables/filters/SelectFilter';
import { TernaryFilter } from '@/core/tables/filters/TernaryFilter';
import { TableToolbar } from '@/core/tables/TableToolbar';
import type { FilterControl } from '@/core/tables/types';
import { renderWithProviders } from '../../helpers/render';

const statusFilter = SelectFilter.make('status').options({
  draft: 'Draft',
  published: 'Published',
});

type ToolbarProps = React.ComponentProps<typeof TableToolbar>;

function renderToolbar(overrides: Partial<ToolbarProps> = {}) {
  const props: ToolbarProps = {
    searchable: true,
    search: '',
    onSearch: vi.fn(),
    filters: [],
    filterValues: {},
    onFilterChange: vi.fn(),
    onResetFilters: vi.fn(),
    toggleableColumns: [],
    hiddenColumns: [],
    onToggleColumn: vi.fn(),
    ...overrides,
  };

  return { props, ...renderWithProviders(<TableToolbar {...props} />) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('visibility', () => {
  it('renders nothing when there is no search, filter or column control', () => {
    const { container } = renderToolbar({ searchable: false });

    expect(container).toBeEmptyDOMElement();
  });

  it('renders when only filters exist', () => {
    renderToolbar({ searchable: false, filters: [statusFilter] });

    expect(screen.getByRole('button', { name: /Filters/ })).toBeInTheDocument();
  });

  it('renders when only toggleable columns exist', () => {
    renderToolbar({ searchable: false, toggleableColumns: [TextColumn.make('title')] });

    expect(screen.getByRole('button', { name: /Columns/ })).toBeInTheDocument();
  });
});

describe('search', () => {
  it('renders a labelled search box', () => {
    renderToolbar();

    expect(screen.getByRole('searchbox', { name: 'Search records' })).toBeInTheDocument();
  });

  it('shows the current term', () => {
    renderToolbar({ search: 'hello' });

    expect(screen.getByRole('searchbox')).toHaveValue('hello');
  });

  it('updates the input immediately but debounces the callback', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSearch = vi.fn();

    renderToolbar({ onSearch });
    await user.type(screen.getByRole('searchbox'), 'abc');

    expect(screen.getByRole('searchbox')).toHaveValue('abc');
    expect(onSearch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('abc');
  });

  it('syncs the input when the search prop changes externally', () => {
    const { rerender, props } = renderToolbar({ search: 'first' });

    rerender(<TableToolbar {...props} search="second" />);

    expect(screen.getByRole('searchbox')).toHaveValue('second');
  });

  it('renders no search box when nothing is searchable', () => {
    renderToolbar({ searchable: false, toggleableColumns: [TextColumn.make('title')] });

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});

describe('filters', () => {
  it('opens a popover listing every filter', async () => {
    renderToolbar({ filters: [statusFilter, TernaryFilter.make('is_featured')] });

    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));

    expect(await screen.findByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Is Featured')).toBeInTheDocument();
  });

  it('shows no active count when nothing is filtered', () => {
    renderToolbar({ filters: [statusFilter] });

    const button = screen.getByRole('button', { name: /Filters/ });
    expect(within(button).queryByText('1')).not.toBeInTheDocument();
  });

  it('counts active filters', () => {
    renderToolbar({
      filters: [statusFilter, TernaryFilter.make('is_featured')],
      filterValues: { status: 'draft', is_featured: 'true' },
    });

    const button = screen.getByRole('button', { name: /Filters/ });
    expect(within(button).getByText('2')).toBeInTheDocument();
  });

  it('does not count a filter its own isEmpty rejects', () => {
    renderToolbar({
      filters: [DateRangeFilter.make('created_at')],
      filterValues: { created_at: '..' },
    });

    const button = screen.getByRole('button', { name: /Filters/ });
    expect(within(button).queryByText('1')).not.toBeInTheDocument();
  });

  it('renders a chip per active filter using its own description', () => {
    renderToolbar({ filters: [statusFilter], filterValues: { status: 'draft' } });

    expect(screen.getByRole('button', { name: /Status:\s*Draft/ })).toBeInTheDocument();
  });

  it('clears a single filter from its chip', async () => {
    const onFilterChange = vi.fn();
    renderToolbar({ filters: [statusFilter], filterValues: { status: 'draft' }, onFilterChange });

    await userEvent.click(screen.getByRole('button', { name: /Status:/ }));

    expect(onFilterChange).toHaveBeenCalledWith(statusFilter, '');
  });

  it('renders no chips when nothing is active', () => {
    renderToolbar({ filters: [statusFilter] });

    expect(screen.queryByRole('button', { name: /Status:/ })).not.toBeInTheDocument();
  });

  it('offers a clear-all inside the popover only when something is active', async () => {
    renderToolbar({ filters: [statusFilter], filterValues: { status: 'draft' } });

    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));

    expect(await screen.findByRole('button', { name: /Clear all filters/ })).toBeInTheDocument();
  });

  it('invokes onResetFilters from clear-all', async () => {
    const onResetFilters = vi.fn();
    renderToolbar({
      filters: [statusFilter],
      filterValues: { status: 'draft' },
      onResetFilters,
    });

    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Clear all filters/ }));

    expect(onResetFilters).toHaveBeenCalledOnce();
  });
});

describe('column toggles', () => {
  const columns = [TextColumn.make('title'), TextColumn.make('status')];

  it('lists every toggleable column with its checked state', async () => {
    renderToolbar({ toggleableColumns: columns, hiddenColumns: ['status'] });

    await userEvent.click(screen.getByRole('button', { name: /Columns/ }));

    expect(await screen.findByRole('menuitemcheckbox', { name: 'Title' })).toBeChecked();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Status' })).not.toBeChecked();
  });

  it('invokes onToggleColumn with the column name', async () => {
    const onToggleColumn = vi.fn();
    renderToolbar({ toggleableColumns: columns, onToggleColumn });

    await userEvent.click(screen.getByRole('button', { name: /Columns/ }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Status' }));

    expect(onToggleColumn).toHaveBeenCalledWith('status');
  });

  it('keeps the menu open after a toggle, so several can be changed at once', async () => {
    renderToolbar({ toggleableColumns: columns, onToggleColumn: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: /Columns/ }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Status' }));

    expect(screen.getByRole('menuitemcheckbox', { name: 'Title' })).toBeInTheDocument();
  });
});

describe('editing a filter in the popover', () => {
  it('reports the picked value for the filter it belongs to', async () => {
    const onFilterChange = vi.fn();
    renderToolbar({ searchable: false, filters: [statusFilter], onFilterChange });

    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const popover = await screen.findByRole('dialog');
    await userEvent.click(within(popover).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Published' }));

    expect(onFilterChange).toHaveBeenCalledWith(statusFilter, 'published');
  });

  it('starts every control from an empty value when nothing is set', async () => {
    renderToolbar({ searchable: false, filters: [statusFilter] });

    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const popover = await screen.findByRole('dialog');

    expect(within(popover).getByRole('combobox')).toHaveTextContent('All');
  });

  it('describes a chip from an empty value without crashing', () => {
    // `describe('')` is reachable while a filter is active on one key and the
    // chip list re-renders for another.
    const other = SelectFilter.make('author').options({ '1': 'Ada' });
    renderToolbar({
      filters: [statusFilter, other],
      filterValues: { status: 'draft' },
    });

    expect(screen.getByRole('button', { name: /Status:\s*Draft/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Author:/ })).not.toBeInTheDocument();
  });
});

describe('a filter whose empty value still means something', () => {
  class PresenceFilter extends Filter {
    static make(name: string): PresenceFilter {
      return new PresenceFilter({ name });
    }

    get control(): FilterControl {
      return (() => null) as unknown as FilterControl;
    }

    /** Never empty: "no value" is itself a meaningful selection. */
    isEmpty(): boolean {
      return false;
    }

    describe(value: string): string {
      return value === '' ? 'any' : value;
    }
  }

  it('renders a chip even when the value was never set', () => {
    const filter = PresenceFilter.make('author');
    renderToolbar({ searchable: false, filters: [filter], filterValues: {} });

    expect(screen.getByRole('button', { name: /Author:\s*any/ })).toBeInTheDocument();
  });

  it('clears back to the empty value from the chip', async () => {
    const filter = PresenceFilter.make('author');
    const onFilterChange = vi.fn();
    renderToolbar({ searchable: false, filters: [filter], filterValues: {}, onFilterChange });

    await userEvent.click(screen.getByRole('button', { name: /Author:/ }));

    expect(onFilterChange).toHaveBeenCalledWith(filter, '');
  });
});
