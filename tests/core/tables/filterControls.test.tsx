import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import { DateRangeFilter } from '@/core/tables/filters/DateRangeFilter';
import { SelectFilter } from '@/core/tables/filters/SelectFilter';
import { TernaryFilter } from '@/core/tables/filters/TernaryFilter';
import type { Filter } from '@/core/tables/filters/Filter';
import { listResult, makeDataProvider, type MockDataProvider } from '../../helpers/dataProvider';
import { renderWithProviders } from '../../helpers/render';

let provider: MockDataProvider;

beforeEach(() => {
  provider = makeDataProvider();
  setDataProvider(provider);
});

afterEach(() => {
  setDataProvider(restDataProvider);
});

function renderFilter(filter: Filter, value = '') {
  const onChange = vi.fn();
  const Control = filter.control;

  const utils = renderWithProviders(<Control filter={filter} value={value} onChange={onChange} />);
  return { ...utils, onChange };
}

describe('<TernaryFilterControl>', () => {
  const filter = TernaryFilter.make('is_active');

  it('renders a labelled radio group of three choices', () => {
    renderFilter(filter);

    const group = screen.getByRole('radiogroup', { name: 'Is Active' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('uses the configured labels', () => {
    renderFilter(
      TernaryFilter.make('is_active').trueLabel('Active').falseLabel('Suspended').blankLabel('Any'),
    );

    expect(screen.getByRole('radio', { name: 'Any' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Suspended' })).toBeInTheDocument();
  });

  it('checks the blank choice when the value is empty', () => {
    renderFilter(filter);

    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toBeChecked();
  });

  it('checks the matching choice', () => {
    renderFilter(filter, 'false');

    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked();
  });

  it('emits "true" when the yes choice is picked', async () => {
    const { onChange } = renderFilter(filter);

    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));

    expect(onChange).toHaveBeenCalledWith('true');
  });

  it('emits an empty string when the blank choice is picked', async () => {
    const { onChange } = renderFilter(filter, 'true');

    await userEvent.click(screen.getByRole('radio', { name: 'All' }));

    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('<DateRangeFilterControl>', () => {
  const filter = DateRangeFilter.make('created_at');

  it('renders two labelled date inputs', () => {
    renderFilter(filter);

    expect(screen.getByLabelText('Created At from')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Created At to')).toHaveAttribute('type', 'date');
  });

  it('splits an existing range across the two inputs', () => {
    renderFilter(filter, '2024-01-01..2024-01-31');

    expect(screen.getByLabelText('Created At from')).toHaveValue('2024-01-01');
    expect(screen.getByLabelText('Created At to')).toHaveValue('2024-01-31');
  });

  it('handles an open-ended range', () => {
    renderFilter(filter, '2024-01-01..');

    expect(screen.getByLabelText('Created At from')).toHaveValue('2024-01-01');
    expect(screen.getByLabelText('Created At to')).toHaveValue('');
  });

  it('emits a joined range when the start is set', async () => {
    const { onChange } = renderFilter(filter);

    await userEvent.type(screen.getByLabelText('Created At from'), '2024-01-01');

    expect(onChange).toHaveBeenLastCalledWith('2024-01-01..');
  });

  it('keeps the other side when one changes', async () => {
    const { onChange } = renderFilter(filter, '2024-01-01..');

    await userEvent.type(screen.getByLabelText('Created At to'), '2024-01-31');

    expect(onChange).toHaveBeenLastCalledWith('2024-01-01..2024-01-31');
  });

  it('emits an empty string when both sides are cleared', async () => {
    const { onChange } = renderFilter(filter, '2024-01-01..');

    await userEvent.clear(screen.getByLabelText('Created At from'));

    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('constrains each input by the other, so the range cannot invert', () => {
    renderFilter(filter, '2024-01-01..2024-01-31');

    expect(screen.getByLabelText('Created At from')).toHaveAttribute('max', '2024-01-31');
    expect(screen.getByLabelText('Created At to')).toHaveAttribute('min', '2024-01-01');
  });
});

describe('<SelectFilterControl>', () => {
  const filter = SelectFilter.make('status').options({
    draft: 'Draft',
    published: 'Published',
  });

  it('renders a combobox placeholder naming the filter', () => {
    renderFilter(filter);

    expect(screen.getByText('All status')).toBeInTheDocument();
  });

  it('uses a configured placeholder', () => {
    renderFilter(SelectFilter.make('status').options({ a: 'A' }).placeholder('Any status'));

    expect(screen.getByText('Any status')).toBeInTheDocument();
  });

  it('shows the selected option label', () => {
    renderFilter(filter, 'draft');

    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('lists the static options when opened', async () => {
    renderFilter(filter);

    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Published' })).toBeInTheDocument();
  });

  it('emits the picked value', async () => {
    const { onChange } = renderFilter(filter);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Published' }));

    expect(onChange).toHaveBeenCalledWith('published');
  });

  it('joins several values with commas when multiple', async () => {
    const multi = SelectFilter.make('status')
      .options({ draft: 'Draft', published: 'Published' })
      .multiple();
    const { onChange } = renderFilter(multi, 'draft');

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Published' }));

    expect(onChange).toHaveBeenCalledWith('draft,published');
  });

  it('loads options from a relationship', async () => {
    provider.getList.mockResolvedValue(
      listResult([
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Grace' },
      ]),
    );

    const relational = SelectFilter.make('author_id').relationship({
      resource: 'users',
      titleKey: 'name',
    });

    renderFilter(relational);

    await waitFor(() => expect(provider.getList).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Ada' })).toBeInTheDocument();
  });
});
