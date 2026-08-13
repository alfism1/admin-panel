import * as React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useAuth } from '@/core/auth/useAuth';
import type { FieldContext, FormValues, Operation } from './types';

export interface ContextOptions {
  operation: Operation;
  record: FormValues | null;
  /** Field this context belongs to; its own value is always a dependency. */
  ownName?: string;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Builds the resolver context and subscribes only to the paths the resolvers
 * actually read. A field that depends on nothing never re-renders when a
 * sibling changes, so typing in one input does not repaint the whole form.
 */
export function useReactiveContext({ operation, record, ownName }: ContextOptions): FieldContext {
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
      accessed.add(path);
      return form.getValues(path) as T;
    },
    set: (path, value) => form.setValue(path, value, { shouldDirty: true, shouldValidate: true }),
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
  const read = <T>(path: string): T => {
    const segments = path.split('.');
    let cursor: unknown = values;
    for (const segment of segments) {
      if (cursor == null || typeof cursor !== 'object') return undefined as T;
      cursor = (cursor as FormValues)[segment];
    }
    return cursor as T;
  };

  return {
    state: options.ownName ? read(options.ownName) : undefined,
    get: read,
    set: options.set ?? (() => undefined),
    record: options.record,
    operation: options.operation,
    user: options.user,
    can: options.can,
  };
}
