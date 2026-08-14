import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import { Select } from '@/core/forms/fields/Select';
import { TextInput } from '@/core/forms/fields/TextInput';
import { SchemaForm } from '@/core/forms/SchemaForm';
import type { FormComponent, FormValues } from '@/core/forms/types';
import {
  listResult,
  makeDataProvider,
  pending,
  type MockDataProvider,
} from '../../helpers/dataProvider';
import { renderWithProviders } from '../../helpers/render';

let provider: MockDataProvider;

beforeEach(() => {
  provider = makeDataProvider();
  setDataProvider(provider);
});

afterEach(() => {
  setDataProvider(restDataProvider);
});

function renderField(schema: FormComponent[], record: FormValues | null = null) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  renderWithProviders(
    <SchemaForm
      schema={schema}
      operation={record ? 'edit' : 'create'}
      record={record}
      onSubmit={onSubmit}
    />,
  );

  return { onSubmit };
}

const submit = () => userEvent.click(screen.getByRole('button', { name: /Create|Save/ }));

describe('native select', () => {
  const field = Select.make('status').native().options({ draft: 'Draft', published: 'Published' });

  it('renders a plain select with a placeholder option', () => {
    renderField([field]);

    const select = screen.getByLabelText('Status');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Select…' })).toBeInTheDocument();
  });

  it('uses a configured placeholder', () => {
    renderField([field.placeholder('Pick one')]);

    expect(screen.getByRole('option', { name: 'Pick one' })).toBeInTheDocument();
  });

  it('lists every option', () => {
    renderField([field]);

    expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Published' })).toBeInTheDocument();
  });

  it('submits the picked value', async () => {
    const { onSubmit } = renderField([field]);

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'published');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: 'published' }));
  });

  it('submits null when the placeholder is chosen', async () => {
    const { onSubmit } = renderField([field], { status: 'draft' });

    await userEvent.selectOptions(screen.getByLabelText('Status'), '');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: null }));
  });

  it('reflects the record value', () => {
    renderField([field], { status: 'published' });

    expect(screen.getByLabelText('Status')).toHaveValue('published');
  });

  it('is disabled when the field is', () => {
    renderField([field.disabled()]);

    expect(screen.getByLabelText('Status')).toBeDisabled();
  });

  it('marks an option disabled', () => {
    renderField([
      Select.make('status')
        .native()
        .options([{ value: 'draft', label: 'Draft', disabled: true }]),
    ]);

    expect(screen.getByRole('option', { name: 'Draft' })).toBeDisabled();
  });
});

describe('combobox select', () => {
  const field = Select.make('status').options({ draft: 'Draft', published: 'Published' });

  it('renders a combobox showing the placeholder', () => {
    renderField([field]);

    expect(screen.getByRole('combobox')).toHaveTextContent('Select…');
  });

  it('opens a listbox of options', async () => {
    renderField([field]);

    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Draft' })).toBeInTheDocument();
  });

  it('submits the picked value as a scalar', async () => {
    const { onSubmit } = renderField([field]);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Published' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: 'published' }));
  });

  it('shows the selected label on the trigger', async () => {
    renderField([field], { status: 'draft' });

    expect(screen.getByRole('combobox')).toHaveTextContent('Draft');
  });

  it('deselects when the selected option is picked again', async () => {
    const { onSubmit } = renderField([field], { status: 'draft' });

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Draft' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: null }));
  });

  it('submits an array when multiple', async () => {
    const { onSubmit } = renderField([field.multiple()]);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Draft' }));
    await userEvent.click(screen.getByRole('option', { name: 'Published' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: ['draft', 'published'] }));
  });

  it('counts the selection when multiple', () => {
    renderField([field.multiple()], { status: ['draft', 'published'] });

    expect(screen.getByRole('combobox')).toHaveTextContent('2 selected');
  });

  it('renders a search box when searchable', async () => {
    renderField([field.searchable()]);

    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByPlaceholderText('Search…')).toBeInTheDocument();
  });

  /**
   * `Combobox` only filters client-side when no `onSearch` is supplied, and
   * only a relationship can be searched server-side — so a static searchable
   * Select must not forward one.
   */
  it('filters static options client-side as the user types', async () => {
    renderField([field.searchable()]);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(await screen.findByPlaceholderText('Search…'), 'draf');

    expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Published' })).not.toBeInTheDocument();
  });

  it('reports when a search matches no static option', async () => {
    renderField([field.searchable()]);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(await screen.findByPlaceholderText('Search…'), 'zzz');

    expect(await screen.findByText('No results found.')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('does not fire a query for a static searchable select', async () => {
    renderField([field.searchable()]);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(await screen.findByPlaceholderText('Search…'), 'draf');

    expect(provider.getList).not.toHaveBeenCalled();
  });

  it('does filter client-side where no onSearch is wired — the filter control path', async () => {
    // `SelectFilterControl` passes `onSearch` only for relationship filters, so
    // a static searchable filter gets Combobox's own client-side filtering.
    const { SelectFilter } = await import('@/core/tables/filters/SelectFilter');
    const filter = SelectFilter.make('status').options({ draft: 'Draft', published: 'Published' });
    const Control = filter.control;

    renderWithProviders(<Control filter={filter} value="" onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'Draft' })).toBeInTheDocument();
  });

  it('removes a value when its option is picked again while multiple', async () => {
    const { onSubmit } = renderField([field.multiple()], { status: ['draft', 'published'] });

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Draft' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: ['published'] }));
  });

  it('removes a value from its chip while multiple', async () => {
    const { onSubmit } = renderField([field.multiple()], { status: ['draft', 'published'] });

    await userEvent.click(screen.getByRole('combobox'));
    const chips = await screen.findAllByRole('button', { name: /^Draft$/ });
    await userEvent.click(chips[0]);
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: ['published'] }));
  });

  it('shows no chip row when nothing is selected', async () => {
    renderField([field.multiple()]);

    await userEvent.click(screen.getByRole('combobox'));
    await screen.findByRole('listbox');

    expect(screen.queryByRole('button', { name: /^Draft$/ })).not.toBeInTheDocument();
  });

  it('renders an option description', async () => {
    renderField([
      Select.make('status').options([
        { value: 'draft', label: 'Draft', description: 'Not visible yet' },
        { value: 'published', label: 'Published' },
      ]),
    ]);

    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByText('Not visible yet')).toBeInTheDocument();
  });

  it('marks a disabled option as disabled', async () => {
    renderField([
      Select.make('status').options([{ value: 'draft', label: 'Draft', disabled: true }]),
    ]);

    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Draft' })).toBeDisabled();
  });

  it('is disabled when the field is read-only', () => {
    renderField([field.readOnly()]);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('resolves options from other form values', async () => {
    const schema = [
      TextInput.make('country'),
      Select.make('city').options((ctx): Record<string, string> =>
        ctx.get('country') === 'id' ? { jkt: 'Jakarta' } : { nyc: 'New York' },
      ),
    ];

    renderField(schema);
    await userEvent.type(screen.getByLabelText('Country'), 'id');
    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Jakarta' })).toBeInTheDocument();
  });
});

