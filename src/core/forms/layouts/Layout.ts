import type * as React from 'react';
import { SchemaComponent, type BaseComponentConfig } from '../SchemaComponent';
import type { FormComponent, LayoutRenderProps } from '../types';

export interface ResponsiveColumns {
  sm?: number;
  md?: number;
  lg?: number;
}

export interface LayoutConfig extends BaseComponentConfig {
  id?: string;
  schema: FormComponent[];
  columns?: number | ResponsiveColumns;
}

export abstract class Layout<
  TConfig extends LayoutConfig = LayoutConfig,
> extends SchemaComponent<TConfig> {
  readonly kind = 'layout' as const;

  abstract get component(): React.ComponentType<LayoutRenderProps>;

  get children(): FormComponent[] {
    return this.config.schema;
  }

  schema(components: FormComponent[]): this {
    return this.mutate({ schema: components } as Partial<TConfig>);
  }

  columns(value: number | ResponsiveColumns): this {
    return this.mutate({ columns: value } as Partial<TConfig>);
  }
}

/** Tailwind needs literal class names, so map the supported column counts. */
export const GRID_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  6: 'sm:grid-cols-3 lg:grid-cols-6',
  12: 'sm:grid-cols-6 lg:grid-cols-12',
};

export const COLUMN_SPANS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-1 sm:col-span-2',
  3: 'col-span-1 sm:col-span-2 lg:col-span-3',
  4: 'col-span-1 sm:col-span-2 lg:col-span-4',
  6: 'col-span-1 sm:col-span-3 lg:col-span-6',
};

const SM_COLUMNS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  6: 'sm:grid-cols-6',
};
const MD_COLUMNS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  6: 'md:grid-cols-6',
};
const LG_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
};

export function gridClassName(columns: number | ResponsiveColumns | undefined): string {
  if (!columns) return 'grid-cols-1';
  if (typeof columns === 'number') return GRID_COLUMNS[columns] ?? 'grid-cols-1';
  return [
    'grid-cols-1',
    columns.sm ? SM_COLUMNS[columns.sm] : '',
    columns.md ? MD_COLUMNS[columns.md] : '',
    columns.lg ? LG_COLUMNS[columns.lg] : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function spanClassName(span: number | 'full' | undefined): string {
  if (span === 'full') return 'col-span-full';
  if (typeof span === 'number') return COLUMN_SPANS[span] ?? 'col-span-1';
  return 'col-span-1';
}
