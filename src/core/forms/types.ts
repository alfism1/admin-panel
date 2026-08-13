import type * as React from 'react';
import type { AuthUser } from '@/core/auth/types';
import type { Field } from './Field';
import type { FieldConfig } from './Field';
import type { Layout } from './layouts/Layout';

export type Operation = 'create' | 'edit' | 'view';

export type FormValues = Record<string, unknown>;

/**
 * Single context object handed to every resolver. JS has no reflection over
 * parameter names, so this replaces Filament's utility injection.
 */
export interface FieldContext {
  state: unknown;
  get: <T = unknown>(path: string) => T;
  set: (path: string, value: unknown) => void;
  record: FormValues | null;
  operation: Operation;
  user: AuthUser | null;
  can: (permission: string) => boolean;
}

export interface UpdateContext<T> extends FieldContext {
  state: T;
  oldState: T;
}

export type Resolver<T> = (ctx: FieldContext) => T;
export type MaybeResolver<T> = T | Resolver<T>;

export function resolveValue<T>(
  value: MaybeResolver<T> | undefined,
  ctx: FieldContext,
): T | undefined {
  return typeof value === 'function' ? (value as Resolver<T>)(ctx) : value;
}

/** Anything that can sit in a form schema array. */
export type FormComponent = Field | Layout;

export interface ResolvedFieldState {
  id: string;
  label: string;
  hideLabel: boolean;
  helperText?: string;
  placeholder?: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  error?: string;
  describedBy?: string;
}

export interface FieldRenderProps<TValue = unknown, TConfig extends FieldConfig = FieldConfig> {
  name: string;
  config: TConfig;
  value: TValue;
  onChange: (value: TValue) => void;
  onBlur: () => void;
  state: ResolvedFieldState;
  ctx: FieldContext;
}

/**
 * Controls are written against their own precise props, then stored in this
 * erased form so the renderer can hold any field without `any`. Each field
 * class performs the one narrowing cast in its `control` getter.
 */
export type FieldControl = React.ComponentType<FieldRenderProps>;

export interface LayoutRenderProps {
  layout: Layout;
  ctx: FieldContext;
  /** Layouts render their own children so containers like Tabs stay in control. */
  renderComponents: (components: FormComponent[]) => React.ReactNode;
}

export interface ValidationRules {
  required?: MaybeResolver<boolean>;
  nullable?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  email?: boolean;
  url?: boolean;
  numeric?: boolean;
  regex?: { pattern: RegExp; message?: string };
  confirmed?: boolean;
  unique?: { resource: string; column?: string; ignoreRecord?: boolean };
  rules?: Array<(value: unknown, allValues: FormValues) => true | string>;
}

export type ValueType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'file' | 'unknown';
