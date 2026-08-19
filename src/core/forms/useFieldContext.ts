import * as React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useAuth } from '@/core/auth/useAuth';
import type { FieldContext, FormValues, Operation } from './types';

export interface ContextOptions {
  operation: Operation;
  record: FormValues | null;
  /** Field this context belongs to; its own value is always a dependency. */
  ownName?: string;
  /**
   * Path prefix for a nested item, e.g. `line_items.0`. Every `get`/`set` is
   * resolved against it, so a field inside a repeater reads `get('quantity')`
   * exactly as it would at the top level.
   */
  scope?: string;
}

/** Climbs one level out of the current scope — Filament's `$get('../../x')`. */
const PARENT = '../';

export function resolveScoped(scope: string | undefined, path: string): string {
  let base = scope ?? '';
  let rest = path;

  while (rest.startsWith(PARENT)) {
    rest = rest.slice(PARENT.length);
    base = base.split('.').slice(0, -1).join('.');
  }

  return base ? `${base}.${rest}` : rest;
}

/** Re-points an existing context at a nested path, for code that has no form. */
export function scopeContext(ctx: FieldContext, scope: string): FieldContext {
  return {
    ...ctx,
    get: <T>(path: string): T => ctx.get<T>(resolveScoped(scope, path)),
    set: (path, value) => ctx.set(resolveScoped(scope, path), value),
  };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Builds the resolver context and subscribes only to the paths the resolvers
 * actually read. A field that depends on nothing never re-renders when a
 * sibling changes, so typing in one input does not repaint the whole form.
 */
export function useReactiveContext({
  operation,
  record,
  ownName,
  scope,
}: ContextOptions): FieldContext {
  const form = useFormContext();
  const { user, can } = useAuth();

  const depsRef = React.useRef<string[]>(ownName ? [ownName] : []);
  const [, bumpVersion] = React.useReducer((version: number) => version + 1, 0);

  useWatch({ control: form.control, name: depsRef.current });

  const accessed = new Set(depsRef.current);

  // Rebuilt every render on purpose: resolvers must read the values of this pass.
  const ctx: FieldContext = {
    state: ownName ? form.getValues(ownName) : undefined,
    get: <T>(path: string): T => {
      const resolved = resolveScoped(scope, path);
      accessed.add(resolved);
      return form.getValues(resolved) as T;
    },
    set: (path, value) =>
      form.setValue(resolveScoped(scope, path), value, {
        shouldDirty: true,
        shouldValidate: true,
      }),
    record,
    operation,
    user,
    can,
  };

  React.useEffect(() => {
    const next = Array.from(accessed);
    if (!sameList(next, depsRef.current)) {
      depsRef.current = next;
      bumpVersion();
    }
  });

  return ctx;
}

/** Non-reactive context used by validation and submit, where values are passed in. */
export function createStaticContext(
  values: FormValues,
  options: ContextOptions & {
    user: FieldContext['user'];
    can: FieldContext['can'];
    set?: FieldContext['set'];
  },
): FieldContext {
  const readRaw = <T>(path: string): T => {
    let cursor: unknown = values;
    for (const segment of path.split('.')) {
      if (cursor == null || typeof cursor !== 'object') return undefined as T;
      cursor = (cursor as FormValues)[segment];
    }
    return cursor as T;
  };

  const read = <T>(path: string): T => readRaw<T>(resolveScoped(options.scope, path));

  return {
    // `ownName` is already absolute, so it reads past the scope.
    state: options.ownName ? readRaw(options.ownName) : undefined,
    get: read,
    set: (path, value) => options.set?.(resolveScoped(options.scope, path), value),
    record: options.record,
    operation: options.operation,
    user: options.user,
    can: options.can,
  };
}
