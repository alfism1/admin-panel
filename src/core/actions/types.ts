import type { NavigateFunction } from 'react-router';
import type { RecordShape } from '@/core/data/types';
import type { FormValues } from '@/core/forms/types';
import type { DialogWidth } from '@/core/ui/dialog';
import type { IconSpec } from '@/core/ui/icon';
import type { NotifyOptions } from '@/core/ui/notify';

export type ActionColor = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'gray';
export type ActionSize = 'sm' | 'md' | 'lg';
export type { DialogWidth };

export interface ActionContext {
  /** Single record for row actions, `null` for header actions. */
  record: RecordShape | null;
  /** Selected records for bulk actions. */
  records: RecordShape[];
  data: FormValues;
  refresh: () => void;
  close: () => void;
  notify: (options: NotifyOptions) => void;
  navigate: NavigateFunction;
}

export interface ConfirmationOptions {
  heading?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: IconSpec;
}

export type BuiltinAction =
  | 'view'
  | 'edit'
  | 'delete'
  | 'create'
  | 'deleteBulk'
  | 'replicate'
  | 'replicateBulk'
  | 'exportBulk';

export interface ReplicateOptions {
  /** Dropped from the copy on top of the id and the timestamps. */
  exclude: string[];
  /** Last chance to change the copy before it is created. */
  mutate?: (replica: RecordShape, source: RecordShape) => RecordShape | Promise<RecordShape>;
  /** Where to go once the copy exists; `false` stays on the page. */
  redirect: 'edit' | 'view' | false;
}

export interface ExportOptions {
  /** Column key (dot-notation allowed) to CSV header. Defaults to the table's columns. */
  columns?: Record<string, string>;
  fileName?: string | (() => string);
  delimiter?: string;
}
