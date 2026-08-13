import type { Collection, Db, Document, Filter, MongoClient } from 'mongodb';
import { env } from '../env';
import { DISPLAY_COLUMNS, isSecretColumn, pluralize } from '../naming';
import {
  HttpError,
  type ColumnKind,
  type DatabaseAdapter,
  type ResourceSchema,
  type Row,
} from './types';

const SAMPLE_SIZE = 50;
const MAX_PER_PAGE = 200;

function kindOf(value: unknown): ColumnKind {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value instanceof Date) return 'date';
  if (typeof value === 'string') return 'string';
  if (value && typeof value === 'object') return 'json';
  return 'unknown';
}

function sanitize(row: Document): Row {
  const output: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (isSecretColumn(key)) continue;
    output[key === '_id' ? 'id' : key] = key === '_id' ? String(value) : value;
  }
  return output;
}

async function toObjectId(value: string): Promise<unknown> {
  const { ObjectId } = await import('mongodb');
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

/** Mongo has no DDL, so the shape is inferred by sampling each collection. */
async function describeCollection(
  collection: Collection,
  names: Set<string>,
): Promise<ResourceSchema> {
  const samples = await collection.find({}).limit(SAMPLE_SIZE).toArray();
  const kinds = new Map<string, ColumnKind>();

  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample)) {
      if (value == null || kinds.has(key)) continue;
      kinds.set(key, kindOf(value));
    }
  }

  const columns = [...kinds.entries()].map(([name, kind]) => ({
    name: name === '_id' ? 'id' : name,
    kind,
    nullable: true,
    rawType: kind,
  }));

  const relations = columns
    .filter((column) => /_id$/.test(column.name) && column.name !== 'id')
    .map((column) => {
      const base = column.name.replace(/_id$/, '');
      return { column: column.name, target: pluralize(base), as: base };
    })
    .filter((relation) => names.has(relation.target));

  return {
    name: collection.collectionName,
    primaryKey: 'id',
    columns,
    searchable: columns
      .filter((column) => column.kind === 'string' && column.name !== 'id')
      .map((column) => column.name),
    relations,
  };
}

