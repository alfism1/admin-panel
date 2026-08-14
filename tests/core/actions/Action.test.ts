import { describe, expect, it, vi } from 'vitest';
import { Action } from '@/core/actions/Action';
import { BulkAction, DeleteBulkAction } from '@/core/actions/BulkAction';
import { CreateAction } from '@/core/actions/CreateAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { TextInput } from '@/core/forms/fields/TextInput';

const record = { id: 7, name: 'Ada' };

describe('Action basics', () => {
  it('is immutable across mutators', () => {
    const base = Action.make('publish');
    const coloured = base.color('success');

    expect(coloured).not.toBe(base);
    expect(base.definition.color).toBeUndefined();
    expect(coloured.definition.color).toBe('success');
  });

  it('exposes its name', () => {
    expect(Action.make('publish').name).toBe('publish');
  });

  it('falls back to a labelized name', () => {
    expect(Action.make('send_invite').resolveLabel(null)).toBe('Send Invite');
  });

  it('prefers an explicit label', () => {
    expect(Action.make('publish').label('Go live').resolveLabel(null)).toBe('Go live');
  });

  it('resolves a label function against the record', () => {
    const action = Action.make('toggle').label((row) => (row ? `Edit ${String(row.name)}` : 'New'));

    expect(action.resolveLabel(record)).toBe('Edit Ada');
    expect(action.resolveLabel(null)).toBe('New');
  });

  it('stores presentation options', () => {
    const action = Action.make('publish')
      .icon('check')
      .iconOnly()
      .color('success')
      .size('sm')
      .tooltip('Publish this post')
      .modalWidth('lg');

    expect(action.definition).toMatchObject({
      icon: 'check',
      iconOnly: true,
      color: 'success',
      size: 'sm',
      tooltip: 'Publish this post',
      modalWidth: 'lg',
    });
  });

  it('stores a handler and a url resolver', () => {
    const handler = vi.fn();
    const url = () => '/somewhere';
    const action = Action.make('go').action(handler).url(url, { openInNewTab: true });

    expect(action.definition.handler).toBe(handler);
    expect(action.definition.urlResolver).toBe(url);
    expect(action.definition.openInNewTab).toBe(true);
  });

  it('stores notification overrides, including opting out', () => {
    const action = Action.make('x').successNotification('Done.').failureNotification(false);
    expect(action.definition.successNotification).toBe('Done.');
    expect(action.definition.failureNotification).toBe(false);
  });
});

describe('confirmation', () => {
  it('is absent by default', () => {
    expect(Action.make('publish').definition.confirmation).toBeUndefined();
  });

  it('requiresConfirmation() with no options stores an empty object', () => {
    expect(Action.make('publish').requiresConfirmation().definition.confirmation).toEqual({});
  });

  it('stores the copy it was given', () => {
    const action = Action.make('archive').requiresConfirmation({
      heading: 'Archive this post?',
      confirmLabel: 'Archive',
    });

    expect(action.definition.confirmation).toEqual({
      heading: 'Archive this post?',
      confirmLabel: 'Archive',
    });
  });
});

describe('form()', () => {
  it('stores a modal form schema', () => {
    const schema = [TextInput.make('reason').required()];
    expect(Action.make('reject').form(schema).definition.formSchema).toBe(schema);
  });
});

describe('isVisible', () => {
  it('is visible by default', () => {
    expect(Action.make('x').isVisible(record)).toBe(true);
    expect(Action.make('x').isVisible(null)).toBe(true);
  });

  it('honours a boolean', () => {
    expect(Action.make('x').visible(false).isVisible(record)).toBe(false);
  });

  it('honours a record predicate', () => {
    const action = Action.make('publish').visible((row) => row?.status === 'draft');

    expect(action.isVisible({ status: 'draft' })).toBe(true);
    expect(action.isVisible({ status: 'published' })).toBe(false);
  });

  it('passes null through to the predicate for header actions', () => {
    const action = Action.make('x').visible((row) => row === null);
    expect(action.isVisible(null)).toBe(true);
  });
});

describe('isDisabled', () => {
  it('is enabled by default', () => {
    expect(Action.make('x').isDisabled(record)).toBe(false);
  });

  it('honours a boolean', () => {
    expect(Action.make('x').disabled(true).isDisabled(record)).toBe(true);
  });

  it('honours a record predicate', () => {
    const action = Action.make('delete').disabled((row) => row?.is_locked === true);

    expect(action.isDisabled({ is_locked: true })).toBe(true);
    expect(action.isDisabled({ is_locked: false })).toBe(false);
  });
});

describe('authorize', () => {
  it('stores a permission string', () => {
    expect(Action.make('x').authorize('post.publish').definition.authorization).toBe(
      'post.publish',
    );
  });

  it('stores a predicate', () => {
    const rule = () => true;
    expect(Action.make('x').authorize(rule).definition.authorization).toBe(rule);
  });
});

describe('built-in actions', () => {
  it('ViewAction is an icon-only gray eye', () => {
    expect(ViewAction.make().definition).toMatchObject({
      name: 'view',
      builtin: 'view',
      icon: 'eye',
      color: 'gray',
      iconOnly: true,
      tooltip: 'View',
    });
  });

  it('EditAction is an icon-only gray pencil', () => {
    expect(EditAction.make().definition).toMatchObject({
      name: 'edit',
      builtin: 'edit',
      icon: 'pencil',
      iconOnly: true,
    });
  });

  it('DeleteAction is destructive and confirms by default', () => {
    expect(DeleteAction.make().definition).toMatchObject({
      name: 'delete',
      builtin: 'delete',
      icon: 'trash',
      color: 'danger',
      confirmation: {},
    });
  });

  it('CreateAction is a primary plus button', () => {
    expect(CreateAction.make().definition).toMatchObject({
      name: 'create',
      builtin: 'create',
      icon: 'plus',
      color: 'primary',
    });
  });

  it('BulkAction defaults to a small secondary button', () => {
    expect(BulkAction.make('export').definition).toMatchObject({
      name: 'export',
      size: 'sm',
      color: 'secondary',
    });
  });

  it('DeleteBulkAction confirms and is destructive', () => {
    expect(DeleteBulkAction.make().definition).toMatchObject({
      name: 'deleteSelected',
      builtin: 'deleteBulk',
      color: 'danger',
      confirmation: {},
    });
  });

  it('keeps its subclass after a mutation', () => {
    expect(DeleteAction.make().color('warning')).toBeInstanceOf(DeleteAction);
  });

  it('lets a built-in be customised without losing its builtin marker', () => {
    const action = DeleteAction.make().label('Remove').requiresConfirmation({ heading: 'Sure?' });

    expect(action.definition.builtin).toBe('delete');
    expect(action.resolveLabel(record)).toBe('Remove');
    expect(action.definition.confirmation).toEqual({ heading: 'Sure?' });
  });
});
