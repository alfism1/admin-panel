import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ListParams, Row } from '../../server/db/types';
import { createFixture, type Fixture } from './helpers/sqlite';

function listParams(overrides: Partial<ListParams> = {}): ListParams {
  return { page: 1, perPage: 25, filters: {}, ...overrides };
}

let fixture: Fixture;

afterEach(async () => {
  await fixture?.destroy();
});

describe('introspection', () => {
  beforeEach(async () => {
    fixture = await createFixture();
  });

  it('exposes every table it found, sorted', () => {
    expect(fixture.adapter.resources().map((schema) => schema.name)).toEqual([
      'posts',
      'roles',
      'users',
    ]);
  });

  it('detects the primary key', () => {
    expect(fixture.adapter.schema('posts').primaryKey).toBe('id');
  });

  it('classifies column kinds from the declared types', () => {
    const columns = new Map(
      fixture.adapter.schema('posts').columns.map((column) => [column.name, column.kind]),
    );

    expect(columns.get('title')).toBe('string');
    expect(columns.get('views')).toBe('number');
    expect(columns.get('featured')).toBe('boolean');
    expect(columns.get('created_at')).toBe('date');
  });

  it('treats text columns other than the key as searchable', () => {
    const { searchable } = fixture.adapter.schema('posts');
    expect(searchable).toEqual(expect.arrayContaining(['title', 'body', 'status']));
    expect(searchable).not.toContain('id');
    expect(searchable).not.toContain('views');
  });

  it('reads relations from declared foreign keys', () => {
    expect(fixture.adapter.schema('posts').relations).toEqual([
      { column: 'author_id', target: 'users', as: 'author' },
    ]);
    expect(fixture.adapter.schema('users').relations).toEqual([
      { column: 'role_id', target: 'roles', as: 'role' },
    ]);
  });

  it('answers has() for tables it knows and does not', () => {
    expect(fixture.adapter.has('posts')).toBe(true);
    expect(fixture.adapter.has('nope')).toBe(false);
  });

  it('answers 404 for an unknown resource rather than building a query', async () => {
    expect(() => fixture.adapter.schema('nope')).toThrow();
    await expect(fixture.adapter.list('nope', listParams())).rejects.toMatchObject({ status: 404 });
    await expect(fixture.adapter.find('nope', '1')).rejects.toMatchObject({ status: 404 });
  });

  it('reports the dialect it was built for', () => {
    expect(fixture.adapter.dialect).toBe('sqlite');
  });
});

describe('hiding tables', () => {
  it('honours an explicit allow-list', async () => {
    fixture = await createFixture({ env: { DB_TABLES: 'posts' } });
    expect(fixture.adapter.resources().map((schema) => schema.name)).toEqual(['posts']);
  });

  it('honours a deny-list', async () => {
    fixture = await createFixture({ env: { DB_HIDDEN_TABLES: 'users,roles' } });
    expect(fixture.adapter.resources().map((schema) => schema.name)).toEqual(['posts']);
  });

  it('never exposes the migration bookkeeping tables', async () => {
    // Whatever DB_HIDDEN_TABLES was set to.
    fixture = await createFixture({ env: { DB_HIDDEN_TABLES: 'nothing' } });
    await fixture.db.schema.createTable('knex_migrations', (table) => table.increments('id'));

    const rebuilt = await createFixture({ env: { DB_HIDDEN_TABLES: 'nothing' } });
    expect(rebuilt.adapter.resources().map((schema) => schema.name)).not.toContain(
      'knex_migrations',
    );
    await rebuilt.destroy();
  });
});

