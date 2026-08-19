import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from '@/core/forms/fields/Select';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Section } from '@/core/forms/layouts/Section';
import { SchemaForm } from '@/core/forms/SchemaForm';
import type { FormComponent, FormValues } from '@/core/forms/types';
import { Repeater } from '@/core/forms/fields/Repeater';
import { renderWithProviders } from '../../helpers/render';

function renderForm(schema: FormComponent[], record: FormValues | null = null) {
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

/** The default `Repeater.make(...)` shape used by most cases below. */
const contacts = () =>
  Repeater.make('contacts').schema([TextInput.make('name'), TextInput.make('email')]);

const boxes = () => screen.getAllByLabelText(/^Item \d$/);
const inputsNamed = (label: string) => screen.getAllByRole('textbox', { name: label });

describe('rendering', () => {
  it('starts with one empty item and binds children to indexed paths', async () => {
    const { onSubmit } = renderForm([contacts()]);

    expect(boxes()).toHaveLength(1);

    await userEvent.type(inputsNamed('Name')[0], 'Ada');
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ contacts: [{ name: 'Ada', email: '' }] }),
    );
  });

  it('fills items from the record on edit', () => {
    renderForm([contacts()], {
      contacts: [
        { name: 'Ada', email: 'ada@example.com' },
        { name: 'Grace', email: 'grace@example.com' },
      ],
    });

    expect(boxes()).toHaveLength(2);
    expect(inputsNamed('Name')[1]).toHaveValue('Grace');
  });

  it('renders nothing but the add button when defaultItems is zero', () => {
    renderForm([contacts().defaultItems(0)]);

    expect(screen.queryByLabelText('Item 1')).not.toBeInTheDocument();
    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });

  it('honours a child default when seeding blank items', () => {
    renderForm([
      Repeater.make('contacts')
        .defaultItems(2)
        .schema([TextInput.make('name').default('Anonymous')]),
    ]);

    expect(inputsNamed('Name')[0]).toHaveValue('Anonymous');
    expect(inputsNamed('Name')[1]).toHaveValue('Anonymous');
  });

  it('keeps an explicit default() over the seeded blank items', () => {
    renderForm([
      contacts()
        .defaultItems(3)
        .default([{ name: 'Seeded', email: '' }]),
    ]);

    expect(boxes()).toHaveLength(1);
    expect(inputsNamed('Name')[0]).toHaveValue('Seeded');
  });

  it('renders layouts inside an item', () => {
    renderForm([
      Repeater.make('contacts').schema([Section.make('Who').schema([TextInput.make('name')])]),
    ]);

    expect(screen.getByText('Who')).toBeInTheDocument();
    expect(inputsNamed('Name')).toHaveLength(1);
  });

  it('lays items out in a grid when asked', () => {
    renderForm([contacts().grid(2)]);

    const [item] = boxes();
    expect(item.querySelector('.sm\\:grid-cols-2')).not.toBeNull();
  });

  it('tightens the cards in compact mode', () => {
    renderForm([contacts().compact()]);

    expect(boxes()[0].querySelector('.p-2')).not.toBeNull();
  });

  it('treats a stored value that is not an array as empty', () => {
    renderForm([contacts()], { contacts: null });

    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });

  it('tolerates a null item without losing the row', () => {
    renderForm([contacts()], { contacts: [null, { name: 'Grace' }] });

    expect(boxes()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Reorder Item 1' })).toBeInTheDocument();
  });
});

// SQLite and SQL Server hand a JSON column back as text, so the array arrives
// as a string that no other field type has to cope with.
describe('json columns', () => {
  it('parses a stored JSON string', () => {
    renderForm([contacts()], { contacts: '[{"name":"Ada"},{"name":"Grace"}]' });

    expect(boxes()).toHaveLength(2);
    expect(inputsNamed('Name')[1]).toHaveValue('Grace');
  });

  it('falls back to empty for JSON that is not an array', () => {
    renderForm([contacts()], { contacts: '{"name":"Ada"}' });

    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });

  it('falls back to empty for a string that is not JSON at all', () => {
    renderForm([contacts()], { contacts: 'nope' });

    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });

  it('yields to an explicit formatStateUsing', () => {
    renderForm([contacts().formatStateUsing(() => [{ name: 'Overridden' }])], { contacts: 'nope' });

    expect(inputsNamed('Name')[0]).toHaveValue('Overridden');
  });
});

