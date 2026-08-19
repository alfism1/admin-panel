import type { Knex } from 'knex';

/**
 * Storage for the two `Repeater` shapes the post form demonstrates.
 *
 * - `posts.faqs` — a JSON column. The array is the column value, so it rides
 *   the normal create/update payload and needs no server code at all.
 * - `post_blocks` — a child table. `Repeater.relationship()` fills and saves it
 *   through the data provider, and introspection turns it into a REST resource
 *   on its own, so again no route has to be written.
 */

/** PostgreSQL and MySQL store JSON natively; SQLite and SQL Server take text. */
function supportsJsonColumns(knex: Knex): boolean {
  const dialect = (knex.client as { dialect?: string }).dialect ?? '';
  return dialect === 'postgresql' || dialect === 'mysql';
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (table) => {
    if (supportsJsonColumns(knex)) table.json('faqs');
    else table.text('faqs');
  });

  await knex.schema.createTable('post_blocks', (table) => {
    table.increments('id').primary();
    table.integer('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    table.string('kind', 20).notNullable().defaultTo('paragraph');
    table.string('heading', 180).defaultTo('');
    table.text('body').defaultTo('');
    // Named `position` rather than `order`, which is reserved in every dialect.
    table.integer('position').notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // The repeater always reads `where post_id = ? order by position`.
    table.index(['post_id', 'position'], 'post_blocks_post_id_position_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_blocks');
  await knex.schema.alterTable('posts', (table) => {
    table.dropColumn('faqs');
  });
}
