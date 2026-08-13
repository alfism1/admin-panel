import type * as React from 'react';
import type { DataProvider, RecordShape } from '@/core/data/types';
import type { FormComponent } from '@/core/forms/types';
import type { Column } from '@/core/tables/Column';
import type { TableSchema } from '@/core/tables/types';
import type { IconSpec } from '@/core/ui/icon';

export interface ResourcePermissions {
  viewAny?: string;
  view?: string;
  create?: string;
  update?: string;
  delete?: string;
}

export interface ResourceNavigation {
  label?: string;
  icon?: IconSpec;
  group?: string;
  sort?: number;
  /** Rendered as a pill next to the label; may call hooks. */
  badge?: () => React.ReactNode;
}

export interface ResourceLabels {
  singular: string;
  plural: string;
}

export type PageOverride = boolean | React.ComponentType;

export interface ResourcePages {
  list?: PageOverride;
  create?: PageOverride;
  edit?: PageOverride;
  view?: PageOverride;
}

export interface ResourceDefinition {
  /** Unique key, also used as the API path segment. */
  name: string;
  model?: string;
  route?: string;
  navigation?: ResourceNavigation | false;
  labels?: Partial<ResourceLabels>;
  recordTitleKey?: string;
  permissions?: ResourcePermissions;
  form?: FormComponent[];
  table: TableSchema;
  /**
   * Read-only entries for the view page. Columns are reused here so a value is
   * formatted the same way it is in the table. Defaults to `table.columns`.
   */
  infolist?: Column[];
  pages?: ResourcePages;
  dataProvider?: DataProvider;
}

/** A definition with every default filled in. */
export interface Resource extends ResourceDefinition {
  route: string;
  labels: ResourceLabels;
  recordTitleKey: string;
  permissions: ResourcePermissions;
  pages: Required<ResourcePages>;
  navigation: ResourceNavigation | false;
  routes: {
    list: string;
    create: string;
    view: (record: RecordShape) => string;
    edit: (record: RecordShape) => string;
  };
  recordTitle: (record: RecordShape | null) => string;
}
