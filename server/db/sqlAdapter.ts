import type { Knex } from 'knex';
import { DISPLAY_COLUMNS, isSecretColumn } from '../naming';
import type { Dialect } from './connect';
import { introspect } from './introspect';
import {
  HttpError,
  type DatabaseAdapter,
  type ListParams,
  type ResourceSchema,
  type Row,
} from './types';

const MAX_PER_PAGE = 200;

function sanitize(row: Row): Row {
  const output: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (!isSecretColumn(key)) output[key] = value;
  }
  return output;
}

/** Values that knex accepts as bindings. */
type DbValue = string | number | boolean;

/** Coerces a query-string value to the column's real type before it hits SQL. */
function coerce(schema: ResourceSchema, column: string, value: string): DbValue {
  const kind = schema.columns.find((item) => item.name === column)?.kind;
  if (kind === 'boolean') return value === 'true' || value === '1';
  if (kind === 'number') return Number(value);
  return value;
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

    if (params.search && schema.searchable.length > 0) {
      const needle = `%${params.search.toLowerCase()}%`;
      query.where((builder) => {
        for (const column of schema.searchable) {
          builder.orWhereRaw('lower(cast(?? as char(255))) like ?', [column, needle]);
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

  /** Drops keys that are not real columns so a stray field cannot break the query. */
  const writable = (schema: ResourceSchema, data: Row): Row => {
    const output: Row = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === schema.primaryKey) continue;
      if (!hasColumn(schema, key)) continue;
      const kind = schema.columns.find((column) => column.name === key)?.kind;
      output[key] = kind === 'json' && value !== null ? JSON.stringify(value) : value;
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

      const countQuery = db(schema.name);
      applyFilters(countQuery, schema, params);
      const [{ total }] = (await countQuery.count({ total: '*' })) as Array<{
        total: number | string;
      }>;

      const query = db(schema.name);
      applyFilters(query, schema, params);

      if (params.sort && hasColumn(schema, params.sort.column)) {
        query.orderBy(params.sort.column, params.sort.direction);
      } else {
        query.orderBy(schema.primaryKey, 'desc');
      }

      const rows = (await query
        .limit(perPage)
        .offset((page - 1) * perPage)
        .select('*')) as Row[];

      return {
        rows: (await embedRelations(schema, rows)).map(sanitize),
        total: Number(total),
      };
    },

    async find(resource, id) {
      const schema = schemaOf(resource);
      const row = (await db(schema.name).where(schema.primaryKey, id).first()) as Row | undefined;
      if (!row) return null;
      const [embedded] = await embedRelations(schema, [row]);
      return sanitize(embedded);
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
        return sanitize(embedded);
      }

      const [id] = await db(schema.name).insert(payload);
      const created = await findRow(schema, String(payload[schema.primaryKey] ?? id));
      const [embedded] = await embedRelations(schema, [created]);
      return sanitize(embedded);
    },

    async update(resource, id, data) {
      const schema = schemaOf(resource);
      const payload = writable(schema, data);

      if (Object.keys(payload).length > 0) {
        const affected = await db(schema.name).where(schema.primaryKey, id).update(payload);
        if (affected === 0) throw new HttpError(404, 'Record not found.');
      }

      const [embedded] = await embedRelations(schema, [await findRow(schema, id)]);
      return sanitize(embedded);
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
