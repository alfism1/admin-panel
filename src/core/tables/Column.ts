import type * as React from 'react';
import type { RecordShape } from '@/core/data/types';
import { labelize } from '@/lib/labelize';
import type { ColumnAlignment, ColumnCell, TableContext } from './types';

export interface ColumnConfig {
  name: string;
  label?: string;
  sortable?: boolean;
  sortColumn?: string;
  searchable?: boolean;
  searchColumn?: string;
  toggleable?: boolean;
  hiddenByDefault?: boolean;
  visible?: boolean | ((ctx: TableContext) => boolean);
  authorization?: string;
  align?: ColumnAlignment;
  width?: string;
  wrap?: boolean;
  tooltip?: (record: RecordShape) => string;
  urlResolver?: (record: RecordShape) => string;
  openInNewTab?: boolean;
  onClick?: (record: RecordShape) => void;
  formatState?: (state: unknown, record: RecordShape) => React.ReactNode;
  fallback?: string;
  placeholder?: string;
  custom?: ColumnCell;
}

/** Base class for table columns. `make()` accepts dot-notation: `role.name`. */
export abstract class Column<TConfig extends ColumnConfig = ColumnConfig> {
  protected config: TConfig;

  protected constructor(config: TConfig) {
    this.config = config;
  }

  abstract get cell(): ColumnCell;

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

  sortable(value: boolean | { column?: string } = true): this {
    if (typeof value === 'boolean') return this.mutate({ sortable: value } as Partial<TConfig>);
    return this.mutate({ sortable: true, sortColumn: value.column } as Partial<TConfig>);
  }

  searchable(value: boolean | { column?: string } = true): this {
    if (typeof value === 'boolean') return this.mutate({ searchable: value } as Partial<TConfig>);
    return this.mutate({ searchable: true, searchColumn: value.column } as Partial<TConfig>);
  }

  toggleable(options: { hiddenByDefault?: boolean } = {}): this {
    return this.mutate({
      toggleable: true,
      hiddenByDefault: options.hiddenByDefault,
    } as Partial<TConfig>);
  }

  visible(value: boolean | ((ctx: TableContext) => boolean)): this {
    return this.mutate({ visible: value } as Partial<TConfig>);
  }

  authorize(permission: string): this {
    return this.mutate({ authorization: permission } as Partial<TConfig>);
  }

  alignStart(): this {
    return this.mutate({ align: 'start' } as Partial<TConfig>);
  }

  alignCenter(): this {
    return this.mutate({ align: 'center' } as Partial<TConfig>);
  }

  alignEnd(): this {
    return this.mutate({ align: 'end' } as Partial<TConfig>);
  }

  width(value: string): this {
    return this.mutate({ width: value } as Partial<TConfig>);
  }

  wrap(value = true): this {
    return this.mutate({ wrap: value } as Partial<TConfig>);
  }

  tooltip(fn: (record: RecordShape) => string): this {
    return this.mutate({ tooltip: fn } as Partial<TConfig>);
  }

  url(fn: (record: RecordShape) => string, options: { openInNewTab?: boolean } = {}): this {
    return this.mutate({
      urlResolver: fn,
      openInNewTab: options.openInNewTab,
    } as Partial<TConfig>);
  }

  action(fn: (record: RecordShape) => void): this {
    return this.mutate({ onClick: fn } as Partial<TConfig>);
  }

  formatStateUsing(fn: (state: unknown, record: RecordShape) => React.ReactNode): this {
    return this.mutate({ formatState: fn } as Partial<TConfig>);
  }

  /** Shown when the value is null or empty. */
  default(value: string): this {
    return this.mutate({ fallback: value } as Partial<TConfig>);
  }

  placeholder(value: string): this {
    return this.mutate({ placeholder: value } as Partial<TConfig>);
  }

  customComponent(component: ColumnCell): this {
    return this.mutate({ custom: component } as Partial<TConfig>);
  }

  resolveLabel(): string {
    return this.config.label ?? labelize(this.config.name);
  }

  isAllowed(ctx: TableContext): boolean {
    const { authorization, visible } = this.config;
    if (authorization && !ctx.can(authorization)) return false;
    if (visible === undefined) return true;
    return typeof visible === 'function' ? visible(ctx) : visible;
  }
}
