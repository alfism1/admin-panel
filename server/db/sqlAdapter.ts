import type { Knex } from 'knex';
import { env } from '../env';
import { DISPLAY_COLUMNS, isSecretColumn } from '../naming';
import type { Dialect } from './connect';
import { introspect } from './introspect';
import {
  HttpError,
  type ColumnKind,
  type DatabaseAdapter,
  type ListParams,
  type ResourceSchema,
  type Row,
} from './types';

const MAX_PER_PAGE = 200;

/**
 * How far past the estimated end a page may sit before we stop bothering to
 * run the query. Estimates drift between ANALYZEs, so this is deliberately
 * generous — the guard exists to kill absurd offsets, not to trim the tail.
 */
const ESTIMATE_SLACK = 1.25;

/**
 * Unbounded text cast for the search predicate. A cast is needed because a
 * `string` column can be a uuid, which `lower()` refuses — but it must not be
 * length-bounded: `char(255)` truncates longer columns out of the match, and on
 * PostgreSQL blank-pads every value to 255 chars, which cost 5x on a 5M-row scan.
 */
const TEXT_CAST: Record<Dialect, string> = {
  postgres: 'text',
  sqlite: 'text',
  mysql: 'char',
  mssql: 'varchar(max)',
  mongodb: 'text',
};

/**
 * Strips what must never leave the server (secrets) and what is meaningless
 * outside it (the search vector — an index, and a large one, that `select *`
 * would otherwise put on the wire for every row).
 */
function sanitize(schema: ResourceSchema, row: Row): Row {
  const output: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (isSecretColumn(key) || key === schema.searchVector) continue;
    output[key] = value;
  }
  return output;
}

/** Values that knex accepts as bindings. */
type DbValue = string | number | boolean;

interface Cursor {
  /** Value of the sort column on the last row handed out. */
  sort: string | number | boolean | null;
  /** Primary key of that row, breaking ties on a non-unique sort column. */
  key: string | number;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Returns null for anything that is not a cursor this server issued. */
function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (parsed.key === undefined || parsed.key === null) return null;
    if (typeof parsed.key !== 'string' && typeof parsed.key !== 'number') return null;
    return { sort: parsed.sort ?? null, key: parsed.key };
  } catch {
    return null;
  }
}

/** Coerces a query-string value to the column's real type before it hits SQL. */
function coerce(schema: ResourceSchema, column: string, value: string): DbValue {
  const kind = schema.columns.find((item) => item.name === column)?.kind;
  if (kind === 'boolean') return value === 'true' || value === '1';
  if (kind === 'number') return Number(value);
  return value;
}

/**
 * Row count from table statistics rather than a scan.
 *
 * `count(*)` on a large table is a full index walk — 81 ms on 5M rows, paid by
 * every list request whether or not anything was filtered, which caps list
 * throughput no matter how much concurrency is thrown at it. The planner
 * already keeps an approximation for its own use; reading that is O(1).
 *
 * Returns null when there is no usable estimate, and the caller falls back to
 * an exact count.
 */
async function estimateRows(db: Knex, dialect: Dialect, table: string): Promise<number | null> {
  try {
    if (dialect === 'postgres') {
      const result = (await db.raw(
        'select reltuples::bigint as estimate from pg_class where oid = to_regclass(?)',
        [table],
      )) as {
        rows: Array<{ estimate: string | number | null }>;
      };
      const value = Number(result.rows[0]?.estimate ?? -1);
      // -1 means the table has never been analysed, so there is nothing to read.
      return value >= 0 ? value : null;
    }

    if (dialect === 'mysql') {
      const result = (await db.raw(
        'select table_rows as estimate from information_schema.tables where table_schema = database() and table_name = ?',
        [table],
      )) as Array<Array<{ estimate: string | number | null }>>;
      const value = Number(result[0]?.[0]?.estimate ?? -1);
      return value >= 0 ? value : null;
    }
  } catch {
    // Statistics views are permission-gated on some managed databases.
    return null;
  }

  // SQLite and SQL Server have no equally cheap read; exact counts stay.
  return null;
}

