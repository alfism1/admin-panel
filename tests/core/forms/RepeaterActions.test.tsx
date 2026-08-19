import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '@/core/forms/fields/Checkbox';
import { Select } from '@/core/forms/fields/Select';
import { TextInput } from '@/core/forms/fields/TextInput';
import { SchemaForm } from '@/core/forms/SchemaForm';
import type { FormComponent, FormValues } from '@/core/forms/types';
import { Repeater } from '@/core/forms/fields/Repeater';
import { RepeaterAction } from '@/core/forms/fields/RepeaterAction';
import { duplicateItem, fixIndistinctItems, moveItem } from '@/core/forms/fields/repeaterItems';
import { renderWithProviders } from '../../helpers/render';

function renderForm(
  schema: FormComponent[],
  record: FormValues | null = null,
  permissions?: string[],
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  renderWithProviders(
    <SchemaForm
      schema={schema}
      operation={record ? 'edit' : 'create'}
      record={record}
      onSubmit={onSubmit}
    />,
    permissions ? { permissions } : {},
  );

  return { onSubmit };
}

const submit = () => userEvent.click(screen.getByRole('button', { name: /Create|Save/ }));

const contacts = () => Repeater.make('contacts').schema([TextInput.make('name')]);
const boxes = () => screen.getAllByLabelText(/^Item \d$/);
const two = { contacts: [{ name: 'Ada' }, { name: 'Grace' }] };

describe('RepeaterAction builder', () => {
  const action = () => RepeaterAction.make('resetBody');

  it('labelizes its name when no label is set', () => {
    expect(action().resolveLabel({}, 0)).toBe('Reset Body');
  });

  it('resolves a label from the item', () => {
    expect(
      action()
        .label((item, index) => `${String(item.name)} ${index}`)
        .resolveLabel({ name: 'Ada' }, 2),
    ).toBe('Ada 2');
  });

  it('is visible and enabled by default', () => {
    expect(action().isVisible({}, 0)).toBe(true);
    expect(action().isDisabled({}, 0)).toBe(false);
  });

  it('takes visibility as a boolean or a predicate', () => {
    expect(action().visible(false).isVisible({}, 0)).toBe(false);
    expect(
      action()
        .visible((item) => item.name === 'Ada')
        .isVisible({ name: 'Ada' }, 0),
    ).toBe(true);
  });

  it('takes disabled as a boolean or a predicate', () => {
    expect(action().disabled(true).isDisabled({}, 0)).toBe(true);
    expect(
      action()
        .disabled((_item, index) => index > 0)
        .isDisabled({}, 1),
    ).toBe(true);
  });

  it('authorizes by permission or by predicate', () => {
    const can = (permission: string) => permission === 'post.publish';

    expect(action().isAuthorized({}, 0, can)).toBe(true);
    expect(action().authorize('post.publish').isAuthorized({}, 0, can)).toBe(true);
    expect(action().authorize('post.delete').isAuthorized({}, 0, can)).toBe(false);
    expect(
      action()
        .authorize(() => false)
        .isAuthorized({}, 0, can),
    ).toBe(false);
  });

  it('records the presentation options on the definition', () => {
    const built = action().icon('copy').color('danger').tooltip('Wipe it').requiresConfirmation();

    expect(built.definition).toMatchObject({
      icon: 'copy',
      color: 'danger',
      tooltip: 'Wipe it',
      confirmation: {},
    });
    expect(built.name).toBe('resetBody');
  });

  it('clones on every call, so a shared base is never mutated', () => {
    const base = action();
    base.label('Changed');

    expect(base.resolveLabel({}, 0)).toBe('Reset Body');
  });
});

