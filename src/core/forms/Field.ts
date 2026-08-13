import { labelize } from '@/lib/labelize';
import { SchemaComponent, type BaseComponentConfig } from './SchemaComponent';
import { resolveValue } from './types';
import type {
  FieldContext,
  FieldControl,
  MaybeResolver,
  Operation,
  Resolver,
  UpdateContext,
  ValidationRules,
  ValueType,
} from './types';

/**
 * Stored configuration. It is deliberately not generic over the value type:
 * the typed surface lives on the builder methods, while the framework reads
 * this erased shape without needing `any`.
 */
export interface FieldConfig extends BaseComponentConfig {
  name: string;
  label?: MaybeResolver<string>;
  hideLabel?: boolean;
  helperText?: MaybeResolver<string>;
  placeholder?: string;
  defaultValue?: unknown;
  formatState?: (state: unknown) => unknown;
  dehydrateState?: (state: unknown) => unknown;
  dehydratedRule?: boolean | ((state: unknown) => boolean);
  validation: ValidationRules;
  disabled?: MaybeResolver<boolean>;
  readOnly?: MaybeResolver<boolean>;
  disabledOn?: Operation[];
  live?: { onBlur?: boolean; debounce?: number };
  afterStateUpdated?: (ctx: UpdateContext<never>) => void;
  autofocus?: boolean;
  custom?: FieldControl;
}

/**
 * Base class for every form field. Subclasses add their own options and supply
 * the React control that renders them.
 */
export abstract class Field<
  TValue = unknown,
  TConfig extends FieldConfig = FieldConfig,
> extends SchemaComponent<TConfig> {
  readonly kind = 'field' as const;

  /** Drives the default Zod primitive when compiling validation. */
  readonly valueType: ValueType = 'unknown';

  protected constructor(config: TConfig) {
    super(config);
  }

  abstract get control(): FieldControl;

  /** How `SchemaForm` wraps the control: label above, label beside, or unwrapped. */
  get layoutMode(): 'stacked' | 'inline' | 'bare' {
    return 'stacked';
  }

  get name(): string {
    return this.config.name;
  }

  // ---------------------------------------------------------------- identity

  label(value: MaybeResolver<string>): this {
    return this.mutate({ label: value } as Partial<TConfig>);
  }

  hiddenLabel(value = true): this {
    return this.mutate({ hideLabel: value } as Partial<TConfig>);
  }

  helperText(value: MaybeResolver<string>): this {
    return this.mutate({ helperText: value } as Partial<TConfig>);
  }

  placeholder(value: string): this {
    return this.mutate({ placeholder: value } as Partial<TConfig>);
  }

  autofocus(value = true): this {
    return this.mutate({ autofocus: value } as Partial<TConfig>);
  }

  // ------------------------------------------------------------------- value

  default(value: MaybeResolver<TValue>): this {
    return this.mutate({ defaultValue: value } as Partial<TConfig>);
  }

  formatStateUsing(fn: (state: TValue) => unknown): this {
    return this.mutate({ formatState: fn as (state: unknown) => unknown } as Partial<TConfig>);
  }

  dehydrateStateUsing(fn: (state: unknown) => unknown): this {
    return this.mutate({ dehydrateState: fn } as Partial<TConfig>);
  }

  dehydrated(value: boolean | ((state: unknown) => boolean)): this {
    return this.mutate({ dehydratedRule: value } as Partial<TConfig>);
  }

  // -------------------------------------------------------------- validation

  protected withValidation(patch: Partial<ValidationRules>): this {
    return this.mutate({
      validation: { ...this.config.validation, ...patch },
    } as Partial<TConfig>);
  }

  required(value: MaybeResolver<boolean> = true): this {
    return this.withValidation({ required: value });
  }

  nullable(): this {
    return this.withValidation({ nullable: true });
  }

  minLength(length: number): this {
    return this.withValidation({ minLength: length });
  }

  maxLength(length: number): this {
    return this.withValidation({ maxLength: length });
  }

  min(value: number): this {
    return this.withValidation({ min: value });
  }

  max(value: number): this {
    return this.withValidation({ max: value });
  }

  email(): this {
    return this.withValidation({ email: true });
  }

  url(): this {
    return this.withValidation({ url: true });
  }

  numeric(): this {
    return this.withValidation({ numeric: true });
  }

  regex(pattern: RegExp, message?: string): this {
    return this.withValidation({ regex: { pattern, message } });
  }

  rule(fn: (value: unknown, allValues: Record<string, unknown>) => true | string): this {
    return this.withValidation({ rules: [...(this.config.validation.rules ?? []), fn] });
  }

  unique(opts: { resource: string; column?: string; ignoreRecord?: boolean }): this {
    return this.withValidation({ unique: opts });
  }

  /** Requires a sibling field named `${name}_confirmation` to match. */
  confirmed(): this {
    return this.withValidation({ confirmed: true });
  }

  // ------------------------------------------------------------------- state

  disabled(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ disabled: value } as Partial<TConfig>);
  }

  readOnly(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ readOnly: value } as Partial<TConfig>);
  }

  disabledOn(operation: Operation | Operation[]): this {
    return this.mutate({
      disabledOn: Array.isArray(operation) ? operation : [operation],
    } as Partial<TConfig>);
  }

  // -------------------------------------------------------------- reactivity

  live(opts: { onBlur?: boolean; debounce?: number } = {}): this {
    return this.mutate({ live: opts } as Partial<TConfig>);
  }

  afterStateUpdated(fn: (ctx: UpdateContext<TValue>) => void): this {
    return this.mutate({
      afterStateUpdated: fn as (ctx: UpdateContext<never>) => void,
    } as Partial<TConfig>);
  }

  // ------------------------------------------------------------ escape hatch

  customComponent(component: FieldControl): this {
    return this.mutate({ custom: component } as Partial<TConfig>);
  }

  // -------------------------------------------------------------- resolution

  resolveLabel(ctx: FieldContext): string {
    return resolveValue(this.config.label, ctx) ?? labelize(this.config.name);
  }

  isRequired(ctx: FieldContext): boolean {
    return resolveValue(this.config.validation.required, ctx) === true;
  }

  isDisabled(ctx: FieldContext): boolean {
    if (ctx.operation === 'view') return true;
    if (this.config.disabledOn?.includes(ctx.operation)) return true;
    return resolveValue(this.config.disabled, ctx) === true;
  }

  isReadOnly(ctx: FieldContext): boolean {
    return resolveValue(this.config.readOnly, ctx) === true;
  }

  /** Whether the field's value should be included in the submitted payload. */
  shouldDehydrate(state: unknown): boolean {
    const rule = this.config.dehydratedRule;
    if (rule === undefined) return true;
    return typeof rule === 'function' ? rule(state) : rule;
  }
}

export type AnyFieldResolver = Resolver<unknown>;
