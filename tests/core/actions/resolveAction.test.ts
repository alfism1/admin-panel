import { describe, expect, it } from 'vitest';
import { Action } from '@/core/actions/Action';
import { CreateAction } from '@/core/actions/CreateAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { DeleteBulkAction } from '@/core/actions/BulkAction';
import { EditAction } from '@/core/actions/EditAction';
import { ExportBulkAction } from '@/core/actions/ExportBulkAction';
import { ReplicateAction, ReplicateBulkAction } from '@/core/actions/ReplicateAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { resolveBuiltin } from '@/core/actions/resolveAction';
import type { BuiltinAction } from '@/core/actions/types';
import { defineResource } from '@/core/resources/Resource';
import { TextColumn } from '@/core/tables/columns/TextColumn';

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  recordTitleKey: 'title',
  permissions: {
    viewAny: 'post.viewAny',
    view: 'post.view',
    create: 'post.create',
    update: 'post.update',
    delete: 'post.delete',
  },
  table: { columns: [TextColumn.make('title')] },
});

const record = { id: 7, title: 'Hello world' };

describe('non-builtin actions', () => {
  it('resolves to nothing, so a custom action keeps its own config', () => {
    expect(resolveBuiltin(Action.make('publish').definition, resource, record)).toEqual({});
  });

  it('resolves to nothing when the action is outside a resource', () => {
    expect(resolveBuiltin(ViewAction.make().definition, undefined, record)).toEqual({});
  });
});

describe('view', () => {
  it('fills in the label, permission and route', () => {
    expect(resolveBuiltin(ViewAction.make().definition, resource, record)).toEqual({
      label: 'View',
      permission: 'post.view',
      href: '/posts/7',
    });
  });

  it('has no href without a record', () => {
    expect(resolveBuiltin(ViewAction.make().definition, resource, null).href).toBeUndefined();
  });
});

describe('edit', () => {
  it('fills in the label, permission and route', () => {
    expect(resolveBuiltin(EditAction.make().definition, resource, record)).toEqual({
      label: 'Edit',
      permission: 'post.update',
      href: '/posts/7/edit',
    });
  });
});

describe('create', () => {
  it('names itself after the singular label and routes to /create', () => {
    expect(resolveBuiltin(CreateAction.make().definition, resource, null)).toEqual({
      label: 'New post',
      permission: 'post.create',
      href: '/posts/create',
    });
  });
});

describe('delete', () => {
  const resolved = resolveBuiltin(DeleteAction.make().definition, resource, record);

  it('uses the delete permission and a success message', () => {
    expect(resolved.permission).toBe('post.delete');
    expect(resolved.successMessage).toBe('Post deleted.');
  });

  it('builds confirmation copy naming the record', () => {
    expect(resolved.confirmation).toMatchObject({
      heading: 'Delete this post?',
      confirmLabel: 'Delete',
    });
    expect((resolved.confirmation as { description: string }).description).toContain('Hello world');
  });

  it('falls back to "Singular #id" in the copy when the record has no title', () => {
    const untitled = resolveBuiltin(DeleteAction.make().definition, resource, { id: 9 });
    expect((untitled.confirmation as { description: string }).description).toContain('Post #9');
  });

  it('lets an explicit confirmation override the generated copy', () => {
    const custom = DeleteAction.make().requiresConfirmation({ heading: 'Really remove it?' });
    const result = resolveBuiltin(custom.definition, resource, record);

    expect(result.confirmation).toMatchObject({
      heading: 'Really remove it?',
      confirmLabel: 'Delete',
    });
  });
});

describe('deleteBulk', () => {
  const resolved = resolveBuiltin(DeleteBulkAction.make().definition, resource, null);

  it('uses the plural label throughout', () => {
    expect(resolved.label).toBe('Delete selected');
    expect(resolved.successMessage).toBe('Posts deleted.');
    expect(resolved.confirmation).toMatchObject({ heading: 'Delete the selected posts?' });
  });

  it('uses the delete permission', () => {
    expect(resolved.permission).toBe('post.delete');
  });
});