describe('extraItemActions', () => {
  it('renders one button per item and edits that item', async () => {
    const { onSubmit } = renderForm(
      [
        contacts().extraItemActions([
          RepeaterAction.make('shout')
            .label('Shout')
            .icon('bell')
            .action(({ item, set }) => set({ ...item, name: String(item.name).toUpperCase() })),
        ]),
      ],
      two,
    );

    await userEvent.click(within(boxes()[1]).getByRole('button', { name: 'Shout' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ contacts: [{ name: 'Ada' }, { name: 'GRACE' }] }),
    );
  });

  it('hides an action its predicate rejects', () => {
    renderForm(
      [
        contacts().extraItemActions([
          RepeaterAction.make('shout')
            .label('Shout')
            .visible((item) => item.name === 'Ada'),
        ]),
      ],
      two,
    );

    expect(within(boxes()[0]).getByRole('button', { name: 'Shout' })).toBeInTheDocument();
    expect(within(boxes()[1]).queryByRole('button', { name: 'Shout' })).not.toBeInTheDocument();
  });

  it('hides an action the user is not permitted', () => {
    renderForm(
      [
        contacts().extraItemActions([
          RepeaterAction.make('shout').label('Shout').authorize('post.publish'),
        ]),
      ],
      two,
      ['post.view'],
    );

    expect(screen.queryByRole('button', { name: 'Shout' })).not.toBeInTheDocument();
  });

  it('disables an action its predicate disables', () => {
    renderForm(
      [contacts().extraItemActions([RepeaterAction.make('shout').label('Shout').disabled(true)])],
      two,
    );

    expect(within(boxes()[0]).getByRole('button', { name: 'Shout' })).toBeDisabled();
  });

  it('reaches the wider form through the field context', async () => {
    const { onSubmit } = renderForm(
      [
        TextInput.make('title'),
        contacts().extraItemActions([
          RepeaterAction.make('copyTitle')
            .label('Copy title')
            .action(({ item, set, field }) => set({ ...item, name: field.get('title') })),
        ]),
      ],
      { title: 'From the form', contacts: [{ name: '' }] },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Copy title' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'From the form',
        contacts: [{ name: 'From the form' }],
      }),
    );
  });
});

describe('confirmation', () => {
  const confirmable = () =>
    contacts().deleteAction((action) =>
      action.requiresConfirmation({
        heading: 'Remove this contact?',
        description: 'It goes when you save.',
        confirmLabel: 'Remove it',
        cancelLabel: 'Keep it',
      }),
    );

  it('waits for the dialog before running', async () => {
    const { onSubmit } = renderForm([confirmable()], two);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Item 1' }));
    expect(await screen.findByText('Remove this contact?')).toBeInTheDocument();
    expect(screen.getByText('It goes when you save.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove it' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ contacts: [{ name: 'Grace' }] }));
  });

  it('does nothing when the dialog is cancelled', async () => {
    const { onSubmit } = renderForm([confirmable()], two);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Item 1' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(two));
  });

  it('falls back to a generated heading and default wording', async () => {
    renderForm([contacts().deleteAction((action) => action.requiresConfirmation())], two);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Item 1' }));

    expect(await screen.findByText('Delete Item 1?')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone once the form is saved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('uses the primary tone when the action declares no colour', async () => {
    renderForm(
      [
        contacts()
          .cloneable()
          .cloneAction((action) => action.requiresConfirmation()),
      ],
      two,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clone Item 1' }));

    expect(await screen.findByRole('button', { name: 'Clone Item 1' })).toHaveClass('bg-primary');
  });

  it('ignores a confirmation that was explicitly turned off', async () => {
    const { onSubmit } = renderForm(
      [contacts().deleteAction((action) => action.requiresConfirmation(false))],
      two,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete Item 1' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ contacts: [{ name: 'Grace' }] }));
  });
});

describe('built-in action modifiers', () => {
  it('renames and re-icons the add button', () => {
    renderForm([contacts().addAction((action) => action.label('One more').icon('user-plus'))]);

    expect(screen.getByRole('button', { name: 'One more' })).toBeInTheDocument();
  });

  it('renames the clone button', () => {
    renderForm(
      [
        contacts()
          .cloneable()
          .cloneAction((action) => action.label('Duplicate')),
      ],
      two,
    );

    expect(within(boxes()[0]).getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
  });

  it('renames the move buttons', () => {
    renderForm(
      [
        contacts()
          .moveUpAction((action) => action.label('Earlier'))
          .moveDownAction((action) => action.label('Later')),
      ],
      two,
    );

    expect(within(boxes()[1]).getByRole('button', { name: 'Earlier' })).toBeInTheDocument();
    expect(within(boxes()[0]).getByRole('button', { name: 'Later' })).toBeInTheDocument();
  });

  it('renames the collapse button and keeps aria-expanded', async () => {
    renderForm([
      contacts()
        .collapsible()
        .collapseAction((action) => action.label('Fold')),
    ]);

    const button = screen.getByRole('button', { name: 'Fold' });
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Fold' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('renames the drag handle', () => {
    renderForm([contacts().reorderAction((action) => action.label('Drag'))], two);

    expect(within(boxes()[0]).getByRole('button', { name: 'Drag' })).toBeInTheDocument();
  });

  it('hides the drag handle when the modifier makes it invisible', () => {
    renderForm([contacts().reorderAction((action) => action.visible(false))], two);

    expect(screen.queryByRole('button', { name: /^Reorder/ })).not.toBeInTheDocument();
  });

  it('replaces a built-in handler entirely', async () => {
    const { onSubmit } = renderForm(
      [
        contacts().deleteAction((action) =>
          action.action(({ item, set }) => set({ ...item, name: '' })),
        ),
      ],
      two,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete Item 1' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ contacts: [{ name: '' }, { name: 'Grace' }] }),
    );
  });
});

describe('fixIndistinctState', () => {
  const kinds = { a: 'Alpha', b: 'Beta' };

  it('clears the losing copy when a value is duplicated', async () => {
    const { onSubmit } = renderForm(
      [
        Repeater.make('rows')
          .distinct('kind')
          .fixIndistinctState()
          .schema([Select.make('kind').options(kinds).native()]),
      ],
      { rows: [{ kind: 'a' }, { kind: 'b' }] },
    );

    await userEvent.selectOptions(screen.getAllByRole('combobox', { name: 'Kind' })[1], 'a');
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ rows: [{ kind: null }, { kind: 'a' }] }),
    );
  });

  it('unsets the other checkboxes when one is ticked', async () => {
    const { onSubmit } = renderForm(
      [
        Repeater.make('rows')
          .distinct('primary')
          .fixIndistinctState()
          .schema([Checkbox.make('primary')]),
      ],
      { rows: [{ primary: true }, { primary: false }] },
    );

    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Primary' })[1]);
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ rows: [{ primary: false }, { primary: true }] }),
    );
  });

  it('leaves a record that arrives with duplicates alone', () => {
    renderForm(
      [
        Repeater.make('rows')
          .distinct('kind')
          .fixIndistinctState()
          .schema([Select.make('kind').options(kinds).native()]),
      ],
      { rows: [{ kind: 'a' }, { kind: 'a' }] },
    );

    const selects = screen.getAllByRole('combobox', { name: 'Kind' });
    expect(selects[0]).toHaveValue('a');
    expect(selects[1]).toHaveValue('a');
  });

  it('does nothing without fixIndistinctState', async () => {
    const { onSubmit } = renderForm(
      [
        Repeater.make('rows')
          .distinct('kind')
          .schema([Select.make('kind').options(kinds).native()]),
      ],
      { rows: [{ kind: 'a' }, { kind: 'b' }] },
    );

    await userEvent.selectOptions(screen.getAllByRole('combobox', { name: 'Kind' })[1], 'a');
    await submit();

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    expect(await screen.findByText('Kind must be unique across items.')).toBeInTheDocument();
  });
});