describe('relationship select', () => {
  const field = Select.make('author_id').relationship({ resource: 'users', titleKey: 'name' });

  it('fetches options from the related resource', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 1, name: 'Ada' }]));

    renderField([field]);

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'users',
        expect.objectContaining({ page: 1, perPage: 25 }),
      ),
    );
  });

  it('renders the fetched rows as options', async () => {
    provider.getList.mockResolvedValue(
      listResult([
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Grace' },
      ]),
    );

    renderField([field]);
    await waitFor(() => expect(provider.getList).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Ada' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Grace' })).toBeInTheDocument();
  });

  it('shows a loading state while fetching', async () => {
    provider.getList.mockReturnValue(pending());

    renderField([field]);
    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
  });

  it('fetches a bigger page when preloading', async () => {
    provider.getList.mockResolvedValue(listResult([]));

    renderField([field.preload()]);

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'users',
        expect.objectContaining({ perPage: 200 }),
      ),
    );
  });

  it('merges extra query params into the lookup', async () => {
    provider.getList.mockResolvedValue(listResult([]));

    renderField([
      Select.make('author_id').relationship({
        resource: 'users',
        titleKey: 'name',
        query: { filters: { is_active: true } },
      }),
    ]);

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'users',
        expect.objectContaining({ filters: { is_active: true } }),
      ),
    );
  });

  it('uses a custom value key', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 1, uuid: 'abc', name: 'Ada' }]));

    const { onSubmit } = renderField([
      Select.make('author_id').relationship({
        resource: 'users',
        titleKey: 'name',
        valueKey: 'uuid',
      }),
    ]);

    await waitFor(() => expect(provider.getList).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Ada' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ author_id: 'abc' }));
  });

  it('fetches a selected value missing from the first page', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 1, name: 'Ada' }]));
    provider.getMany.mockResolvedValue([{ id: 99, name: 'Grace' }]);

    renderField([field], { author_id: 99 });

    await waitFor(() => expect(provider.getMany).toHaveBeenCalledWith('users', [99]));
    expect(screen.getByRole('combobox')).toHaveTextContent('Grace');
  });

  it('does not re-fetch a selected value already in the page', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 1, name: 'Ada' }]));

    renderField([field], { author_id: 1 });

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Ada'));
    expect(provider.getMany).not.toHaveBeenCalled();
  });

  it('de-duplicates an option present in both result sets', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 1, name: 'Ada' }]));
    // A `getMany` that returns more than it was asked for still must not
    // produce the same option twice.
    provider.getMany.mockResolvedValue([
      { id: 99, name: 'Grace' },
      { id: 1, name: 'Ada' },
    ]);

    renderField([field], { author_id: 99 });

    await waitFor(() => expect(provider.getMany).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findAllByRole('option', { name: 'Ada' })).toHaveLength(1);
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('tolerates a row missing the value or title key', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 1, name: 'Ada' }, {}]));

    renderField([field]);

    await waitFor(() => expect(provider.getList).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('combobox'));

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[1]).toHaveTextContent('');
  });

  it('ignores an empty selected value when deciding what is missing', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 1, name: 'Ada' }]));

    renderField([field], { author_id: '' });

    await waitFor(() => expect(provider.getList).toHaveBeenCalled());
    expect(provider.getMany).not.toHaveBeenCalled();
  });

  it('offers no search box when preloading', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 1, name: 'Ada' }]));

    renderField([field.searchable().preload()]);

    await waitFor(() => expect(provider.getList).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('combobox'));

    // `preload` fetches everything up front, so Combobox filters client-side.
    await userEvent.type(await screen.findByPlaceholderText('Search…'), 'zzz');
    expect(await screen.findByText('No results found.')).toBeInTheDocument();
  });

  it('searches server-side, debounced, when searchable', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    provider.getList.mockResolvedValue(listResult([]));

    renderField([field.searchable()]);
    await user.click(screen.getByRole('combobox'));
    await user.type(await screen.findByPlaceholderText('Search…'), 'ada');
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() =>
      expect(provider.getList).toHaveBeenCalledWith(
        'users',
        expect.objectContaining({ search: 'ada' }),
      ),
    );
    vi.useRealTimers();
  });
});
