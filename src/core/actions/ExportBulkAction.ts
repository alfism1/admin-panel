import type { RecordShape } from '@/core/data/types';
import type { Resource } from '@/core/resources/types';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import { labelize } from '@/lib/labelize';
import { BulkAction } from './BulkAction';
import type { ActionConfig } from './Action';
import type { ExportOptions } from './types';

function patch(config: ActionConfig, options: Partial<ExportOptions>): Partial<ActionConfig> {
  return { export: { ...config.export, ...options } };
}

/** Writes the selected records to a CSV file the browser downloads. */
export class ExportBulkAction extends BulkAction {
  static make(): ExportBulkAction {
    return new ExportBulkAction({
      name: 'exportSelected',
      builtin: 'exportBulk',
      label: 'Export selected',
      icon: 'download',
      color: 'secondary',
      size: 'sm',
      export: {},
    });
  }

  /** Column key to header, replacing the table's columns as the export shape. */
  columns(map: Record<string, string>): this {
    return this.mutate(patch(this.config, { columns: map }));
  }

  fileName(value: string | (() => string)): this {
    return this.mutate(patch(this.config, { fileName: value }));
  }

  /** `;` for locales where Excel splits on semicolons. */
  delimiter(value: string): this {
    return this.mutate(patch(this.config, { delimiter: value }));
  }
}

/** Table columns give the export the same shape and headers as the screen. */
function columnsFor(resource: Resource, rows: readonly RecordShape[]): CsvColumn[] {
  const declared = resource.table.columns.map((column) => ({
    key: column.name,
    header: column.resolveLabel(),
  }));
  if (declared.length > 0) return declared;

  const keys = new Set(rows.flatMap((row) => Object.keys(row)));
  return [...keys].map((key) => ({ key, header: labelize(key) }));
}

export function runExport(
  resource: Resource,
  rows: RecordShape[],
  options: ExportOptions | undefined,
): void {
  if (rows.length === 0) throw new Error('There is nothing to export.');

  const { columns, fileName, delimiter } = { ...options };
  const shape = columns
    ? Object.entries(columns).map(([key, header]) => ({ key, header }))
    : columnsFor(resource, rows);
  const name =
    (typeof fileName === 'function' ? fileName() : fileName) ??
    `${resource.name}-${new Date().toISOString().slice(0, 10)}.csv`;

  downloadCsv(name, toCsv(rows, shape, delimiter));
}
