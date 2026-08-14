import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import type { ResourceDefinition } from '@/core/resources/types';

const table = { columns: [TextColumn.make('name')] };
const allow = () => true;

/**
 * `buildNavigation` reads two module-level singletons — the resource registry
 * and the standalone-item list — so every test needs a fresh module graph.
 */
async function freshNavigation() {
  vi.resetModules();
  const { registerResources } = await import('@/core/resources/registry');
  const { defineResource } = await import('@/core/resources/Resource');
  const { buildNavigation, registerNavigationItems } = await import('@/core/navigation/navigation');

  return {
    buildNavigation,
    registerNavigationItems,
    register: (definitions: ResourceDefinition[]) =>
      registerResources(definitions.map(defineResource)),
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe('resources in the sidebar', () => {
  it('returns nothing when nothing is registered', async () => {
    const { buildNavigation } = await freshNavigation();
    expect(buildNavigation(allow)).toEqual([]);
  });

  it('builds one ungrouped group from a resource', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([{ name: 'users', labels: { plural: 'Users' }, table }]);

    const groups = buildNavigation(allow);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
    expect(groups[0].items[0]).toMatchObject({
      key: 'users',
      label: 'Users',
      path: '/users',
      matchPrefix: true,
    });
  });

  it('prefers the navigation label over the plural label', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([
      {
        name: 'users',
        labels: { plural: 'Users' },
        navigation: { label: 'Team members' },
        table,
      },
    ]);

    expect(buildNavigation(allow)[0].items[0].label).toBe('Team members');
  });

  it('carries the icon and the viewAny permission onto the item', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([
      {
        name: 'users',
        labels: { plural: 'Users' },
        navigation: { icon: 'users' },
        permissions: { viewAny: 'user.viewAny' },
        table,
      },
    ]);

    expect(buildNavigation(allow)[0].items[0]).toMatchObject({
      icon: 'users',
      permission: 'user.viewAny',
    });
  });

  it('omits a resource with navigation: false', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([
      { name: 'users', labels: { plural: 'Users' }, table },
      { name: 'tokens', navigation: false, table },
    ]);

    const items = buildNavigation(allow)[0].items;
    expect(items.map((item) => item.key)).toEqual(['users']);
  });
});

describe('permission filtering', () => {
  it('drops items the user cannot view', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([
      {
        name: 'users',
        labels: { plural: 'Users' },
        permissions: { viewAny: 'user.viewAny' },
        table,
      },
      {
        name: 'roles',
        labels: { plural: 'Roles' },
        permissions: { viewAny: 'role.viewAny' },
        table,
      },
    ]);

    const groups = buildNavigation((permission) => permission === 'user.viewAny');

    expect(groups[0].items.map((item) => item.key)).toEqual(['users']);
  });

  it('keeps an item with no permission requirement', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([{ name: 'users', labels: { plural: 'Users' }, table }]);

    expect(buildNavigation(() => false)[0].items).toHaveLength(1);
  });

  it('drops a whole group when every item in it is denied', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([
      {
        name: 'users',
        labels: { plural: 'Users' },
        navigation: { group: 'Admin' },
        permissions: { viewAny: 'user.viewAny' },
        table,
      },
    ]);

    expect(buildNavigation(() => false)).toEqual([]);
  });
});

describe('grouping and ordering', () => {
  it('groups items by their group label', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([
      { name: 'users', labels: { plural: 'Users' }, navigation: { group: 'Admin' }, table },
      { name: 'roles', labels: { plural: 'Roles' }, navigation: { group: 'Admin' }, table },
      { name: 'posts', labels: { plural: 'Posts' }, table },
    ]);

    const groups = buildNavigation(allow);
    const admin = groups.find((group) => group.label === 'Admin');

    expect(admin?.items.map((item) => item.key).sort()).toEqual(['roles', 'users']);
  });

  it('puts the ungrouped group first', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([
      { name: 'users', labels: { plural: 'Users' }, navigation: { group: 'Admin' }, table },
      { name: 'posts', labels: { plural: 'Posts' }, table },
    ]);

    expect(buildNavigation(allow).map((group) => group.label)).toEqual([null, 'Admin']);
  });

  it('sorts by the sort key, then alphabetically', async () => {
    const { buildNavigation, register } = await freshNavigation();
    register([
      { name: 'zebra', labels: { plural: 'Zebra' }, navigation: { sort: 1 }, table },
      { name: 'apple', labels: { plural: 'Apple' }, navigation: { sort: 2 }, table },
      { name: 'mango', labels: { plural: 'Mango' }, navigation: { sort: 1 }, table },
    ]);

    expect(buildNavigation(allow)[0].items.map((item) => item.label)).toEqual([
      'Mango',
      'Zebra',
      'Apple',
    ]);
  });
});

describe('registerNavigationItems', () => {
  it('adds a standalone page to the sidebar', async () => {
    const { buildNavigation, registerNavigationItems } = await freshNavigation();
    registerNavigationItems([{ key: 'dashboard', label: 'Dashboard', path: '/' }]);

    expect(buildNavigation(allow)[0].items[0]).toMatchObject({
      key: 'dashboard',
      path: '/',
      sort: 0,
    });
  });

  it('defaults sort to 0 but keeps an explicit value', async () => {
    const { buildNavigation, registerNavigationItems } = await freshNavigation();
    registerNavigationItems([
      { key: 'settings', label: 'Settings', path: '/settings', sort: 99 },
      { key: 'dashboard', label: 'Dashboard', path: '/' },
    ]);

    expect(buildNavigation(allow)[0].items.map((item) => item.key)).toEqual([
      'dashboard',
      'settings',
    ]);
  });

  it('interleaves standalone items with resources by sort order', async () => {
    const { buildNavigation, registerNavigationItems, register } = await freshNavigation();
    registerNavigationItems([{ key: 'dashboard', label: 'Dashboard', path: '/', sort: -1 }]);
    register([{ name: 'users', labels: { plural: 'Users' }, table }]);

    expect(buildNavigation(allow)[0].items.map((item) => item.key)).toEqual(['dashboard', 'users']);
  });

  it('filters a standalone item by its permission', async () => {
    const { buildNavigation, registerNavigationItems } = await freshNavigation();
    registerNavigationItems([
      { key: 'settings', label: 'Settings', path: '/settings', permission: 'settings.view' },
    ]);

    expect(buildNavigation(() => false)).toEqual([]);
  });

  it('honours a group on a standalone item', async () => {
    const { buildNavigation, registerNavigationItems } = await freshNavigation();
    registerNavigationItems([
      { key: 'settings', label: 'Settings', path: '/settings', group: 'System' },
    ]);

    expect(buildNavigation(allow)[0].label).toBe('System');
  });
});
