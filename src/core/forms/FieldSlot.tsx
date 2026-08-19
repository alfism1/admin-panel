import * as React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label } from '@/core/ui/label';
import { cn, debounce } from '@/lib/utils';
import type { Field } from './Field';
import { spanClassName } from './layouts/Layout';
import { useReactiveContext } from './useFieldContext';
import { resolveValue } from './types';
import type {
  FieldContext,
  FormValues,
  Operation,
  ResolvedFieldState,
  UpdateContext,
} from './types';

interface FieldSlotProps {
  field: Field;
  operation: Operation;
  record: FormValues | null;
  /** Path prefix for a nested item; makes the field's resolvers item-relative. */
  scope?: string;
  /** Overrides the bound path. Simple repeaters need it: the item *is* the value. */
  name?: string;
  /** Forced on by a disabled ancestor, which the field itself cannot see. */
  disabled?: boolean;
}

/**
 * Once children register at `items.0.child`, React Hook Form treats `items` as a
 * field array and files the array's own error under `.root` instead of on the
 * node itself.
 */
function messageOf(error: { message?: string; root?: { message?: string } } | undefined) {
  return error?.message ?? error?.root?.message;
}

/**
 * Renders one field: resolves its dynamic state, wires it to React Hook Form,
 * and owns the only subscriptions that field needs. Errors come from
 * `Controller`'s `fieldState`, which is scoped to this field alone.
 */
export function FieldSlot({ field, operation, record, scope, name, disabled }: FieldSlotProps) {
  const form = useFormContext();
  const bound = name ?? (scope ? `${scope}.${field.name}` : field.name);
  const ctx = useReactiveContext({ operation, record, ownName: bound, scope });
  const generatedId = React.useId();

  const config = field.definition;
  const afterUpdate = config.afterStateUpdated;
  const debounceMs = config.live?.debounce ?? 0;

  const notifyUpdate = React.useMemo(() => {
    if (!afterUpdate) return undefined;
    const run = (payload: UpdateContext<never>) => afterUpdate(payload);
    return debounceMs > 0 ? debounce(run, debounceMs) : run;
  }, [afterUpdate, debounceMs]);

  if (!field.isActive(ctx)) return null;

  const helperText = resolveValue(config.helperText, ctx);
  const id = `${generatedId}-${bound.replace(/\./g, '-')}`;
  const mode = field.layoutMode;

  const Control = config.custom ?? field.control;

  return (
    <Controller
      control={form.control}
      name={bound}
      render={({ field: controller, fieldState }) => {
        const error = messageOf(fieldState.error);
        const describedBy =
          [error ? `${id}-error` : null, helperText ? `${id}-help` : null]
            .filter(Boolean)
            .join(' ') || undefined;

        const state: ResolvedFieldState = {
          id,
          label: field.resolveLabel(ctx),
          hideLabel: config.hideLabel === true,
          helperText,
          placeholder: config.placeholder,
          required: field.isRequired(ctx),
          disabled: disabled === true || field.isDisabled(ctx),
          readOnly: field.isReadOnly(ctx),
          error,
          describedBy,
        };

        const control = (
          <Control
            name={bound}
            config={config}
            value={controller.value as unknown}
            onChange={(next: unknown) => {
              const oldState = controller.value as never;
              controller.onChange(next);
              notifyUpdate?.({
                ...(ctx as FieldContext),
                state: next,
                oldState,
              } as UpdateContext<never>);
            }}
            onBlur={controller.onBlur}
            state={state}
            ctx={ctx}
          />
        );

        if (mode === 'bare') return control;

        const labelNode = state.hideLabel ? null : (
          <Label htmlFor={id} className={cn(state.disabled && 'opacity-70')}>
            {state.label}
            {state.required ? (
              <span className="text-destructive ml-0.5" aria-hidden>
                *
              </span>
            ) : null}
          </Label>
        );

        const messages = (
          <>
            {helperText ? (
              <p id={`${id}-help`} className="text-muted-foreground text-xs">
                {helperText}
              </p>
            ) : null}
            {error ? (
              <p id={`${id}-error`} className="text-destructive text-xs font-medium">
                {error}
              </p>
            ) : null}
          </>
        );

        if (mode === 'inline') {
          return (
            <div className={cn('space-y-1.5', spanClassName(config.columnSpan))}>
              <div className="flex items-center gap-2.5">
                {control}
                {labelNode}
              </div>
              {messages}
            </div>
          );
        }

        return (
          <div className={cn('space-y-1.5', spanClassName(config.columnSpan))}>
            {labelNode}
            {control}
            {messages}
          </div>
        );
      }}
    />
  );
}