describe('item array helpers', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('moves an item and refuses an out-of-range target', () => {
    expect(moveItem(items, 2, 0)).toEqual([{ id: 3 }, { id: 1 }, { id: 2 }]);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 2, 3)).toBe(items);
    expect(moveItem(items, 1, 1)).toBe(items);
  });

  it('duplicates in place, keeping or dropping the id', () => {
    expect(duplicateItem(items, 0, true)).toEqual([{ id: 1 }, { id: 1 }, { id: 2 }, { id: 3 }]);
    expect(duplicateItem(items, 0, false)).toEqual([{ id: 1 }, {}, { id: 2 }, { id: 3 }]);
  });

  it('duplicates a scalar item as-is', () => {
    expect(duplicateItem(['a', 'b'], 0, false)).toEqual(['a', 'a', 'b']);
    expect(duplicateItem([null], 0, false)).toEqual([null, null]);
  });

  it('reports no fix when the array changed length', () => {
    expect(fixIndistinctItems([{ k: 'a' }], null, [], ['k'])).toBeNull();
    expect(fixIndistinctItems([{ k: 'a' }], [{ k: 'a' }, { k: 'b' }], [], ['k'])).toBeNull();
  });

  it('reports no fix when nothing changed or the edit is blank', () => {
    const previous = [{ k: 'a' }, { k: 'b' }];

    expect(fixIndistinctItems(previous, previous, [], ['k'])).toBeNull();
    expect(fixIndistinctItems([{ k: '' }, { k: 'b' }], previous, [], ['k'])).toBeNull();
  });

  it('reports no fix when the new value collides with nothing', () => {
    expect(
      fixIndistinctItems([{ k: 'c' }, { k: 'b' }], [{ k: 'a' }, { k: 'b' }], [], ['k']),
    ).toBeNull();
  });
});
