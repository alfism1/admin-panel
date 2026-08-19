import { z } from 'zod';
import { getDataProvider } from '@/core/data/DataProvider';
import { getPath } from '@/lib/utils';
import type { Field } from './Field';
import type { FieldContext, FormValues, ValidationRules } from './types';

type AnyField = Field;

const uniqueCache = new Map<string, boolean>();

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Builds the per-field Zod type from the declarative rules on the builder.
 * Exported because `Repeater` has to run the same rules against items its own
 * schema owns, which `superRefine` never reaches.
 */
export function compileFieldValidator(field: AnyField, label: string): z.ZodTypeAny {
  const rules: ValidationRules = field.definition.validation;

  switch (field.valueType) {
    case 'boolean':
      return z.boolean({ invalid_type_error: `${label} must be true or false.` });

    case 'number': {
      let schema = z.coerce.number({ invalid_type_error: `${label} must be a number.` });
      if (rules.min !== undefined) schema = schema.min(rules.min);
      if (rules.max !== undefined) schema = schema.max(rules.max);
      return schema;
    }

    // Only the primitive type is checked here; whether the string is a readable
    // date depends on the field's stored format, so `field.validate()` owns it.
    case 'date':
      return z.string({ invalid_type_error: `${label} must be a date.` });

    case 'file':
      return z.union([z.string(), z.array(z.string())]);

    case 'string': {
      let schema = z.string({ invalid_type_error: `${label} must be text.` });
      if (rules.minLength !== undefined) {
        schema = schema.min(rules.minLength, {
          message: `${label} must be at least ${rules.minLength} characters.`,
        });
      }
      if (rules.maxLength !== undefined) {
        schema = schema.max(rules.maxLength, {
          message: `${label} may not be longer than ${rules.maxLength} characters.`,
        });
      }
      if (rules.email)
        schema = schema.email({ message: `${label} must be a valid email address.` });
      if (rules.url) schema = schema.url({ message: `${label} must be a valid URL.` });
      if (rules.regex) {
        schema = schema.regex(rules.regex.pattern, {
          message: rules.regex.message ?? `${label} has an invalid format.`,
        });
      }
      if (rules.numeric) {
        schema = schema.regex(/^-?\d*\.?\d+$/, { message: `${label} must be numeric.` });
      }
      return schema;
    }

    default:
      return z.unknown();
  }
}

async function isUnique(
  rule: NonNullable<ValidationRules['unique']>,
  column: string,
  value: unknown,
  ctx: FieldContext,
): Promise<boolean> {
  const cacheKey = `${rule.resource}:${column}:${String(value)}:${String(ctx.record?.id ?? '')}`;
  const cached = uniqueCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = await getDataProvider().getList(rule.resource, {
    page: 1,
    perPage: 5,
    filters: { [column]: value },
  });

  const ownId = rule.ignoreRecord ? ctx.record?.id : undefined;
  const conflict = result.data.some((row) => {
    const matches = String(getPath(row, column) ?? '') === String(value);
    return matches && (ownId === undefined || String((row as FormValues).id) !== String(ownId));
  });

  uniqueCache.set(cacheKey, !conflict);
  return !conflict;
}

export interface BuildSchemaOptions {
  fields: AnyField[];
  /** Rebuilt per validation run so conditional rules see the latest values. */
  makeContext: (values: FormValues, field: AnyField) => FieldContext;
}

/**
 * Compiles the schema into a single Zod object. Conditional rules are evaluated
 * inside `superRefine` because visibility and `required()` can depend on values
 * that only exist at validation time.
 */
export function buildZodSchema({ fields, makeContext }: BuildSchemaOptions) {
  return z.record(z.unknown()).superRefine(async (values, refinement) => {
    const formValues = values as FormValues;

    for (const field of fields) {
      const ctx = makeContext(formValues, field);
      if (!field.isActive(ctx)) continue;

      const name = field.name;
      const label = field.resolveLabel(ctx);
      const value = getPath(formValues, name);
      const rules = field.definition.validation;

      if (field.isRequired(ctx) && isBlank(value)) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          path: name.split('.'),
          message: `${label} is required.`,
        });
        continue;
      }

      if (isBlank(value)) continue;

      const result = compileFieldValidator(field, label).safeParse(value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          refinement.addIssue({ ...issue, path: name.split('.') });
        }
        continue;
      }

      for (const message of field.validate(value, ctx, label)) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          path: name.split('.'),
          message,
        });
      }

      if (rules.confirmed) {
        const confirmation = getPath(formValues, `${name}_confirmation`);
        if (confirmation !== value) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: `${name}_confirmation`.split('.'),
            message: `${label} confirmation does not match.`,
          });
        }
      }

      for (const rule of rules.rules ?? []) {
        const outcome = rule(value, formValues);
        if (outcome !== true) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: name.split('.'),
            message: outcome,
          });
        }
      }

      if (rules.unique) {
        const column = rules.unique.column ?? name;
        const available = await isUnique(rules.unique, column, value, ctx);
        if (!available) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: name.split('.'),
            message: `This ${label.toLowerCase()} is already taken.`,
          });
        }
      }
    }
  });
}

/** Clears memoized `unique()` lookups — call after a successful save. */
export function resetUniqueCache(): void {
  uniqueCache.clear();
}
