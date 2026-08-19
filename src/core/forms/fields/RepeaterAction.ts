import type { ActionColor, ConfirmationOptions } from '@/core/actions/types';
import type { FieldContext, FormValues } from '../types';
import type { IconSpec } from '@/core/ui/icon';
import { labelize } from '@/lib/labelize';

/**
 * What an item action can do. Core's `Action` is built around a persisted
 * record and the data provider; a repeater item is neither, so it gets its own
 * context — everything here edits form state and nothing else.
 */
export interface RepeaterActionContext {
  item: FormValues;
  index: number;
  items: unknown[];
  /** Replaces this item's value. */
  set: (value: unknown) => void;
  /** Replaces the whole array. */
  replace: (items: unknown[]) => void;
  remove: () => void;
  /** The repeater's own resolver context, for `get`/`set` on the wider form. */
  field: FieldContext;
}

export type ItemPredicate = boolean | ((item: FormValues, index: number) => boolean);
export type ItemLabel = string | ((item: FormValues, index: number) => string);

export interface RepeaterActionConfig {
  name: string;
  label?: ItemLabel;
  icon?: IconSpec;
  color?: ActionColor;
  tooltip?: string;
  /** Item controls render icon-only; the add button does not. */
  iconOnly?: boolean;
  visible?: ItemPredicate;
  disabled?: ItemPredicate;
  authorization?: string | ((item: FormValues, index: number) => boolean);
  confirmation?: ConfirmationOptions | false;
  handler?: (ctx: RepeaterActionContext) => void | Promise<void>;
}

/** Mirrors core's `Action` surface, minus everything that needs a record. */
export class RepeaterAction {
  protected config: RepeaterActionConfig;

  protected constructor(config: RepeaterActionConfig) {
    this.config = config;
  }

  static make(name: string): RepeaterAction {
    return new RepeaterAction({ name });
  }

  get definition(): Readonly<RepeaterActionConfig> {
    return this.config;
  }

  get name(): string {
    return this.config.name;
  }

  protected mutate(patch: Partial<RepeaterActionConfig>): this {
    const next: this = Object.create(Object.getPrototypeOf(this) as object);
    Object.assign(next, this);
    (next as unknown as { config: RepeaterActionConfig }).config = { ...this.config, ...patch };
    return next;
  }

  label(value: ItemLabel): this {
    return this.mutate({ label: value });
  }

  icon(value: IconSpec): this {
    return this.mutate({ icon: value });
  }

  iconOnly(value = true): this {
    return this.mutate({ iconOnly: value });
  }

  color(value: ActionColor): this {
    return this.mutate({ color: value });
  }

  tooltip(value: string): this {
    return this.mutate({ tooltip: value });
  }

  visible(value: ItemPredicate): this {
    return this.mutate({ visible: value });
  }

  disabled(value: ItemPredicate): this {
    return this.mutate({ disabled: value });
  }

  authorize(value: string | ((item: FormValues, index: number) => boolean)): this {
    return this.mutate({ authorization: value });
  }

  requiresConfirmation(options: ConfirmationOptions | false = {}): this {
    return this.mutate({ confirmation: options });
  }

  action(handler: (ctx: RepeaterActionContext) => void | Promise<void>): this {
    return this.mutate({ handler });
  }

  resolveLabel(item: FormValues, index: number): string {
    const { label } = this.config;
    if (typeof label === 'function') return label(item, index);
    return label ?? labelize(this.config.name);
  }

  isVisible(item: FormValues, index: number): boolean {
    const { visible } = this.config;
    if (visible === undefined) return true;
    return typeof visible === 'function' ? visible(item, index) : visible;
  }

  isDisabled(item: FormValues, index: number): boolean {
    const { disabled } = this.config;
    if (disabled === undefined) return false;
    return typeof disabled === 'function' ? disabled(item, index) : disabled;
  }

  isAuthorized(item: FormValues, index: number, can: (permission: string) => boolean): boolean {
    const rule = this.config.authorization;
    if (!rule) return true;
    return typeof rule === 'function' ? rule(item, index) : can(rule);
  }
}

/** What `.addAction()`, `.deleteAction()` and friends receive. */
export type RepeaterActionModifier = (action: RepeaterAction) => RepeaterAction;

export function applyModifier(
  action: RepeaterAction,
  modifier: RepeaterActionModifier | undefined,
): RepeaterAction {
  return modifier ? modifier(action) : action;
}
