import type { DataProvider, ID, ListParams, RecordShape } from '@/core/data/types';
import { collectFields } from '@/core/forms/formState';
import type { FormValues } from '@/core/forms/types';
import { getResource } from '@/core/resources/registry';
import { Repeater, type RepeaterRelationship } from '@/core/forms/fields/Repeater';

interface Bound {
  repeater: Repeater;
  relationship: RepeaterRelationship;
}

interface Group {
  bound: Bound;
  items: FormValues[];
}

/** Every relationship-backed repeater declared on a resource's form. */
function boundRepeaters(resource: string): Bound[] {
  const definition = getResource(resource);
  if (!definition?.form) return [];

  const bound: Bound[] = [];
  for (const field of collectFields(definition.form)) {
    if (!(field instanceof Repeater)) continue;
    const { relationship } = field.definition;
    if (relationship) bound.push({ repeater: field, relationship });
  }
  return bound;
}

/**
 * One request covers several parents: both adapters expand a comma-separated
 * filter into `IN (…)`, which is what makes the bulk paths cheap.
 */
function listParams({ repeater, relationship }: Bound, parents: ID[]): ListParams {
  const { orderColumn } = repeater.definition;
  return {
    page: 1,
    perPage: relationship.perPage ?? 100,
    sort:
      relationship.sort ??
      (orderColumn ? { field: orderColumn, order: 'asc' as const } : undefined),
    filters: { ...relationship.filters, [relationship.foreignKey]: parents.join(',') },
  };
}

async function fetchChildren(
  base: DataProvider,
  bound: Bound,
  parents: ID[],
): Promise<FormValues[]> {
  const result = await base.getList<FormValues>(
    bound.relationship.resource,
    listParams(bound, parents),
  );
  return result.data;
}

async function loadItems(base: DataProvider, bound: Bound, parent: ID): Promise<FormValues[]> {
  const { modifyRecords, mutateBeforeFill } = bound.repeater.definition;
  const rows = await fetchChildren(base, bound, [parent]);
  const records = modifyRecords ? modifyRecords(rows) : rows;
  return mutateBeforeFill ? records.map(mutateBeforeFill) : records;
}

/**
 * Diffs the submitted items against the rows currently on file: items carrying
 * a known id are updated, the rest are inserted, and rows nobody kept are
 * deleted. Writes come first so a failure mid-way cannot lose a row that the
 * form still holds — the whole sync is several requests, not a transaction.
 */
async function syncChildren(
  base: DataProvider,
  bound: Bound,
  parent: ID,
  items: FormValues[],
): Promise<void> {
  const { relationship } = bound;
  const { mutateBeforeCreate, mutateBeforeSave, afterCreate, afterUpdate, afterDelete } =
    bound.repeater.definition;

  const existing = await fetchChildren(base, bound, [parent]);
  const known = new Set(existing.map((row) => String(row.id)));
  const kept = new Set<string>();

  for (const item of items) {
    const { id, ...rest } = item;
    const data: FormValues = { ...rest, [relationship.foreignKey]: parent };

    if (id !== undefined && known.has(String(id))) {
      kept.add(String(id));
      const saved = await base.update<FormValues>(
        relationship.resource,
        id as ID,
        mutateBeforeSave ? mutateBeforeSave(data) : data,
      );
      afterUpdate?.(saved);
    } else {
      const saved = await base.create<FormValues>(
        relationship.resource,
        mutateBeforeCreate ? mutateBeforeCreate(data) : data,
      );
      afterCreate?.(saved);
    }
  }

  const removed = existing.filter((row) => !kept.has(String(row.id)));
  if (removed.length === 0) return;

  await base.deleteMany(
    relationship.resource,
    removed.map((row) => row.id as ID),
  );
  for (const row of removed) afterDelete?.(row);
}

/** Lifts relationship arrays out of the payload; the parent table has no such column. */
function split(resource: string, data: FormValues): { payload: FormValues; groups: Group[] } {
  const payload: FormValues = { ...data };
  const groups: Group[] = [];

  for (const bound of boundRepeaters(resource)) {
    const key = bound.repeater.name;
    if (!(key in payload)) continue;

    const value = payload[key];
    delete payload[key];
    groups.push({ bound, items: Array.isArray(value) ? (value as FormValues[]) : [] });
  }

  return { payload, groups };
}

function requireId(resource: string, record: FormValues): ID {
  const id = record?.id as ID | undefined;
  if (id === undefined) {
    throw new Error(`Saving "${resource}" returned no id, so its related items cannot be linked.`);
  }
  return id;
}

/**
 * Teaches any `DataProvider` to fill and persist `Repeater.relationship()`
 * using the seven methods it already has — no extra endpoint, and the mock
 * backend and the Node API behave identically.
 *
 * ```ts
 * setDataProvider(withRepeaterRelationships(restDataProvider));
 * ```
 *
 * `getList` deliberately does *not* hydrate: a table of 25 parents would cost
 * 25 extra requests to fill repeaters no column ever renders.
 */
export function withRepeaterRelationships(base: DataProvider): DataProvider {
  const syncAll = async (groups: Group[], parent: ID): Promise<void> => {
    for (const group of groups) {
      await syncChildren(base, group.bound, parent, group.items);
    }
  };

  const removeChildrenOf = async (resource: string, parents: ID[]): Promise<void> => {
    for (const bound of boundRepeaters(resource)) {
      const rows = await fetchChildren(base, bound, parents);
      if (rows.length === 0) continue;
      await base.deleteMany(
        bound.relationship.resource,
        rows.map((row) => row.id as ID),
      );
    }
  };

  return {
    ...base,

    async getOne<T = RecordShape>(resource: string, id: ID): Promise<T> {
      const record = await base.getOne<FormValues>(resource, id);
      const hydrated: FormValues = { ...record };

      for (const bound of boundRepeaters(resource)) {
        hydrated[bound.repeater.name] = await loadItems(base, bound, id);
      }

      return hydrated as T;
    },

    async create<T = RecordShape>(resource: string, data: Partial<T>): Promise<T> {
      const { payload, groups } = split(resource, data as FormValues);
      const record = await base.create<FormValues>(resource, payload);

      if (groups.length > 0) await syncAll(groups, requireId(resource, record));
      return record as T;
    },

    async update<T = RecordShape>(resource: string, id: ID, data: Partial<T>): Promise<T> {
      const { payload, groups } = split(resource, data as FormValues);
      const record = await base.update<FormValues>(resource, id, payload);

      await syncAll(groups, id);
      return record as T;
    },

    // Kept symmetrical so behaviour does not depend on whether the schema
    // happens to declare `ON DELETE CASCADE`.
    async delete(resource: string, id: ID): Promise<void> {
      await removeChildrenOf(resource, [id]);
      await base.delete(resource, id);
    },

    async deleteMany(resource: string, ids: ID[]): Promise<void> {
      await removeChildrenOf(resource, ids);
      await base.deleteMany(resource, ids);
    },
  };
}
