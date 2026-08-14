import { screen } from '@testing-library/react';
import { Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { generateRoutes } from '@/core/resources/generateRoutes';
import { defineResource } from '@/core/resources/Resource';
import type { Resource, ResourceDefinition } from '@/core/resources/types';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { makeUser } from '../../helpers/context';
import { renderWithProviders } from '../../helpers/render';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

// The four CRUD pages are covered on their own; here only the routing table and
// its permission gates matter, so each page is replaced by a marker.
vi.mock('@/core/resources/pages/ListPage', () => ({
  ListPage: ({ resource }: { resource: Resource }) => <h1>List:{resource.name}</h1>,
}));
vi.mock('@/core/resources/pages/CreatePage', () => ({
  CreatePage: ({ resource }: { resource: Resource }) => <h1>Create:{resource.name}</h1>,
}));
vi.mock('@/core/resources/pages/EditPage', () => ({
  EditPage: ({ resource }: { resource: Resource }) => <h1>Edit:{resource.name}</h1>,
}));
vi.mock('@/core/resources/pages/ViewPage', () => ({
  ViewPage: ({ resource }: { resource: Resource }) => <h1>View:{resource.name}</h1>,
}));

const base: ResourceDefinition = {
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  table: { columns: [TextColumn.make('title')] },
};

const gated = defineResource({
  ...base,
  permissions: {
    viewAny: 'post.viewAny',
    view: 'post.view',
    create: 'post.create',
    update: 'post.update',
    delete: 'post.delete',
  },
});

function renderAt(route: string, resources: Resource[], permissions = ['*']) {
  return renderWithProviders(<Routes>{generateRoutes(resources)}</Routes>, {
    route,
    user: makeUser({ permissions }),
  });
}

describe('route generation', () => {
  const resource = defineResource(base);

  it.each([
    ['/posts', 'List:posts'],
    ['/posts/create', 'Create:posts'],
    ['/posts/7', 'View:posts'],
    ['/posts/7/edit', 'Edit:posts'],
  ])('routes %s to %s', (route, heading) => {
    renderAt(route, [resource]);

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('emits four routes per resource', () => {
    expect(generateRoutes([resource])).toHaveLength(4);
  });

  it('gives every route a unique key', () => {
    const keys = generateRoutes([resource]).map((element) => element.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches /create before the :id route, so "create" is never read as an id', () => {
    renderAt('/posts/create', [resource]);

    expect(screen.getByRole('heading', { name: 'Create:posts' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'View:posts' })).not.toBeInTheDocument();
  });

  it('honours a custom base route', () => {
    const custom = defineResource({ ...base, route: '/admin/articles' });
    renderAt('/admin/articles/7/edit', [custom]);

    expect(screen.getByRole('heading', { name: 'Edit:posts' })).toBeInTheDocument();
  });

  it('keeps two resources independent', () => {
    const users = defineResource({
      name: 'users',
      labels: { singular: 'User', plural: 'Users' },
      table: { columns: [TextColumn.make('name')] },
    });

    renderAt('/users', [resource, users]);

    expect(screen.getByRole('heading', { name: 'List:users' })).toBeInTheDocument();
  });

  it('emits nothing for an empty resource list', () => {
    expect(generateRoutes([])).toEqual([]);
  });
});

describe('disabled pages', () => {
  it('omits a page turned off in the definition', () => {
    const resource = defineResource({ ...base, pages: { create: false } });

    expect(generateRoutes([resource])).toHaveLength(3);
  });

  it('does not match the route of a disabled page', () => {
    const resource = defineResource({ ...base, pages: { create: false } });
    renderAt('/posts/create', [resource]);

    // `/posts/create` now falls through to the `:id` route.
    expect(screen.queryByRole('heading', { name: 'Create:posts' })).not.toBeInTheDocument();
  });

  it('can disable every page', () => {
    const resource = defineResource({
      ...base,
      pages: { list: false, create: false, edit: false, view: false },
    });

    expect(generateRoutes([resource])).toEqual([]);
  });
});

describe('page overrides', () => {
  it('renders a custom component in place of the built-in page', () => {
    const Custom = () => <h1>Custom list</h1>;
    const resource = defineResource({ ...base, pages: { list: Custom } });

    renderAt('/posts', [resource]);

    expect(screen.getByRole('heading', { name: 'Custom list' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'List:posts' })).not.toBeInTheDocument();
  });

  it('still applies the permission gate to an overridden page', () => {
    const Custom = () => <h1>Custom list</h1>;
    const resource = defineResource({
      ...base,
      permissions: { viewAny: 'post.viewAny' },
      pages: { list: Custom },
    });

    renderAt('/posts', [resource], ['post.view']);

    expect(screen.queryByRole('heading', { name: 'Custom list' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /403/ })).toBeInTheDocument();
  });
});

describe('permission gates', () => {
  it.each([
    ['/posts', 'post.viewAny', 'List:posts'],
    ['/posts/create', 'post.create', 'Create:posts'],
    ['/posts/7', 'post.view', 'View:posts'],
    ['/posts/7/edit', 'post.update', 'Edit:posts'],
  ])('admits %s to a user holding %s', (route, permission, heading) => {
    renderAt(route, [gated], [permission]);

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it.each([
    ['/posts', 'List:posts'],
    ['/posts/create', 'Create:posts'],
    ['/posts/7', 'View:posts'],
    ['/posts/7/edit', 'Edit:posts'],
  ])('shows 403 at %s to a user with no permissions', (route, heading) => {
    renderAt(route, [gated], []);

    expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /403/ })).toBeInTheDocument();
  });

  it('names the missing permission on the 403 page', () => {
    renderAt('/posts/7/edit', [gated], []);

    expect(screen.getByText('post.update')).toBeInTheDocument();
  });

  it('does not let the list permission unlock editing', () => {
    renderAt('/posts/7/edit', [gated], ['post.viewAny']);

    expect(screen.getByRole('heading', { name: /403/ })).toBeInTheDocument();
  });

  it('admits every page to a wildcard holder', () => {
    renderAt('/posts/7/edit', [gated], ['post.*']);

    expect(screen.getByRole('heading', { name: 'Edit:posts' })).toBeInTheDocument();
  });

  it('leaves an ungated resource open to any signed-in user', () => {
    renderAt('/posts', [defineResource(base)], []);

    expect(screen.getByRole('heading', { name: 'List:posts' })).toBeInTheDocument();
  });
});