describe('add, delete, clone', () => {
  it('appends a blank item', async () => {
    renderForm([contacts()]);

    await userEvent.click(screen.getByRole('button', { name: 'Add to Contacts' }));

    expect(boxes()).toHaveLength(2);
    expect(inputsNamed('Name')[1]).toHaveValue('');
  });

  it('uses a custom add label and alignment', () => {
    renderForm([contacts().addActionLabel('New contact').addActionAlignment('end')]);

    const button = screen.getByRole('button', { name: 'New contact' });
    expect(button.parentElement).toHaveClass('justify-end');
  });

  it('hides the add button once maxItems is reached', async () => {
    renderForm([contacts().maxItems(2)]);

    await userEvent.click(screen.getByRole('button', { name: 'Add to Contacts' }));

    expect(screen.queryByRole('button', { name: 'Add to Contacts' })).not.toBeInTheDocument();
  });

  it('hides the add button when addable is false', () => {
    renderForm([contacts().addable(false)]);

    expect(screen.queryByRole('button', { name: 'Add to Contacts' })).not.toBeInTheDocument();
  });

  it('removes the item that was deleted, not the last one', async () => {
    const { onSubmit } = renderForm([contacts()], {
      contacts: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Katherine' }],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete Item 2' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        contacts: [{ name: 'Ada' }, { name: 'Katherine' }],
      }),
    );
  });

  it('stops offering delete at minItems', () => {
    renderForm([contacts().minItems(2)], { contacts: [{ name: 'Ada' }, { name: 'Grace' }] });

    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it('hides delete when deletable is false', () => {
    renderForm([contacts().deletable(false)]);

    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it('clones an item directly after the original', async () => {
    const { onSubmit } = renderForm([contacts().cloneable()], {
      contacts: [{ name: 'Ada' }, { name: 'Grace' }],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Clone Item 1' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        contacts: [{ name: 'Ada' }, { name: 'Ada' }, { name: 'Grace' }],
      }),
    );
  });

  it('offers no clone button by default', () => {
    renderForm([contacts()]);

    expect(screen.queryByRole('button', { name: /^Clone/ })).not.toBeInTheDocument();
  });
});

describe('reordering', () => {
  const three = { contacts: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Katherine' }] };

  it('moves an item up with the buttons', async () => {
    const { onSubmit } = renderForm([contacts()], three);

    await userEvent.click(screen.getByRole('button', { name: 'Move Item 2 up' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        contacts: [{ name: 'Grace' }, { name: 'Ada' }, { name: 'Katherine' }],
      }),
    );
  });

  it('moves an item down with the buttons', async () => {
    const { onSubmit } = renderForm([contacts()], three);

    await userEvent.click(screen.getByRole('button', { name: 'Move Item 1 down' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        contacts: [{ name: 'Grace' }, { name: 'Ada' }, { name: 'Katherine' }],
      }),
    );
  });

  it('disables the move buttons at the ends', () => {
    renderForm([contacts()], three);

    expect(screen.getByRole('button', { name: 'Move Item 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Item 3 down' })).toBeDisabled();
  });

  it('reorders by dragging one item onto another', async () => {
    const { onSubmit } = renderForm([contacts()], three);

    fireEvent.dragStart(screen.getByRole('button', { name: 'Reorder Item 3' }));
    fireEvent.dragOver(boxes()[0]);
    fireEvent.drop(boxes()[0]);
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        contacts: [{ name: 'Katherine' }, { name: 'Ada' }, { name: 'Grace' }],
      }),
    );
  });

  it('ignores an item dropped back onto itself', async () => {
    const { onSubmit } = renderForm([contacts()], three);

    fireEvent.dragStart(screen.getByRole('button', { name: 'Reorder Item 2' }));
    fireEvent.drop(boxes()[1]);
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(three));
  });

  it('ignores a drop that did not start on a handle', async () => {
    const { onSubmit } = renderForm([contacts()], three);

    fireEvent.drop(boxes()[0]);
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(three));
  });

  it('forgets the dragged item once the drag ends', async () => {
    const { onSubmit } = renderForm([contacts()], three);

    fireEvent.dragStart(screen.getByRole('button', { name: 'Reorder Item 3' }));
    fireEvent.dragEnd(screen.getByRole('button', { name: 'Reorder Item 3' }));
    fireEvent.dragOver(boxes()[0]);
    fireEvent.drop(boxes()[0]);
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(three));
  });

  it('drops the drag handle when drag and drop is turned off', () => {
    renderForm([contacts().reorderableWithDragAndDrop(false)], three);

    expect(screen.queryByRole('button', { name: /^Reorder/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Item 1 down' })).toBeInTheDocument();
  });

  it('drops the move buttons when button reordering is turned off', () => {
    renderForm([contacts().reorderableWithButtons(false)], three);

    expect(screen.queryByRole('button', { name: /^Move/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Item 1' })).toBeInTheDocument();
  });

  it('offers no reordering for a single item', () => {
    renderForm([contacts()]);

    expect(screen.queryByRole('button', { name: /^Move|^Reorder/ })).not.toBeInTheDocument();
  });

  it('offers no reordering when reorderable is false', () => {
    renderForm([contacts().reorderable(false)], three);

    expect(screen.queryByRole('button', { name: /^Move|^Reorder/ })).not.toBeInTheDocument();
  });
});

describe('item headers', () => {
  it('numbers items by default', () => {
    renderForm([contacts()], { contacts: [{ name: 'Ada' }, { name: 'Grace' }] });

    expect(within(boxes()[1]).getByText('2')).toBeInTheDocument();
  });

  it('drops the number when itemNumbers is false', () => {
    renderForm([contacts().itemNumbers(false)]);

    expect(within(boxes()[0]).queryByText('1')).not.toBeInTheDocument();
  });

  it('labels an item from its own state', () => {
    renderForm([contacts().itemLabel((item) => String(item.name))], {
      contacts: [{ name: 'Ada' }],
    });

    expect(screen.getByLabelText('Ada')).toBeInTheDocument();
  });

  it('falls back to the item number when the label resolves to nothing', () => {
    renderForm([contacts().itemLabel(() => undefined)]);

    expect(screen.getByLabelText('Item 1')).toBeInTheDocument();
  });
});

describe('collapsing', () => {
  it('offers no collapse toggle by default', () => {
    renderForm([contacts()]);

    expect(screen.queryByRole('button', { name: /Collapse|Expand/ })).not.toBeInTheDocument();
  });

  it('hides an item body when collapsed', async () => {
    renderForm([contacts().collapsible()]);

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Item 1' }));

    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
  });

  it('starts folded when collapsed() is set, and reopens on click', async () => {
    renderForm([contacts().collapsed()]);

    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Expand Item 1' }));

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });
});

describe('read-only states', () => {
  it('disables every child and hides the actions', () => {
    renderForm([contacts().disabled()], { contacts: [{ name: 'Ada' }, { name: 'Grace' }] });

    expect(inputsNamed('Name')[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Add to|^Delete|^Move/ })).not.toBeInTheDocument();
  });

  it('disables children on a view page', () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <SchemaForm
        schema={[contacts()]}
        operation="view"
        record={{ contacts: [{ name: 'Ada' }] }}
        onSubmit={onSubmit}
      />,
    );

    expect(inputsNamed('Name')[0]).toBeDisabled();
  });
});

describe('simple repeaters', () => {
  const emails = () =>
    Repeater.make('emails').simple(TextInput.make('email').label('Email').email());

  it('stores a flat array of scalars', async () => {
    const { onSubmit } = renderForm([emails()]);

    await userEvent.type(inputsNamed('Email')[0], 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add to Emails' }));
    await userEvent.type(inputsNamed('Email')[1], 'grace@example.com');
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        emails: ['ada@example.com', 'grace@example.com'],
      }),
    );
  });

  it('clones a scalar item', async () => {
    const { onSubmit } = renderForm([emails().cloneable()], {
      emails: ['ada@example.com', 'grace@example.com'],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Clone Item 1' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        emails: ['ada@example.com', 'ada@example.com', 'grace@example.com'],
      }),
    );
  });

  it('reports the child rules of each item', async () => {
    renderForm([emails()], { emails: ['nope'] });

    await submit();

    expect(await screen.findByText('Email must be a valid email address.')).toBeInTheDocument();
  });
});

