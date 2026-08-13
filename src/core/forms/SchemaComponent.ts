import type { FieldContext, MaybeResolver, Operation, Resolver } from './types';
import { resolveValue } from './types';

export interface BaseComponentConfig {
  hidden?: MaybeResolver<boolean>;
  visible?: MaybeResolver<boolean>;
  hiddenOn?: Operation[];
  visibleOn?: Operation[];
  authorization?: string | Resolver<boolean>;
  columnSpan?: number | 'full';
}

/**
 * Shared behaviour for fields and layouts. Every mutator clones, so a builder
 * instance can be shared between resources without one leaking into the other.
 */
export abstract class SchemaComponent<TConfig extends BaseComponentConfig> {
  abstract readonly kind: 'field' | 'layout';

  protected config: TConfig;

  protected constructor(config: TConfig) {
    this.config = config;
  }

  get definition(): Readonly<TConfig> {
    return this.config;
  }

  protected mutate(patch: Partial<TConfig>): this {
    const next: this = Object.create(Object.getPrototypeOf(this) as object);
    Object.assign(next, this);
    (next as unknown as { config: TConfig }).config = { ...this.config, ...patch };
    return next;
  }

  hidden(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ hidden: value } as Partial<TConfig>);
  }

  visible(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ visible: value } as Partial<TConfig>);
  }

  hiddenOn(operation: Operation | Operation[]): this {
    return this.mutate({
      hiddenOn: Array.isArray(operation) ? operation : [operation],
    } as Partial<TConfig>);
  }

  visibleOn(operation: Operation | Operation[]): this {
    return this.mutate({
      visibleOn: Array.isArray(operation) ? operation : [operation],
    } as Partial<TConfig>);
  }

  authorize(permission: string | Resolver<boolean>): this {
    return this.mutate({ authorization: permission } as Partial<TConfig>);
  }

  columnSpan(span: number | 'full'): this {
    return this.mutate({ columnSpan: span } as Partial<TConfig>);
  }

  columnSpanFull(): this {
    return this.columnSpan('full');
  }

  /** True when the current user may see this component at all. */
  isAuthorized(ctx: FieldContext): boolean {
    const rule = this.config.authorization;
    if (!rule) return true;
    return typeof rule === 'function' ? rule(ctx) : ctx.can(rule);
  }

  isVisible(ctx: FieldContext): boolean {
    const { hidden, visible, hiddenOn, visibleOn } = this.config;

    if (hiddenOn?.includes(ctx.operation)) return false;
    if (visibleOn && !visibleOn.includes(ctx.operation)) return false;
    if (resolveValue(hidden, ctx) === true) return false;
    if (visible !== undefined && resolveValue(visible, ctx) !== true) return false;

    return true;
  }

  /** Rendered *and* submitted only when both gates pass. */
  isActive(ctx: FieldContext): boolean {
    return this.isAuthorized(ctx) && this.isVisible(ctx);
  }
}