describe('replicate', () => {
  const resolved = resolveBuiltin(ReplicateAction.make().definition, resource, record);

  it('creates a row, so it is gated on the create permission', () => {
    expect(resolved.permission).toBe('post.create');
    expect(resolved.label).toBe('Duplicate');
    expect(resolved.successMessage).toBe('Post duplicated.');
  });

  it('generates no confirmation copy, because a copy is reversible', () => {
    expect(resolved.confirmation).toBeUndefined();
  });

  it('generates copy naming the record once a confirmation is asked for', () => {
    const asked = resolveBuiltin(
      ReplicateAction.make().requiresConfirmation().definition,
      resource,
      record,
    );

    expect(asked.confirmation).toMatchObject({
      heading: 'Duplicate this post?',
      confirmLabel: 'Duplicate',
    });
    expect((asked.confirmation as { description: string }).description).toContain('Hello world');
  });

  it('lets an explicit confirmation override the generated copy', () => {
    const custom = ReplicateAction.make().requiresConfirmation({ heading: 'Copy it?' });

    expect(resolveBuiltin(custom.definition, resource, record).confirmation).toMatchObject({
      heading: 'Copy it?',
      confirmLabel: 'Duplicate',
    });
  });

  it('opting out of confirmation leaves nothing for the renderer to show', () => {
    const off = ReplicateAction.make().requiresConfirmation(false);

    expect(resolveBuiltin(off.definition, resource, record).confirmation).toBeUndefined();
  });
});

describe('replicateBulk', () => {
  const resolved = resolveBuiltin(ReplicateBulkAction.make().definition, resource, null);

  it('always confirms, since it writes one row per selected record', () => {
    expect(resolved.confirmation).toMatchObject({
      heading: 'Duplicate the selected posts?',
      confirmLabel: 'Duplicate',
    });
  });

  it('uses the plural label and the create permission', () => {
    expect(resolved.label).toBe('Duplicate selected');
    expect(resolved.permission).toBe('post.create');
    expect(resolved.successMessage).toBe('Posts duplicated.');
  });

  it('generates its copy even with no explicit confirmation', () => {
    const config = { ...ReplicateBulkAction.make().definition, confirmation: undefined };

    expect(resolveBuiltin(config, resource, null).confirmation).toMatchObject({
      heading: 'Duplicate the selected posts?',
    });
  });
});

describe('exportBulk', () => {
  const resolved = resolveBuiltin(ExportBulkAction.make().definition, resource, null);

  it('reads rows already on screen, so viewAny is the gate', () => {
    expect(resolved.permission).toBe('post.viewAny');
  });

  it('names itself for the selection and reports in the plural', () => {
    expect(resolved.label).toBe('Export selected');
    expect(resolved.successMessage).toBe('Posts exported.');
  });

  it('never confirms', () => {
    expect(resolved.confirmation).toBeUndefined();
  });
});

describe('a resource without permissions', () => {
  const open = defineResource({ name: 'notes', table: { columns: [TextColumn.make('body')] } });

  it('leaves the permission undefined rather than inventing one', () => {
    expect(
      resolveBuiltin(EditAction.make().definition, open, { id: 1 }).permission,
    ).toBeUndefined();
  });

  it('still resolves the route', () => {
    expect(resolveBuiltin(EditAction.make().definition, open, { id: 1 }).href).toBe(
      '/notes/1/edit',
    );
  });
});

describe('forward compatibility', () => {
  it('resolves an unrecognised builtin to nothing rather than throwing', () => {
    const config = { ...Action.make('mystery').definition, builtin: 'archive' as BuiltinAction };

    expect(resolveBuiltin(config, resource, record)).toEqual({});
  });
});

describe('a row action rendered without a record', () => {
  it('leaves the view href undefined', () => {
    expect(resolveBuiltin(ViewAction.make().definition, resource, null).href).toBeUndefined();
  });

  it('leaves the edit href undefined', () => {
    expect(resolveBuiltin(EditAction.make().definition, resource, null).href).toBeUndefined();
  });
});

describe('a bulk delete with no explicit confirmation', () => {
  it('still generates its own copy', () => {
    const config = { ...DeleteBulkAction.make().definition, confirmation: undefined };

    expect(resolveBuiltin(config, resource, null).confirmation).toMatchObject({
      heading: 'Delete the selected posts?',
      confirmLabel: 'Delete',
    });
  });

  it('generates delete copy without an explicit confirmation too', () => {
    const config = { ...DeleteAction.make().definition, confirmation: undefined };

    expect(resolveBuiltin(config, resource, record).confirmation).toMatchObject({
      heading: 'Delete this post?',
    });
  });
});
