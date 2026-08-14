import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'admin.mock-db.v1';

/**
 * `db` loads from `localStorage` at module scope, so each boot scenario needs a
 * fresh module graph rather than a call into the already-loaded one.
 */
async function boot() {
  vi.resetModules();
  return import('@/core/data/mock/db');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('booting the mock database', () => {
  it('seeds and persists when storage is empty', async () => {
    const { collection } = await boot();

    expect(collection('users').length).toBeGreaterThan(0);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('restores what was persisted', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ users: [{ id: 42, name: 'Stored' }], roles: [], posts: [] }),
    );

    const { collection } = await boot();

    expect(collection('users')).toEqual([{ id: 42, name: 'Stored' }]);
  });

  it('re-seeds rather than dying on a corrupt payload', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const { collection } = await boot();

    expect(collection('users').length).toBeGreaterThan(0);
    expect(() => JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).not.toThrow();
  });

  it('re-seeds on demand and persists the fresh copy', async () => {
    const { collection, resetDatabase, writeCollection } = await boot();
    writeCollection('users', []);
    expect(collection('users')).toEqual([]);

    resetDatabase();

    expect(collection('users').length).toBeGreaterThan(0);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as {
      users: unknown[];
    };
    expect(stored.users.length).toBeGreaterThan(0);
  });
});