describe('table repeaters', () => {
  const rows = () =>
    Repeater.make('lines')
      .schema([TextInput.make('sku'), TextInput.make('qty')])
      .table([{ label: 'Item code' }, { label: 'Amount', width: '6rem', align: 'end' }]);

  it('renders one header per column and keeps the fields nameable', () => {
    renderForm([rows()]);

    expect(screen.getByText('Item code')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'SKU' })).toBeInTheDocument();
  });

  it('adds and deletes rows like a card repeater', async () => {
    const { onSubmit } = renderForm([rows()]);

    await userEvent.click(screen.getByRole('button', { name: 'Add to Lines' }));
    await userEvent.type(inputsNamed('SKU')[1], 'B-2');
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        lines: [
          { sku: '', qty: '' },
          { sku: 'B-2', qty: '' },
        ],
      }),
    );
  });

  it('shows an empty note with no rows', () => {
    renderForm([rows().defaultItems(0)]);

    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });

  it('tightens the rows in compact mode', () => {
    renderForm([rows().compact()]);

    expect(boxes()[0]).toHaveClass('px-2');
  });

  it('shows per-row issues after a failed submit', async () => {
    renderForm([
      Repeater.make('lines')
        .schema([TextInput.make('sku').required()])
        .table([{ label: 'Item code' }]),
    ]);

    await submit();

    expect(await screen.findByText('SKU is required.')).toBeInTheDocument();
  });
});

