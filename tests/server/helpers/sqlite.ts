import knexFactory, { type Knex } from 'knex';
import type { DatabaseAdapter } from '../../../server/db/types';
import { withServerEnv } from './env';

/**
 * A real in-memory SQLite database rather than assertions on generated SQL.
 * The guards that matter here — the column allow-list that stands between a
 * query string and `whereRaw`, the per-page clamp, the secret-column strip —
 * are only meaningful if the query actually runs, and `better-sqlite3` is
 * already a driver this project supports.
 */
export interface Fixture {
  db: Knex;
  adapter: DatabaseAdapter;
  destroy: () => Promise<void>;
}

export interface SeedOptions {
  posts?: number;
  /** Extra env for the adapter module, e.g. `LIST_COUNT_CAP`. */
  env?: Record<string, string>;
}

const BASE_ENV = {
  DB_TABLES: '',
  DB_HIDDEN_TABLES: 'migrations',
  DB_SCHEMA: '',
  LIST_ESTIMATE_COUNT_ABOVE: '50000',
  LIST_COUNT_CAP: '50000',
  SEARCH_TEXT_CONFIG: 'english',
};

export async function createFixture({ posts = 5, env = {} }: SeedOptions = {}): Promise<Fixture> {
  const db = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });

  await db.schema.createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('slug');
    table.text('permissions');
  });

  await db.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name');
    table.string('email');
    table.string('password');
    table.integer('role_id').references('id').inTable('roles');
    table.boolean('is_active');
  });

  await db.schema.createTable('posts', (table) => {
    table.increments('id').primary();
    table.string('title');
    table.text('body');
    table.string('status');
    table.integer('views');
    table.boolean('featured');
    table.datetime('created_at');
    table.integer('author_id').references('id').inTable('users');
  });

  await db('roles').insert([
    { id: 1, slug: 'admin', permissions: '["*"]' },
    { id: 2, slug: 'editor', permissions: '["post.view"]' },
  ]);

  await db('users').insert([
    { id: 1, name: 'Ada', email: 'ada@example.com', password: 'hunter2', role_id: 1, is_active: 1 },
    {
      id: 2,
      name: 'Grace',
      email: 'grace@example.com',
      password: 'hopper',
      role_id: 2,
      is_active: 0,
    },
  ]);

  await db('posts').insert(
    Array.from({ length: posts }, (_unused, index) => ({
      id: index + 1,
      title: `Post ${index + 1}`,
      body: index % 2 === 0 ? 'Alpha body' : 'Beta body',
      status: index % 2 === 0 ? 'published' : 'draft',
      views: (index + 1) * 10,
      featured: index === 0 ? 1 : 0,
      created_at: `2026-08-${String(index + 1).padStart(2, '0')} 12:00:00`,
      author_id: (index % 2) + 1,
    })),
  );

  const { createSqlAdapter } = await withServerEnv(
    { ...BASE_ENV, ...env },
    () => import('../../../server/db/sqlAdapter'),
  );

  return {
    db,
    adapter: await createSqlAdapter(db, 'sqlite'),
    destroy: () => db.destroy(),
  };
}