export async function createMongoAdapter(url: string): Promise<DatabaseAdapter> {
  const { MongoClient } = await import('mongodb');
  const client: MongoClient = new MongoClient(url);
  await client.connect();

  const db: Db = client.db();
  const collectionNames = (await db.listCollections().toArray())
    .map((info) => info.name)
    .filter((name) => !name.startsWith('system.'))
    .filter((name) => !env.hiddenTables.includes(name))
    .filter((name) => env.exposedTables.length === 0 || env.exposedTables.includes(name))
    .sort();

  const nameSet = new Set(collectionNames);
  const schemas: ResourceSchema[] = [];
  for (const name of collectionNames) {
    schemas.push(await describeCollection(db.collection(name), nameSet));
  }
  const byName = new Map(schemas.map((schema) => [schema.name, schema]));

  const schemaOf = (resource: string): ResourceSchema => {
    const schema = byName.get(resource);
    if (!schema) throw new HttpError(404, `Unknown collection "${resource}".`);
    return schema;
  };

  const embed = async (schema: ResourceSchema, rows: Row[]): Promise<Row[]> => {
    for (const relation of schema.relations) {
      const target = byName.get(relation.target);
      if (!target) continue;

      const ids = [...new Set(rows.map((row) => row[relation.column]).filter(Boolean))];
      if (ids.length === 0) continue;

      const objectIds = await Promise.all(ids.map((id) => toObjectId(String(id))));
      const related = await db
        .collection(relation.target)
        .find({ _id: { $in: objectIds } } as Filter<Document>)
        .toArray();

      const projection = DISPLAY_COLUMNS.filter((column) =>
        target.columns.some((item) => item.name === column),
      );
      const lookup = new Map(
        related.map((item) => {
          const trimmed: Row = { id: String(item._id) };
          for (const column of projection) trimmed[column] = item[column];
          return [String(item._id), trimmed];
        }),
      );

      for (const row of rows) row[relation.as] = lookup.get(String(row[relation.column])) ?? null;
    }
    return rows;
  };

  const buildFilter = async (
    schema: ResourceSchema,
    params: Parameters<DatabaseAdapter['list']>[1],
  ) => {
    const filter: Filter<Document> = {};
    const conditions: Filter<Document>[] = [];

    for (const [column, raw] of Object.entries(params.filters)) {
      if (raw === '') continue;
      const key = column === 'id' ? '_id' : column;

      if (raw.includes('..')) {
        const [from, to] = raw.split('..');
        const range: Record<string, unknown> = {};
        if (from) range.$gte = new Date(from);
        if (to) range.$lte = new Date(`${to}T23:59:59`);
        conditions.push({ [key]: range });
        continue;
      }

      const values = raw.split(',').filter(Boolean);
      const kind = schema.columns.find((item) => item.name === column)?.kind;
      const cast = async (value: string) => {
        if (key === '_id') return toObjectId(value);
        if (kind === 'boolean') return value === 'true';
        if (kind === 'number') return Number(value);
        return value;
      };

      const casted = await Promise.all(values.map(cast));
      conditions.push(casted.length > 1 ? { [key]: { $in: casted } } : { [key]: casted[0] });
    }

    if (params.search && schema.searchable.length > 0) {
      const pattern = new RegExp(params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      conditions.push({ $or: schema.searchable.map((column) => ({ [column]: pattern })) });
    }

    if (conditions.length > 0) filter.$and = conditions;
    return filter;
  };

  return {
    dialect: 'mongodb',
    resources: () => schemas,
    schema: schemaOf,
    has: (resource) => byName.has(resource),

    async list(resource, params) {
      const schema = schemaOf(resource);
      const filter = await buildFilter(schema, params);
      const perPage = Math.min(Math.max(1, params.perPage), MAX_PER_PAGE);
      const page = Math.max(1, params.page);

      const collection = db.collection(resource);
      const total = await collection.countDocuments(filter);
      const sortKey = params.sort?.column === 'id' ? '_id' : (params.sort?.column ?? '_id');

      const documents = await collection
        .find(filter)
        .sort({ [sortKey]: params.sort?.direction === 'asc' ? 1 : -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .toArray();

      return { rows: await embed(schema, documents.map(sanitize)), total };
    },

    async find(resource, id) {
      const schema = schemaOf(resource);
      const document = await db
        .collection(resource)
        .findOne({ _id: (await toObjectId(id)) as Document['_id'] });
      if (!document) return null;
      const [row] = await embed(schema, [sanitize(document)]);
      return row;
    },

    async findBy(resource, column, value) {
      const document = await db.collection(resource).findOne({ [column]: value });
      return document ?? null;
    },

    async insert(resource, data) {
      const { id: _ignored, ...payload } = data;
      const result = await db.collection(resource).insertOne(payload as Document);
      return sanitize({ _id: result.insertedId, ...payload });
    },

    async update(resource, id, data) {
      const { id: _ignored, ...payload } = data;
      const _id = (await toObjectId(id)) as Document['_id'];
      const result = await db
        .collection(resource)
        .findOneAndUpdate({ _id }, { $set: payload }, { returnDocument: 'after' });
      if (!result) throw new HttpError(404, 'Record not found.');
      return sanitize(result);
    },

    async remove(resource, id) {
      const _id = (await toObjectId(id)) as Document['_id'];
      const result = await db.collection(resource).deleteOne({ _id });
      if (result.deletedCount === 0) throw new HttpError(404, 'Record not found.');
    },

    async removeMany(resource, ids) {
      const objectIds = await Promise.all(ids.map((id) => toObjectId(id)));
      const result = await db
        .collection(resource)
        .deleteMany({ _id: { $in: objectIds } } as Filter<Document>);
      return result.deletedCount;
    },

    count: (resource, where) =>
      db.collection(resource).countDocuments((where ?? {}) as Filter<Document>),
    close: () => client.close(),
  };
}
