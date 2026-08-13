import type * as React from 'react';
import type { Action } from '@/core/actions/Action';
import type { AuthUser } from '@/core/auth/types';
import type { RecordShape } from '@/core/data/types';
import type { IconSpec } from '@/core/ui/icon';
import type { Column, ColumnConfig } from './Column';
import type { Filter } from './filters/Filter';

export interface TableContext {
  user: AuthUser | null;
  can: (permission: string) => boolean;
}

export interface ColumnRenderProps<TConfig extends ColumnConfig = ColumnConfig> {
  config: TConfig;
  value: unknown;
  record: RecordShape;
}

/**
 * Cells are written against their own config type, then stored erased so the
 * table can hold any column. Each column class does the one narrowing cast.
 */
export type ColumnCell = React.ComponentType<ColumnRenderProps>;

export type ColumnAlignment = 'start' | 'center' | 'end';

export interface EmptyStateOptions {
  heading?: string;
  description?: string;
  icon?: IconSpec;
}

export interface TableSortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface TableSchema {
  columns: Column[];
  filters?: Filter[];
  /** Per-row actions rendered at the end of each row. */
  actions?: Action[];
  bulkActions?: Action[];
  /** Extra buttons beside the automatic Create button. */
  headerActions?: Action[];
  defaultSort?: TableSortState;
  perPageOptions?: number[];
  defaultPerPage?: number;
  striped?: boolean;
  /** Auto-refetch interval in milliseconds. */
  poll?: number;
  emptyState?: EmptyStateOptions;
  /** Makes the whole row clickable. */
  recordUrl?: (record: RecordShape) => string;
}

export interface TableQueryState {
  page: number;
  perPage: number;
  search: string;
  sort: TableSortState | null;
  filters: Record<string, string>;
  hiddenColumns: string[];
}

export interface FilterRenderProps {
  filter: Filter;
  value: string;
  onChange: (value: string) => void;
}

export type FilterControl = React.ComponentType<FilterRenderProps>;
