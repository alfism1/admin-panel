import type { Knex } from 'knex';
import { env } from '../env';
import { pluralize, singularize } from '../naming';
import type { Dialect } from './connect';
import type { ColumnKind, ColumnSchema, ResourceSchema } from './types';

interface NamedRow {
  name?: string;
  table_name?: string;
  TABLE_NAME?: string;
}

async function listTables(db: Knex, dialect: Dialect): Promise<string[]> {
  if (dialect === 'sqlite') {
    const rows = await db.raw<NamedRow[]>(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'",
    );
    return (Array.isArray(rows) ? rows : []).map((row) => String(row.name));
  }

  if (dialect === 'mysql') {
    const [rows] = (await db.raw(
      'select table_name as name from information_schema.tables where table_schema = database() and table_type = ?',
      ['BASE TABLE'],
    )) as [NamedRow[]];
    return rows.map((row) => String(row.name ?? row.TABLE_NAME));
  }

  if (dialect === 'mssql') {
    const rows = (await db.raw(
      "select table_name as name from information_schema.tables where table_type = 'BASE TABLE'",
    )) as NamedRow[];
    return rows.map((row) => String(row.name));
  }

  // PostgreSQL
  const result = (await db.raw(
    `select table_name as name from information_schema.tables
     where table_schema = coalesce(?, current_schema()) and table_type = 'BASE TABLE'`,
    [env.schema ?? null],
  )) as { rows: NamedRow[] };
  return result.rows.map((row) => String(row.name));
}

async function primaryKeyOf(db: Knex, dialect: Dialect, table: string): Promise<string | null> {
  try {
    if (dialect === 'sqlite') {
      const rows = (await db.raw(`pragma table_info(??)`, [table])) as Array<{
        name: string;
        pk: number;
      }>;
      return rows.find((row) => row.pk === 1)?.name ?? null;
    }

    if (dialect === 'mysql') {
      const [rows] = (await db.raw(
        `select column_name as name from information_schema.columns
         where table_schema = database() and table_name = ? and column_key = 'PRI'`,
        [table],
      )) as [Array<{ name: string }>];
      return rows[0]?.name ?? null;
    }

    if (dialect === 'mssql') {
      const rows = (await db.raw(
        `select kcu.column_name as name
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
         where tc.table_name = ? and tc.constraint_type = 'PRIMARY KEY'`,
        [table],
      )) as Array<{ name: string }>;
      return rows[0]?.name ?? null;
    }

    const result = (await db.raw(
      `select a.attname as name
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = to_regclass(?) and i.indisprimary`,
      [table],
    )) as { rows: Array<{ name: string }> };
    return result.rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

interface ForeignKey {
  column: string;
  target: string;
}

/**
 * Declared foreign keys are authoritative — `author_id` may well point at
 * `users`. The `<name>_id` convention is only a fallback for schemas that
 * never declared constraints.
 */
async function foreignKeysOf(db: Knex, dialect: Dialect, table: string): Promise<ForeignKey[]> {
  try {
    if (dialect === 'sqlite') {
      const rows = (await db.raw(`pragma foreign_key_list(??)`, [table])) as Array<{
        from: string;
        table: string;
      }>;
      return rows.map((row) => ({ column: row.from, target: row.table }));
    }

    if (dialect === 'mysql') {
      const [rows] = (await db.raw(
        `select column_name as \`column\`, referenced_table_name as target
         from information_schema.key_column_usage
         where table_schema = database() and table_name = ? and referenced_table_name is not null`,
        [table],
      )) as [ForeignKey[]];
      return rows;
    }

    if (dialect === 'mssql') {
      return (await db.raw(
        `select c.name as [column], rt.name as target
         from sys.foreign_key_columns fkc
         join sys.columns c on c.object_id = fkc.parent_object_id and c.column_id = fkc.parent_column_id
         join sys.tables t on t.object_id = fkc.parent_object_id
         join sys.tables rt on rt.object_id = fkc.referenced_object_id
         where t.name = ?`,
        [table],
      )) as ForeignKey[];
    }

    const result = (await db.raw(
      `select kcu.column_name as "column", ccu.table_name as target
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
       where tc.constraint_type = 'FOREIGN KEY'
         and tc.table_name = ?
         and tc.table_schema = coalesce(?, current_schema())`,
      [table, env.schema ?? null],
    )) as { rows: ForeignKey[] };
    return result.rows;
  } catch {
    return [];
  }
}

function classify(rawType: string): ColumnKind {
  const type = rawType.toLowerCase();
  if (/(int|serial|decimal|numeric|float|double|real|money)/.test(type)) return 'number';
  if (/(bool|bit)/.test(type)) return 'boolean';
  if (/(date|time)/.test(type)) return 'date';
  if (/(json|jsonb)/.test(type)) return 'json';
  if (/(char|text|uuid|enum|citext)/.test(type)) return 'string';
  return 'unknown';
}

function shouldExpose(table: string): boolean {
  if (env.hiddenTables.includes(table)) return false;
  if (env.exposedTables.length > 0) return env.exposedTables.includes(table);
  return true;
}

/**
 * Reads the live schema once at boot. Everything the API can do — which tables
 * exist, what is searchable, which columns are foreign keys — comes from here,
 * so no per-table configuration is needed.
 */
export async function introspect(db: Knex, dialect: Dialect): Promise<ResourceSchema[]> {
  const tables = (await listTables(db, dialect)).filter(shouldExpose).sort();
  const tableSet = new Set(tables);
  const schemas: ResourceSchema[] = [];

  for (const table of tables) {
    const info = await db(table).columnInfo();
    const columns: ColumnSchema[] = Object.entries(info).map(([name, meta]) => ({
      name,
      kind: classify(String(meta.type)),
      nullable: Boolean(meta.nullable),
      rawType: String(meta.type),
    }));

    if (columns.length === 0) continue;

    const detectedKey = await primaryKeyOf(db, dialect, table);
    const primaryKey =
      detectedKey ?? (columns.some((column) => column.name === 'id') ? 'id' : columns[0].name);

    const declared = await foreignKeysOf(db, dialect, table);
    const byColumn = new Map(declared.map((key) => [key.column, key.target]));

    const relations = columns
      .filter((column) => /_id$/.test(column.name) && column.name !== primaryKey)
      .map((column) => {
        const base = column.name.replace(/_id$/, '');
        // Declared constraint first, `role_id` -> `roles` convention second.
        return {
          column: column.name,
          target: byColumn.get(column.name) ?? pluralize(base),
          as: base,
        };
      })
      .filter((relation) => tableSet.has(relation.target));

    // A `tsvector` column is a standing invitation to use it: whoever added it
    // did so to make search indexable, so search switches to it automatically
    // rather than needing a second piece of configuration to agree.
    const searchVector = columns.find((column) => /^tsvector$/i.test(column.rawType))?.name;

    schemas.push({
      name: table,
      primaryKey,
      columns: columns.filter((column) => column.name !== searchVector),
      searchable: columns
        .filter(
          (column) =>
            column.kind === 'string' && column.name !== primaryKey && column.name !== searchVector,
        )
        .map((column) => column.name),
      relations,
      ...(searchVector ? { searchVector } : {}),
    });
  }

  return schemas;
}

/** `users` -> `user.view`, used to build the permission catalogue. */
export function permissionsFor(schemas: ResourceSchema[]): string[] {
  return schemas.flatMap((schema) => {
    const base = singularize(schema.name);
    return [`${base}.view`, `${base}.create`, `${base}.update`, `${base}.delete`];
  });
}
