import type { Knex } from 'knex';

/**
 * The schema the bundled example resources expect: roles, users, posts.
 *
 * This is deliberately identical to the tables `pnpm db:seed` used to create on
 * the fly, so a database seeded before the migration runner existed can be
 * adopted with `pnpm db:migrate baseline` without the record being a lie.
 */

/** PostgreSQL and MySQL store JSON natively; SQLite and SQL Server take text. */
function supportsJsonColumns(knex: Knex): boolean {
  const dialect = (knex.client as { dialect?: string }).dialect ?? '';
  return dialect === 'postgresql' || dialect === 'mysql';
}

export async function up(knex: Knex): Promise<void> {
  const isJsonNative = supportsJsonColumns(knex);

  await knex.schema.createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('name', 60).notNullable();
    table.string('slug', 60).notNullable().unique();
    table.string('description', 160).defaultTo('');
    if (isJsonNative) table.json('permissions');
    else table.text('permissions');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('users', (table) => {
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
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('posts', (table) => {
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
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  // Reverse order: the foreign keys point backwards through this list.
  await knex.schema.dropTableIfExists('posts');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('roles');
}
