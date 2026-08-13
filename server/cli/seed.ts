import bcrypt from 'bcryptjs';
import type { Knex } from 'knex';
import { createKnex, detectDialect } from '../db/connect';
import { env } from '../env';

/**
 * `pnpm db:seed` — creates the users / roles / posts tables the bundled example
 * resources expect, so a fresh database is usable immediately. Safe to re-run:
 * existing tables are left alone.
 */

const FIRST = [
  'Alya',
  'Bagus',
  'Citra',
  'Dimas',
  'Eka',
  'Fajar',
  'Gita',
  'Hendra',
  'Indah',
  'Joko',
];
const LAST = ['Pratama', 'Wijaya', 'Santoso', 'Halim', 'Nugroho', 'Kusuma', 'Saputra', 'Setiawan'];
const TITLES = [
  'Designing a resource-first admin panel',
  'Why declarative schemas beat hand-written forms',
  'Ten table patterns worth stealing',
  'A pragmatic guide to RBAC in the browser',
  'Shipping dark mode without regrets',
  'Keeping bundle size honest',
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function createTables(db: Knex, isJsonNative: boolean): Promise<void> {
  if (!(await db.schema.hasTable('roles'))) {
    await db.schema.createTable('roles', (table) => {
      table.increments('id').primary();
      table.string('name', 60).notNullable();
      table.string('slug', 60).notNullable().unique();
      table.string('description', 160).defaultTo('');
      if (isJsonNative) table.json('permissions');
      else table.text('permissions');
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('  + roles');
  }

  if (!(await db.schema.hasTable('users'))) {
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('name', 255).notNullable();
      table.string('email', 255).notNullable().unique();
      table.string('password', 255).notNullable();
      table.integer('role_id').references('id').inTable('roles');
      table.boolean('is_active').defaultTo(true);
      table.string('avatar', 500).nullable();
      table.text('bio').defaultTo('');
      table.timestamp('joined_at').nullable();
      table.integer('orders_count').defaultTo(0);
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('  + users');
  }

  if (!(await db.schema.hasTable('posts'))) {
    await db.schema.createTable('posts', (table) => {
      table.increments('id').primary();
      table.string('title', 180).notNullable();
      table.string('slug', 180).notNullable();
      table.string('excerpt', 200).defaultTo('');
      table.text('content').defaultTo('');
      table.string('status', 20).defaultTo('draft');
      table.boolean('is_featured').defaultTo(false);
      table.integer('author_id').references('id').inTable('users');
      table.string('category', 40).defaultTo('engineering');
      table.string('cover', 500).nullable();
      table.text('notes').defaultTo('');
      table.timestamp('published_at').nullable();
      table.integer('views').defaultTo(0);
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('  + posts');
  }
}

async function seedRows(db: Knex, isJsonNative: boolean): Promise<void> {
  const encode = (value: string[]) =>
    isJsonNative ? JSON.stringify(value) : JSON.stringify(value);

  if ((await db('roles').count({ total: '*' }).first())?.total == 0) {
    await db('roles').insert([
      { name: 'Admin', slug: 'admin', description: 'Full access.', permissions: encode(['*']) },
      {
        name: 'Editor',
        slug: 'editor',
        description: 'Manages content.',
        permissions: encode([
          'post.view',
          'post.create',
          'post.update',
          'post.delete',
          'post.publish',
          'user.view',
          'role.view',
        ]),
      },
      {
        name: 'Viewer',
        slug: 'viewer',
        description: 'Read-only.',
        permissions: encode(['user.view', 'post.view', 'role.view']),
      },
    ]);
    console.log('  · 3 roles');
  }

  if ((await db('users').count({ total: '*' }).first())?.total == 0) {
    const password = await bcrypt.hash('password', 10);
    // The three named accounts stay active — they are the documented logins.
    const users = [
      {
        name: 'Admin User',
        email: 'admin@example.com',
        role_id: 1,
        orders_count: 128,
        is_active: true,
      },
      {
        name: 'Rina Editor',
        email: 'editor@example.com',
        role_id: 2,
        orders_count: 41,
        is_active: true,
      },
      {
        name: 'Bima Viewer',
        email: 'viewer@example.com',
        role_id: 3,
        orders_count: 3,
        is_active: true,
      },
      ...Array.from({ length: 27 }, (_, index) => {
        const first = FIRST[index % FIRST.length];
        const last = LAST[(index * 3) % LAST.length];
        return {
          name: `${first} ${last}`,
          email: `${first.toLowerCase()}.${last.toLowerCase()}${index + 4}@example.com`,
          role_id: (index % 3) + 1,
          orders_count: (index * 13) % 97,
          is_active: index % 4 !== 0,
        };
      }),
    ].map((user, index) => ({
      ...user,
      password,
      bio: '',
      joined_at: daysAgo(index * 7 + 3),
      created_at: daysAgo(index * 7 + 3),
      updated_at: daysAgo(index % 30),
    }));

    await db('users').insert(users);
    console.log(`  · ${users.length} users (password: "password")`);
  }

  if ((await db('posts').count({ total: '*' }).first())?.total == 0) {
    const posts = Array.from({ length: 24 }, (_, index) => {
      const status = (['draft', 'scheduled', 'published', 'archived'] as const)[index % 4];
      return {
        title: `${TITLES[index % TITLES.length]}${index >= TITLES.length ? ` (part ${Math.floor(index / TITLES.length) + 1})` : ''}`,
        slug: `post-${index + 1}`,
        excerpt: 'A short summary that shows up in the table description slot.',
        content: 'Long form body content lives here.',
        status,
        is_featured: index % 5 === 0,
        author_id: (index % 12) + 1,
        category: (['engineering', 'product', 'design'] as const)[index % 3],
        published_at: status === 'published' ? daysAgo(index * 3) : null,
        views: (index * 371) % 5000,
        created_at: daysAgo(index * 3 + 1),
        updated_at: daysAgo(index),
      };
    });

    await db('posts').insert(posts);
    console.log(`  · ${posts.length} posts`);
  }
}

async function main(): Promise<void> {
  const url = env.databaseUrl;
  const dialect = detectDialect(url);

  if (dialect === 'mongodb') {
    throw new Error('Seeding is SQL-only. For MongoDB, import your own documents.');
  }

  const db = createKnex(url, dialect);
  const isJsonNative = dialect === 'postgres' || dialect === 'mysql';

  console.log(`\n  seeding ${dialect}`);
  await createTables(db, isJsonNative);
  await seedRows(db, isJsonNative);
  console.log('\n  ✓ done — start the API with: pnpm dev:api\n');

  await db.destroy();
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
