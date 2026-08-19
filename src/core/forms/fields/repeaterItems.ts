import { getPath, setPath } from '@/lib/utils';
import { compileFieldValidator } from '../buildZodSchema';
import type { Field } from '../Field';
import { buildDefaultValues, collectFields } from '../formState';
import { resolveValue } from '../types';
import type { FieldContext, FormComponent, FormValues, MaybeResolver } from '../types';
import { createStaticContext, scopeContext } from '../useFieldContext';

export interface ItemIssue {
  /** Child field name, relative to the item. */
  name: string;
  message: string;
}

export function resolveFlag(
  value: MaybeResolver<boolean> | undefined,
  ctx: FieldContext,
  fallback: boolean,
): boolean {
  return resolveValue(value, ctx) ?? fallback;
}

/** The value a freshly added item starts at, honouring every child's `default()`. */
export function blankItemValue(
  schema: FormComponent[],
  simpleField: Field | undefined,
  ctx: FieldContext,
): unknown {
  const fields = simpleField ? [simpleField] : collectFields(schema);
  const values = buildDefaultValues(fields, null, (itemValues) =>
    createStaticContext(itemValues, {
      operation: ctx.operation,
      record: ctx.record,
      user: ctx.user,
      can: ctx.can,
    }),
  );

  return simpleField ? values[simpleField.name] : values;
}

export function moveItem(items: unknown[], from: number, to: number): unknown[] {
  if (to < 0 || to >= items.length || to === from) return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/**
 * Inserts a copy directly after the original. A relationship child drops its
 * `id`, or the copy would save over the row it was cloned from.
 */
export function duplicateItem(items: unknown[], index: number, keepId: boolean): unknown[] {
  const source = items[index];
  let copy = source;

  if (source !== null && typeof source === 'object') {
    const { id: _id, ...rest } = source as FormValues;
    copy = keepId ? { ...(source as FormValues) } : rest;
  }

  return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
}

function read(item: unknown, name: string): unknown {
  return getPath(item as FormValues, name);
}

/**
 * `fixIndistinctState()`: the item that just changed keeps the value and every
 * other item holding it is cleared. Comparing against the previous array is
 * what makes "just changed" knowable — a freshly loaded record is left alone.
 */
export function fixIndistinctItems(
  items: unknown[],
  previous: unknown[] | null,
  schema: FormComponent[],
  names: string[],
): unknown[] | null {
  if (!previous || previous.length !== items.length) return null;

  const fields = collectFields(schema);
  let next = items;
  let changed = false;

  for (const name of names) {
    const editedAt = next.findIndex(
      (item, index) => read(item, name) !== read(previous[index], name),
    );
    if (editedAt === -1) continue;

    const winner = read(next[editedAt], name);
    if (isBlank(winner)) continue;

    const empty =
      fields.find((field) => field.name === name)?.valueType === 'boolean' ? false : null;

    next = next.map((item, index) => {
      if (index === editedAt || read(item, name) !== winner) return item;
      changed = true;
      return setPath(item as FormValues, name, empty);
    });
  }

  return changed ? next : null;
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Mirrors what `buildZodSchema` does per field, for the items a repeater owns:
 * its `superRefine` only walks the top-level schema, and it is async, so it
 * could not be reused wholesale. The rule compiler is shared, so the messages
 * are the ones a top-level field would produce.
 */
function fieldIssues(field: Field, fieldCtx: FieldContext, siblings: FormValues): string[] {
  const value = fieldCtx.state;
  const label = field.resolveLabel(fieldCtx);

  if (field.isRequired(fieldCtx) && isBlank(value)) return [`${label} is required.`];
  if (isBlank(value)) return [];

  const result = compileFieldValidator(field, label).safeParse(value);
  if (!result.success) return result.error.issues.map((issue) => issue.message);

  const messages = [...field.validate(value, fieldCtx, label)];
  for (const rule of field.definition.validation.rules ?? []) {
    const outcome = rule(value, siblings);
    if (outcome !== true) messages.push(outcome);
  }

  return messages;
}

/** Validates one item against the child schema, in the item's own scope. */
export function issuesForItem(
  schema: FormComponent[],
  simpleField: Field | undefined,
  arrayName: string,
  ctx: FieldContext,
  index: number,
): ItemIssue[] {
  if (simpleField) {
    const fieldCtx: FieldContext = {
      ...scopeContext(ctx, arrayName),
      state: ctx.get(`${arrayName}.${index}`),
    };
    if (!simpleField.isActive(fieldCtx)) return [];
    return fieldIssues(simpleField, fieldCtx, {}).map((message) => ({
      name: simpleField.name,
      message,
    }));
  }

  const itemPath = `${arrayName}.${index}`;
  const scoped = scopeContext(ctx, itemPath);
  const siblings = ctx.get<FormValues>(itemPath) ?? {};
  const issues: ItemIssue[] = [];

  for (const field of collectFields(schema)) {
    const fieldCtx: FieldContext = { ...scoped, state: scoped.get(field.name) };
    if (!field.isActive(fieldCtx)) continue;
    for (const message of fieldIssues(field, fieldCtx, siblings)) {
      issues.push({ name: field.name, message });
    }
  }

  return issues;
}
