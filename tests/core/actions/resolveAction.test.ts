import { describe, expect, it } from 'vitest';
import { Action } from '@/core/actions/Action';
import { CreateAction } from '@/core/actions/CreateAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { DeleteBulkAction } from '@/core/actions/BulkAction';
import { EditAction } from '@/core/actions/EditAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { resolveBuiltin } from '@/core/actions/resolveAction';
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