describe('validation feedback', () => {
  it('summarises failing items and spells them out in place', async () => {
    renderForm([contacts().schema([TextInput.make('name').required()])], {
      contacts: [{ name: 'Ada' }, { name: '' }],
    });

    await submit();

    expect(await screen.findByText('1 item needs attention.')).toBeInTheDocument();
    expect(within(boxes()[1]).getByText('Name is required.')).toBeInTheDocument();
    expect(within(boxes()[0]).queryByText('Name is required.')).not.toBeInTheDocument();
  });

  it('pluralises the summary', async () => {
    renderForm([contacts().schema([TextInput.make('name').required()])], {
      contacts: [{ name: '' }, { name: '' }],
    });

    await submit();

    expect(await screen.findByText('2 items need attention.')).toBeInTheDocument();
  });

  it('shows nothing in place until validation has run', () => {
    renderForm([contacts().schema([TextInput.make('name').required()])]);

    expect(screen.queryByText('Name is required.')).not.toBeInTheDocument();
  });

  it('clears the item issues once the form is valid', async () => {
    renderForm([contacts().schema([TextInput.make('name').required()])]);

    await submit();
    expect(await screen.findByText('Name is required.')).toBeInTheDocument();

    await userEvent.type(inputsNamed('Name')[0], 'Ada');

    await waitFor(() => expect(screen.queryByText('Name is required.')).not.toBeInTheDocument());
  });
});

describe('resolvers inside an item', () => {
  it('reads sibling values from the same item', () => {
    renderForm(
      [
        Repeater.make('contacts').schema([
          Select.make('kind').options([
            { label: 'Person', value: 'person' },
            { label: 'Company', value: 'company' },
          ]),
          TextInput.make('vat').visible((ctx) => ctx.get('kind') === 'company'),
        ]),
      ],
      {
        contacts: [{ kind: 'person' }, { kind: 'company' }],
      },
    );

    expect(within(boxes()[0]).queryByRole('textbox', { name: 'Vat' })).not.toBeInTheDocument();
    expect(within(boxes()[1]).getByRole('textbox', { name: 'Vat' })).toBeInTheDocument();
  });

  it('writes sibling values inside the same item', async () => {
    const { onSubmit } = renderForm([
      Repeater.make('contacts').schema([
        TextInput.make('name')
          .live()
          .afterStateUpdated(({ state, set }) => set('slug', state.toLowerCase())),
        TextInput.make('slug'),
      ]),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Add to Contacts' }));
    await userEvent.type(inputsNamed('Name')[1], 'AB');
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        contacts: [
          { name: '', slug: '' },
          { name: 'AB', slug: 'ab' },
        ],
      }),
    );
  });

  // Children are rendered under a scope rather than cloned, so *every* resolver
  // a field subclass declares is item-relative — not a fixed list of config keys.
  it('scopes a resolver a field subclass owns, not just the shared ones', () => {
    renderForm(
      [
        Repeater.make('contacts').schema([
          TextInput.make('kind'),
          Select.make('plan')
            .native()
            .options((ctx): Record<string, string> =>
              ctx.get('kind') === 'company'
                ? { enterprise: 'Enterprise' }
                : { personal: 'Personal' },
            ),
        ]),
      ],
      { contacts: [{ kind: 'person' }, { kind: 'company' }] },
    );

    const selects = screen.getAllByRole('combobox', { name: 'Plan' });
    expect(within(selects[0]).getByRole('option', { name: 'Personal' })).toBeInTheDocument();
    expect(within(selects[1]).getByRole('option', { name: 'Enterprise' })).toBeInTheDocument();
  });

  it('climbs out of the item with ../', () => {
    renderForm(
      [
        TextInput.make('mode'),
        Repeater.make('contacts').schema([
          TextInput.make('vat').visible((ctx) => ctx.get('../../mode') === 'business'),
        ]),
      ],
      { mode: 'business', contacts: [{}] },
    );

    expect(screen.getByRole('textbox', { name: 'Vat' })).toBeInTheDocument();
  });
});
