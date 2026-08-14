import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextColumn } from '@/core/tables/columns/TextColumn';

const table = { columns: [TextColumn.make('name')] };

/** The registry is a module-level Map, so each test needs a fresh module graph. */
async function freshRegistry() {
  vi.resetModules();
  const registry = await import('@/core/resources/registry');
  const { defineResource } = await import('@/core/resources/Resource');
  return { ...registry, defineResource };
}

describe('resource registry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts empty', async () => {
    const { allResources } = await freshRegistry();
    expect(allResources()).toEqual([]);
  });

  it('registers resources and returns them unchanged', async () => {
    const { registerResources, allResources, defineResource } = await freshRegistry();
    const users = defineResource({ name: 'users', table });

    const returned = registerResources([users]);

    expect(returned).toEqual([users]);
    expect(allResources()).toEqual([users]);
  });

  it('preserves registration order', async () => {
    const { registerResources, allResources, defineResource } = await freshRegistry();
    registerResources([
      defineResource({ name: 'posts', table }),
      defineResource({ name: 'users', table }),
    ]);

    expect(allResources().map((resource) => resource.name)).toEqual(['posts', 'users']);
  });

  it('throws on a duplicate name, so a copy-pasted resource fails loudly', async () => {
    const { registerResources, defineResource } = await freshRegistry();
    registerResources([defineResource({ name: 'users', table })]);

    expect(() => registerResources([defineResource({ name: 'users', table })])).toThrow(
      'Resource "users" is already registered.',
    );
  });

  it('getResource returns the resource or undefined', async () => {
    const { registerResources, getResource, defineResource } = await freshRegistry();
    registerResources([defineResource({ name: 'users', table })]);

    expect(getResource('users')?.name).toBe('users');
    expect(getResource('missing')).toBeUndefined();
  });

  it('requireResource returns the resource', async () => {
    const { registerResources, requireResource, defineResource } = await freshRegistry();
    registerResources([defineResource({ name: 'users', table })]);

    expect(requireResource('users').name).toBe('users');
  });

  it('requireResource throws for an unknown name', async () => {
    const { requireResource } = await freshRegistry();
    expect(() => requireResource('missing')).toThrow('Resource "missing" is not registered.');
  });
});
