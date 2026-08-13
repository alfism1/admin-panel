import { getPath, setPath } from '@/lib/utils';
import type { Field } from './Field';
import { Layout } from './layouts/Layout';
import type { FieldContext, FormComponent, FormValues } from './types';

type AnyField = Field;

/** Depth-first walk that flattens layouts away, leaving only fields. */
export function collectFields(components: FormComponent[]): AnyField[] {
  const fields: AnyField[] = [];
  for (const component of components) {
    if (component instanceof Layout) fields.push(...collectFields(component.children));
    else fields.push(component);
  }
  return fields;
}

function emptyValue(field: AnyField): unknown {
  switch (field.valueType) {
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'number':
    case 'date':
    case 'file':
      return null;
    case 'string':
      return '';
    default:
      return null;
  }
}

export function buildDefaultValues(
  fields: AnyField[],
  record: FormValues | null,
  makeContext: (values: FormValues, field: AnyField) => FieldContext,
): FormValues {
  let values: FormValues = {};

  for (const field of fields) {
    const ctx = makeContext(record ?? {}, field);
    const recorded = record ? getPath(record, field.name) : undefined;

    let value: unknown;
    if (recorded !== undefined) {
      value = recorded;
    } else {
      const fallback = field.definition.defaultValue;
      value =
        typeof fallback === 'function'
          ? (fallback as (context: FieldContext) => unknown)(ctx)
          : (fallback ?? emptyValue(field));
    }

    const format = field.definition.formatState as ((state: unknown) => unknown) | undefined;
    values = setPath(values, field.name, format ? format(value) : value);
  }

  return values;
}

/**
 * Produces the payload sent to the server: hidden, unauthorized and
 * `dehydrated(false)` fields are dropped so they never reach the API.
 */
export function dehydrateValues(
  fields: AnyField[],
  values: FormValues,
  makeContext: (values: FormValues, field: AnyField) => FieldContext,
): FormValues {
  let payload: FormValues = {};

  for (const field of fields) {
    const ctx = makeContext(values, field);
    if (!field.isActive(ctx)) continue;

    const state = getPath(values, field.name);
    if (!field.shouldDehydrate(state)) continue;

    const transform = field.definition.dehydrateState;
    payload = setPath(payload, field.name, transform ? transform(state) : state);
  }

  return payload;
}
