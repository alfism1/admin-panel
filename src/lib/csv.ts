import { getPath } from './utils';

export interface CsvColumn {
  /** Dot-notation is allowed, so `author.name` reaches into an embedded record. */
  key: string;
  header: string;
}

const NEEDS_QUOTES = /["\n\r]/;
/** A cell opening with one of these is executed as a formula by Excel and Sheets. */
const FORMULA_START = /^[=+\-@\t\r]/;

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escape(value: unknown, delimiter: string): string {
  const text = stringify(value);
  // Numbers are literal, so `-5` stays `-5`; anything else that opens like a
  // formula is prefixed, because an export is opened in a spreadsheet far more
  // often than it is parsed.
  const guarded = typeof value !== 'number' && FORMULA_START.test(text) ? `'${text}` : text;
  if (!guarded.includes(delimiter) && !NEEDS_QUOTES.test(guarded)) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** RFC 4180 rows: CRLF endings, doubled quotes, quoted only where needed. */
export function toCsv(
  rows: readonly Record<string, unknown>[],
  columns: readonly CsvColumn[],
  delimiter = ',',
): string {
  const line = (cells: readonly unknown[]) =>
    cells.map((cell) => escape(cell, delimiter)).join(delimiter);

  return [
    line(columns.map((column) => column.header)),
    ...rows.map((row) => line(columns.map((column) => getPath(row, column.key)))),
  ].join('\r\n');
}

export function downloadCsv(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