describe('secret columns', () => {
  beforeEach(async () => {
    fixture = await createFixture();
  });

  it('are stripped from a list', async () => {
    const { rows } = await fixture.adapter.list('users', listParams());
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).not.toHaveProperty('password');
  });

  it('are stripped from a single record', async () => {
    const row = await fixture.adapter.find('users', '1');
    expect(row).toMatchObject({ name: 'Ada' });
    expect(row).not.toHaveProperty('password');
  });

  it('are still readable through findBy, which authentication needs', async () => {
    // The one deliberate exception: `auth.login` has to compare the hash.
    const row = await fixture.adapter.findBy('users', 'email', 'ada@example.com');
    expect(row).toMatchObject({ password: 'hunter2' });
  });

  it('are stripped from a newly created record', async () => {
    const created = await fixture.adapter.insert('users', {
      name: 'Alan',
      email: 'alan@example.com',
      password: 'enigma',
    });
    expect(created).not.toHaveProperty('password');
  });
});

describe('pagination', () => {
  beforeEach(async () => {
    fixture = await createFixture({ posts: 60 });
  });

  it('returns the requested page', async () => {
    const { rows, total } = await fixture.adapter.list(
      'posts',
      listParams({ page: 2, perPage: 10, sort: { column: 'id', direction: 'asc' } }),
    );

    expect(total).toBe(60);
    expect(rows.map((row) => row.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('clamps per_page to the maximum', async () => {
    // Otherwise `?per_page=1000000` is a way to ask for the whole table.
    const { rows } = await fixture.adapter.list('posts', listParams({ perPage: 100_000 }));
    expect(rows.length).toBeLessThanOrEqual(200);
  });

  it('clamps a per_page below one', async () => {
    const { rows } = await fixture.adapter.list('posts', listParams({ perPage: 0 }));
    expect(rows).toHaveLength(1);
  });

  it('clamps a page below one', async () => {
    const { rows } = await fixture.adapter.list(
      'posts',
      listParams({ page: -5, perPage: 10, sort: { column: 'id', direction: 'asc' } }),
    );
    expect(rows[0].id).toBe(1);
  });

  it('returns nothing past the last page without running the page query', async () => {
    const { rows, total } = await fixture.adapter.list('posts', listParams({ page: 99 }));
    expect(rows).toEqual([]);
    expect(total).toBe(60);
  });
});

describe('sorting', () => {
  beforeEach(async () => {
    fixture = await createFixture({ posts: 5 });
  });

  it('sorts ascending and descending on a real column', async () => {
    const ascending = await fixture.adapter.list(
      'posts',
      listParams({ sort: { column: 'views', direction: 'asc' } }),
    );
    expect(ascending.rows.map((row) => row.views)).toEqual([10, 20, 30, 40, 50]);

    const descending = await fixture.adapter.list(
      'posts',
      listParams({ sort: { column: 'views', direction: 'desc' } }),
    );
    expect(descending.rows.map((row) => row.views)).toEqual([50, 40, 30, 20, 10]);
  });

  it('ignores a sort column that is not in the schema', async () => {
    // The allow-list is the whole defence: the column name is interpolated
    // into `order by`, so anything unrecognised must fall back, not pass
    // through.
    const { rows } = await fixture.adapter.list(
      'posts',
      listParams({ sort: { column: 'id; drop table posts', direction: 'asc' } }),
    );

    // Fell back to the primary key, descending.
    expect(rows.map((row) => row.id)).toEqual([5, 4, 3, 2, 1]);
    await expect(fixture.db('posts').count({ total: '*' })).resolves.toEqual([{ total: 5 }]);
  });

  it('defaults to the primary key descending', async () => {
    const { rows } = await fixture.adapter.list('posts', listParams());
    expect(rows.map((row) => row.id)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('filters', () => {
  beforeEach(async () => {
    fixture = await createFixture({ posts: 6 });
  });

  it('matches an exact value', async () => {
    const { rows, total } = await fixture.adapter.list(
      'posts',
      listParams({ filters: { status: 'published' } }),
    );
    expect(total).toBe(3);
    expect(rows.every((row) => row.status === 'published')).toBe(true);
  });

  it('drops a filter on a column that does not exist', async () => {
    // A stray `?filter[whatever]=x` must not reach the query builder.
    const { total } = await fixture.adapter.list(
      'posts',
      listParams({ filters: { 'nope; drop table posts': 'x' } }),
    );
    expect(total).toBe(6);
    await expect(fixture.db('posts').count({ total: '*' })).resolves.toEqual([{ total: 6 }]);
  });

  it('ignores an empty value rather than matching the empty string', async () => {
    const { total } = await fixture.adapter.list('posts', listParams({ filters: { status: '' } }));
    expect(total).toBe(6);
  });

  it('treats a comma-separated value as a set', async () => {
    const { total } = await fixture.adapter.list(
      'posts',
      listParams({ filters: { status: 'published,draft' } }),
    );
    expect(total).toBe(6);
  });

  it('coerces to the column kind before binding', async () => {
    // `featured` is stored as 0/1; the string "true" has to become a boolean or
    // SQLite compares it as text and matches nothing.
    const { total } = await fixture.adapter.list(
      'posts',
      listParams({ filters: { featured: 'true' } }),
    );
    expect(total).toBe(1);
  });

  it('coerces a numeric column', async () => {
    const { rows } = await fixture.adapter.list('posts', listParams({ filters: { views: '30' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].views).toBe(30);
  });

  it('reads a .. value as an inclusive range', async () => {
    const { rows } = await fixture.adapter.list(
      'posts',
      listParams({ filters: { created_at: '2026-08-02..2026-08-04' } }),
    );
    expect(rows.map((row) => row.id).sort()).toEqual([2, 3, 4]);
  });

  it('reads an open-ended range', async () => {
    const from = await fixture.adapter.list(
      'posts',
      listParams({ filters: { created_at: '2026-08-05..' } }),
    );
    expect(from.rows.map((row) => row.id).sort()).toEqual([5, 6]);

    const to = await fixture.adapter.list(
      'posts',
      listParams({ filters: { created_at: '..2026-08-02' } }),
    );
    expect(to.rows.map((row) => row.id).sort()).toEqual([1, 2]);
  });

  it('combines filters conjunctively', async () => {
    const { total } = await fixture.adapter.list(
      'posts',
      listParams({ filters: { status: 'published', featured: 'true' } }),
    );
    expect(total).toBe(1);
  });
});

describe('search', () => {
  beforeEach(async () => {
    fixture = await createFixture({ posts: 6 });
  });

  it('matches across every searchable column', async () => {
    const { total } = await fixture.adapter.list('posts', listParams({ search: 'alpha' }));
    expect(total).toBe(3);
  });

  it('is case-insensitive', async () => {
    const { total } = await fixture.adapter.list('posts', listParams({ search: 'ALPHA' }));
    expect(total).toBe(3);
  });

  it('matches a substring', async () => {
    const { total } = await fixture.adapter.list('posts', listParams({ search: 'ost 1' }));
    expect(total).toBe(1);
  });

  it('binds the term rather than interpolating it', async () => {
    // A quote in the needle is a value, not syntax.
    const { total } = await fixture.adapter.list('posts', listParams({ search: "' or 1=1 --" }));
    expect(total).toBe(0);
  });

  it('narrows alongside a filter', async () => {
    const { total } = await fixture.adapter.list(
      'posts',
      listParams({ search: 'alpha', filters: { featured: 'true' } }),
    );
    expect(total).toBe(1);
  });
});

describe('embedded relations', () => {
  beforeEach(async () => {
    fixture = await createFixture({ posts: 4 });
  });

  it('attaches the related record under its bare name', async () => {
    const { rows } = await fixture.adapter.list(
      'posts',
      listParams({ sort: { column: 'id', direction: 'asc' } }),
    );
    expect(rows[0]).toMatchObject({ id: 1, author_id: 1 });
    expect(rows[0].author).toMatchObject({ id: 1, name: 'Ada' });
    expect(rows[1].author).toMatchObject({ id: 2, name: 'Grace' });
  });

  it('selects only display columns, never a secret', async () => {
    const { rows } = await fixture.adapter.list(
      'users',
      listParams({ sort: { column: 'id', direction: 'asc' } }),
    );
    const role = rows[0].role as Row;

    expect(role).toMatchObject({ slug: 'admin' });
    // `permissions` is not a display column, so it never leaves the server as
    // part of an embed — a role's grants are not the caller's business.
    expect(role).not.toHaveProperty('permissions');
  });

  it('attaches null when the foreign key is not set but its neighbours are', async () => {
    await fixture.db('posts').where('id', 1).update({ author_id: null });

    const { rows } = await fixture.adapter.list(
      'posts',
      listParams({ sort: { column: 'id', direction: 'asc' } }),
    );
    expect(rows[0].author).toBeNull();
  });

  it('KNOWN BUG: omits the key entirely when no row in the batch has the relation', async () => {
    // `embedRelations` collects the ids first and `continue`s when there are
    // none, so the `as` key is never assigned — while the very same record
    // returns `author: null` on a page where some *other* row has an author.
    // The client therefore sees `undefined` or `null` for one record depending
    // on its neighbours, which is not something a caller can code against.
    // Fix: drop the `ids.length === 0` early return (or seed every row with
    // null before the lookup) so the key is always present, then change both
    // assertions below to `toBeNull()`.
    await fixture.db('posts').update({ author_id: null });

    const single = await fixture.adapter.find('posts', '1');
    expect(single).not.toHaveProperty('author');

    const { rows } = await fixture.adapter.list('posts', listParams());
    expect(rows[0]).not.toHaveProperty('author');
  });

  it('attaches null when the foreign key points at a row that is gone', async () => {
    // An orphaned key is normal in a schema that never declared constraints,
    // which is the case this adapter has to survive.
    await fixture.db.raw('pragma foreign_keys = OFF');
    await fixture.db('posts').where('id', 1).update({ author_id: 999 });

    const row = await fixture.adapter.find('posts', '1');
    expect(row?.author).toBeNull();
  });

  it('embeds on a single record too', async () => {
    const row = await fixture.adapter.find('posts', '2');
    expect(row?.author).toMatchObject({ name: 'Grace' });
  });

  it('runs one query per relation rather than one per row', async () => {
    const queries: string[] = [];
    fixture.db.on('query', (query: { sql: string }) => queries.push(query.sql));

    await fixture.adapter.list('posts', listParams());

    // count + page + one for the author relation.
    expect(queries.filter((sql) => /from ["`]users["`]/i.test(sql))).toHaveLength(1);
  });
});

describe('cursor pagination', () => {
  beforeEach(async () => {
    fixture = await createFixture({ posts: 12 });
  });

  it('offers a cursor while there is another page', async () => {
    const first = await fixture.adapter.list('posts', listParams({ perPage: 5 }));
    expect(first.nextCursor).toBeTypeOf('string');
  });

  it('offers none on the last page', async () => {
    const last = await fixture.adapter.list('posts', listParams({ perPage: 20 }));
    expect(last.nextCursor).toBeUndefined();
  });

  it('walks the whole table without repeating or skipping a row', async () => {
    const seen: unknown[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 5; page += 1) {
      const result = await fixture.adapter.list(
        'posts',
        listParams({ perPage: 5, ...(cursor ? { cursor } : {}) }),
      );
      seen.push(...result.rows.map((row) => row.id));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  it('keeps working when the sort column has ties', async () => {
    // A non-unique sort column would otherwise let a row appear on two pages,
    // which is why the primary key is appended as a tiebreaker.
    await fixture.db('posts').update({ status: 'draft' });

    const seen: unknown[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 5; page += 1) {
      const result = await fixture.adapter.list(
        'posts',
        listParams({
          perPage: 5,
          sort: { column: 'status', direction: 'asc' },
          ...(cursor ? { cursor } : {}),
        }),
      );
      seen.push(...result.rows.map((row) => row.id));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    expect(new Set(seen).size).toBe(12);
  });

  it('ignores a cursor it did not issue rather than failing the request', async () => {
    // A cursor is a position, not a credential: the worst an unreadable one
    // should do is start again from the top.
    for (const cursor of ['garbage', '', Buffer.from('{"key":null}').toString('base64url')]) {
      const { rows } = await fixture.adapter.list('posts', listParams({ perPage: 5, cursor }));
      expect(rows).toHaveLength(5);
    }
  });
});

describe('writes', () => {
  beforeEach(async () => {
    fixture = await createFixture({ posts: 3 });
  });

  it('inserts and returns the created row', async () => {
    const created = await fixture.adapter.insert('posts', { title: 'New', status: 'draft' });
    expect(created).toMatchObject({ title: 'New', status: 'draft' });
    expect(created.id).toBeDefined();
  });

  it('drops keys that are not columns', async () => {
    // A stray field from a form must not reach the driver as a column.
    const created = await fixture.adapter.insert('posts', {
      title: 'New',
      not_a_column: 'boom',
    });
    expect(created).not.toHaveProperty('not_a_column');
  });

  it('refuses to let a write set the primary key', async () => {
    const created = await fixture.adapter.insert('posts', { id: 999, title: 'New' });
    expect(created.id).not.toBe(999);
  });

  it('updates only the columns given', async () => {
    const updated = await fixture.adapter.update('posts', '1', { title: 'Renamed' });
    expect(updated).toMatchObject({ id: 1, title: 'Renamed', status: 'published' });
  });

  it('encodes an object into a text column', async () => {
    const created = await fixture.adapter.insert('posts', {
      title: 'New',
      body: { blocks: ['a', 'b'] },
    });
    expect(created.body).toBe('{"blocks":["a","b"]}');
  });

  it('deletes a row', async () => {
    await fixture.adapter.remove('posts', '1');
    expect(await fixture.adapter.find('posts', '1')).toBeNull();
  });

  it('deletes many and reports how many went', async () => {
    expect(await fixture.adapter.removeMany('posts', ['1', '2'])).toBe(2);
    expect((await fixture.adapter.list('posts', listParams())).total).toBe(1);
  });

  it('counts, with and without a predicate', async () => {
    expect(await fixture.adapter.count('posts')).toBe(3);
    expect(await fixture.adapter.count('posts', { status: 'published' })).toBe(2);
  });

  it('returns null from findBy for a column that does not exist', async () => {
    expect(await fixture.adapter.findBy('users', 'nope', 'x')).toBeNull();
  });

  it('returns null from find for a row that does not exist', async () => {
    expect(await fixture.adapter.find('posts', '999')).toBeNull();
  });
});

describe('capped counting', () => {
  it('reports at most the cap, and flags the total as approximate', async () => {
    // Counting every match of a broad term was a full scan; nothing past the
    // first page or two is information anyone acts on.
    fixture = await createFixture({ posts: 30, env: { LIST_COUNT_CAP: '10' } });

    const { total, approximate } = await fixture.adapter.list(
      'posts',
      listParams({ perPage: 5, filters: { status: 'published' } }),
    );

    expect(total).toBe(10);
    expect(approximate).toBe(true);
  });

  it('stays exact when the matches fit inside the cap', async () => {
    fixture = await createFixture({ posts: 30, env: { LIST_COUNT_CAP: '100' } });

    const { total, approximate } = await fixture.adapter.list(
      'posts',
      listParams({ filters: { status: 'published' } }),
    );

    expect(total).toBe(15);
    expect(approximate).toBeUndefined();
  });

  it('never reports a total smaller than what it has handed out', async () => {
    fixture = await createFixture({ posts: 30, env: { LIST_COUNT_CAP: '2' } });

    const { rows, total } = await fixture.adapter.list(
      'posts',
      listParams({ page: 2, perPage: 10, filters: { status: 'published' } }),
    );

    expect(total).toBeGreaterThanOrEqual(10 + rows.length);
  });

  it('counts exactly when nothing was narrowed', async () => {
    // An unfiltered count is "how big is this table", and on SQLite there is no
    // cheap estimate to substitute, so it stays exact.
    fixture = await createFixture({ posts: 30, env: { LIST_COUNT_CAP: '2' } });

    const { total, approximate } = await fixture.adapter.list('posts', listParams());
    expect(total).toBe(30);
    expect(approximate).toBeUndefined();
  });
});
