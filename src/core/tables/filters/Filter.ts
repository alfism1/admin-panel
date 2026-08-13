import { labelize } from '@/lib/labelize';
import type { FilterControl } from '../types';

export interface FilterConfig {
  name: string;
  label?: string;
  placeholder?: string;
  authorization?: string;
}

/**
 * Filters serialize to a single query-string value so table state stays
 * shareable. `toQuery` maps that value onto `ListParams.filters`.
 */
export abstract class Filter<TConfig extends FilterConfig = FilterConfig> {
  protected config: TConfig;

  protected constructor(config: TConfig) {
    this.config = config;
  }

  abstract get control(): FilterControl;

  get definition(): Readonly<TConfig> {
    return this.config;
  }

  get name(): string {
    return this.config.name;
  }

  protected mutate(patch: Partial<TConfig>): this {
    const next: this = Object.create(Object.getPrototypeOf(this) as object);
    Object.assign(next, this);
    (next as unknown as { config: TConfig }).config = { ...this.config, ...patch };
    return next;
  }

  label(value: string): this {
    return this.mutate({ label: value } as Partial<TConfig>);
  }

  placeholder(value: string): this {
    return this.mutate({ placeholder: value } as Partial<TConfig>);
  }

  authorize(permission: string): this {
    return this.mutate({ authorization: permission } as Partial<TConfig>);
  }

  resolveLabel(): string {
    return this.config.label ?? labelize(this.config.name);
  }

  isEmpty(value: string): boolean {
    return value === '';
  }

  /** Converts the serialized value into whatever the data provider expects. */
  toQuery(value: string): unknown {
    return value;
  }

  /** Human-readable summary shown on the active-filter chip. */
  describe(value: string): string {
    return value;
  }
}