export async function createSqlAdapter(db: Knex, dialect: Dialect): Promise<DatabaseAdapter> {
  const schemas = await introspect(db, dialect);
  const byName = new Map(schemas.map((schema) => [schema.name, schema]));

  const schemaOf = (resource: string): ResourceSchema => {
    const schema = byName.get(resource);
    if (!schema) throw new HttpError(404, `Unknown resource "${resource}".`);
    return schema;
  };

  const hasColumn = (schema: ResourceSchema, column: string) =>
    schema.columns.some((item) => item.name === column);

  /** Only introspected column names ever reach a query — never raw input. */
  const applyFilters = (
    query: Knex.QueryBuilder,
    schema: ResourceSchema,
    params: ListParams,
  ): void => {
    for (const [column, raw] of Object.entries(params.filters)) {
      if (!hasColumn(schema, column) || raw === '') continue;

      if (raw.includes('..')) {
        const [from, to] = raw.split('..');
        if (from) query.where(column, '>=', from);
        if (to) query.where(column, '<=', `${to} 23:59:59`);
        continue;
      }

      const values = raw.split(',').filter(Boolean);
      if (values.length > 1) {
        query.whereIn(column, values.map((value) => coerce(schema, column, value)) as DbValue[]);
      } else if (values.length === 1) {
        query.where(column, coerce(schema, column, values[0]));
      }
    }

    if (!params.search) return;

    // A GIN-indexed tsvector turns the whole predicate into one index lookup,
    // where the `LIKE` chain below has to be evaluated per row per column.
    // `websearch_to_tsquery` is the forgiving parser: it never raises on user
    // input, which `to_tsquery` does on so much as a stray operator.
    if (schema.searchVector && dialect === 'postgres') {
      query.whereRaw(`?? @@ websearch_to_tsquery(?, ?)`, [
        schema.searchVector,
        env.search.textConfig,
        params.search,
      ]);
      return;
    }

    if (schema.searchable.length > 0) {
      const needle = `%${params.search.toLowerCase()}%`;
      const cast = TEXT_CAST[dialect];
      query.where((builder) => {
        for (const column of schema.searchable) {
          builder.orWhereRaw(`lower(cast(?? as ${cast})) like ?`, [column, needle]);
        }
      });
    }
  };

  /** One extra query per relation per page — never N+1. */
  const embedRelations = async (schema: ResourceSchema, rows: Row[]): Promise<Row[]> => {
    if (rows.length === 0 || schema.relations.length === 0) return rows;

    for (const relation of schema.relations) {
      const target = byName.get(relation.target);
      if (!target) continue;

      const ids = [
        ...new Set(rows.map((row) => row[relation.column]).filter((id) => id != null)),
      ] as DbValue[];
      if (ids.length === 0) continue;

      const display = DISPLAY_COLUMNS.filter((column) => hasColumn(target, column));
      const select = [target.primaryKey, ...display];

      const related = (await db(target.name)
        .whereIn(target.primaryKey, ids)
        .select(select)) as Row[];
      const lookup = new Map(related.map((item) => [String(item[target.primaryKey]), item]));

      for (const row of rows) {
        row[relation.as] = lookup.get(String(row[relation.column])) ?? null;
      }
    }

    return rows;
  };

  const findRow = async (schema: ResourceSchema, id: string): Promise<Row> => {
    const row = (await db(schema.name).where(schema.primaryKey, id).first()) as Row | undefined;
    if (!row) throw new HttpError(404, 'Record not found.');
    return row;
  };

  /**
   * SQLite and SQL Server have no JSON type, so a migration declares those
   * columns as `text` and introspection classifies them as `string` — the
   * declared kind alone would let an array reach the driver, which can only
   * bind primitives. Encoding on shape as well keeps every dialect working.
   */
  const encode = (kind: ColumnKind | undefined, value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (kind === 'json') return JSON.stringify(value);
    if (typeof value !== 'object') return value;
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    return JSON.stringify(value);
  };

  /** Drops keys that are not real columns so a stray field cannot break the query. */
  const writable = (schema: ResourceSchema, data: Row): Row => {
    const output: Row = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === schema.primaryKey) continue;
      if (!hasColumn(schema, key)) continue;
      const kind = schema.columns.find((column) => column.name === key)?.kind;
      output[key] = encode(kind, value);
    }
    return output;
  };

  return {
    dialect,
    resources: () => schemas,
    schema: schemaOf,
    has: (resource) => byName.has(resource),

    async list(resource, params) {
      const schema = schemaOf(resource);
      const perPage = Math.min(Math.max(1, params.perPage), MAX_PER_PAGE);
      const page = Math.max(1, params.page);
      const offset = (page - 1) * perPage;

      const sortColumn =
        params.sort && hasColumn(schema, params.sort.column)
          ? params.sort.column
          : schema.primaryKey;
      const sortDirection =
        params.sort && hasColumn(schema, params.sort.column) ? params.sort.direction : 'desc';

      // An unreadable cursor is ignored rather than rejected: it is a position
      // hint, and the worst case of dropping it is starting from the top.
      const cursor = params.cursor ? decodeCursor(params.cursor) : null;

      // Late row lookup: page over the primary key alone, then fetch the wide
      // rows for the ids that survive. A plain `select * ... offset N` makes the
      // planner heap-fetch every skipped row before discarding it; keeping the
      // inner scan index-only took offset 2.5M from 19.5 s to 1.2 s.
      /**
       * `fenced` materialises the matches before sorting them.
       *
       * With a plain `order by id desc limit 25` the planner walks the primary
       * key backwards hoping to fill the page early. For a term matching 50 of
       * 5M rows it reads most of the heap instead — 8 s. Bounding the inner
       * query first forces the index path and takes that to 3 ms. It is only
       * correct once the match count is known to fit inside the bound, and only
       * a win when it is small: for a term matching millions the same shape
       * costs 4.9 s where the plain one costs 1 ms.
       */
      const fetchPage = async (fenced: boolean): Promise<Row[]> => {
        let keys = db(schema.name);
        applyFilters(keys, schema, params);
        // The outer query sorts on `sortColumn`, so the fenced inner one has to
        // carry it through as well as the key it is joined back on.
        const inner =
          sortColumn === schema.primaryKey ? [schema.primaryKey] : [schema.primaryKey, sortColumn];
        keys.select(fenced || cursor ? inner : [schema.primaryKey]);

        if (cursor) {
          /**
           * Seek instead of skip. `offset N` makes the database walk and throw
           * away N rows; this asks for "the rows after that one", which an index
           * on (sort, key) answers by descending straight to the right place.
           *
           * Written out rather than as a row-value comparison `(a,b) < (x,y)`,
           * which SQL Server does not support.
           */
          const op = sortDirection === 'desc' ? '<' : '>';
          keys.where((builder) => {
            if (sortColumn === schema.primaryKey) {
              void builder.where(schema.primaryKey, op, cursor.key as DbValue);
              return;
            }
            void builder
              .where(sortColumn, op, cursor.sort as DbValue)
              .orWhere((tie) =>
                tie
                  .where(sortColumn, cursor.sort as DbValue)
                  .andWhere(schema.primaryKey, op, cursor.key as DbValue),
              );
          });
        }

        if (fenced) {
          keys.limit(env.list.countCap + 1);
          keys = db.select(inner).from(keys.as('matches'));
        }

        keys.orderBy(sortColumn, sortDirection);
        // Ties on a non-unique sort column would otherwise let a row appear on
        // two pages or none, which matters far more when seeking than skipping.
        if (sortColumn !== schema.primaryKey) keys.orderBy(schema.primaryKey, sortDirection);
        keys.limit(perPage).offset(cursor ? 0 : offset);

        const page = db(schema.name)
          .join(
            keys.as('page_keys'),
            `page_keys.${schema.primaryKey}`,
            `${schema.name}.${schema.primaryKey}`,
          )
          .orderBy(`${schema.name}.${sortColumn}`, sortDirection);

        if (sortColumn !== schema.primaryKey) {
          page.orderBy(`${schema.name}.${schema.primaryKey}`, sortDirection);
        }

        return (await page.select(`${schema.name}.*`)) as Row[];
      };

      /**
       * Counts matches, giving up once `cap` of them are known to exist.
       *
       * `exact: false` means "at least cap" — the scan stopped early. Counting
       * a broad filter to the last row was a full table scan (5.5 s for a term
       * matching 1M rows) to produce a number no one reads past the first page.
       */
      const cappedCount = async (cap: number): Promise<{ total: number; exact: boolean }> => {
        const matches = db(schema.name).select(db.raw('1'));
        applyFilters(matches, schema, params);

        if (cap <= 0) {
          const [{ total }] = (await matches.clone().clearSelect().count({ total: '*' })) as Array<{
            total: number | string;
          }>;
          return { total: Number(total), exact: true };
        }

        matches.limit(cap + 1);
        const [{ total }] = (await db.count({ total: '*' }).from(matches.as('capped'))) as Array<{
          total: number | string;
        }>;

        const value = Number(total);
        return value > cap ? { total: cap, exact: false } : { total: value, exact: true };
      };

      const narrowed = Object.keys(params.filters).length > 0 || Boolean(params.search);
      const threshold = env.list.estimateCountAbove;

      // A filtered count has to be exact — it is the answer to a question the
      // user asked. An unfiltered one is just "how big is this table", which is
      // what statistics are for.
      /** Marker for the last row of this page, or nothing if the page is short. */
      const nextCursorFor = (rows: Row[]): { nextCursor?: string } => {
        if (rows.length < perPage) return {};
        const last = rows[rows.length - 1];
        const key = last[schema.primaryKey];
        if (key === null || key === undefined) return {};
        return {
          nextCursor: encodeCursor({
            sort: (last[sortColumn] ?? null) as Cursor['sort'],
            key: key as Cursor['key'],
          }),
        };
      };

      if (!narrowed && threshold > 0) {
        const estimate = await estimateRows(db, dialect, schema.name);

        if (estimate !== null && estimate > threshold) {
          // Far enough past the end that no drift explains it: `?page=500003`
          // on 5M rows spent ~15 s walking the index to return nothing. A cursor
          // does not skip, so it is never in this position.
          if (!cursor && offset > estimate * ESTIMATE_SLACK + perPage) {
            return { rows: [], total: estimate };
          }

          const rows = await fetchPage(false);
          return {
            rows: (await embedRelations(schema, rows)).map((row) => sanitize(schema, row)),
            // Never report a total smaller than what has already been handed out.
            total: Math.max(estimate, offset + rows.length),
            approximate: true,
            ...nextCursorFor(rows),
          };
        }
      }

      // The count decides both whether the page query is worth running and
      // which shape it should take, so it goes first rather than concurrently.
      const { total, exact } = await cappedCount(narrowed ? env.list.countCap : 0);

      if (exact && !cursor) {
        const lastPage = Math.max(1, Math.ceil(total / perPage));
        if (page > lastPage) return { rows: [], total };
      }

      // Fencing is only safe once the matches are known to fit inside the cap,
      // and only pays off when there are few of them — which is exactly the
      // case an exact capped count identifies.
      const rows = await fetchPage(exact && narrowed && offset + perPage <= env.list.countCap);

      return {
        rows: (await embedRelations(schema, rows)).map((row) => sanitize(schema, row)),
        total: exact ? total : Math.max(total, offset + rows.length),
        ...(exact ? {} : { approximate: true }),
        ...nextCursorFor(rows),
      };
    },

    async find(resource, id) {
      const schema = schemaOf(resource);
      const row = (await db(schema.name).where(schema.primaryKey, id).first()) as Row | undefined;
      if (!row) return null;
      const [embedded] = await embedRelations(schema, [row]);
      return sanitize(schema, embedded);
    },

    async findBy(resource, column, value) {
      const schema = schemaOf(resource);
      if (!hasColumn(schema, column)) return null;
      const row = (await db(schema.name)
        .where(column, value as DbValue)
        .first()) as Row | undefined;
      return row ?? null;
    },

    async insert(resource, data) {
      const schema = schemaOf(resource);
      const payload = writable(schema, data);

      if (dialect === 'postgres' || dialect === 'mssql') {
        const [created] = (await db(schema.name).insert(payload).returning('*')) as Row[];
        const [embedded] = await embedRelations(schema, [created]);
        return sanitize(schema, embedded);
      }

      const [id] = await db(schema.name).insert(payload);
      const created = await findRow(schema, String(payload[schema.primaryKey] ?? id));
      const [embedded] = await embedRelations(schema, [created]);
      return sanitize(schema, embedded);
    },

    async update(resource, id, data) {
      const schema = schemaOf(resource);
      const payload = writable(schema, data);

      if (Object.keys(payload).length > 0) {
        const affected = await db(schema.name).where(schema.primaryKey, id).update(payload);
        if (affected === 0) throw new HttpError(404, 'Record not found.');
      }

      const [embedded] = await embedRelations(schema, [await findRow(schema, id)]);
      return sanitize(schema, embedded);
    },

    async remove(resource, id) {
      const schema = schemaOf(resource);
      const affected = await db(schema.name).where(schema.primaryKey, id).del();
      if (affected === 0) throw new HttpError(404, 'Record not found.');
    },

    async removeMany(resource, ids) {
      const schema = schemaOf(resource);
      if (ids.length === 0) return 0;
      return db(schema.name).whereIn(schema.primaryKey, ids).del();
    },

    async count(resource, where) {
      const schema = schemaOf(resource);
      const query = db(schema.name);
      if (where) query.where(where);
      const [{ total }] = (await query.count({ total: '*' })) as Array<{ total: number | string }>;
      return Number(total);
    },

    close: () => db.destroy(),
  };
}
