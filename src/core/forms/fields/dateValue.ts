import {
  format as formatDate,
  isValid,
  parse as parseWithFormat,
  parseISO,
  startOfDay,
} from 'date-fns';

/** Every way a date may be handed to the builder — a bound, a default, a disabled day. */
export type DateBound = Date | string | number;

/**
 * The slice of `DatePickerConfig` that decides how a `Date` becomes the stored
 * string and back. Kept in its own module so both the field and its control can
 * read it without importing each other at runtime.
 */
export interface DateValueConfig {
  withTime?: boolean;
  withSeconds?: boolean;
  timeOnly?: boolean;
  /** date-fns pattern for the stored string. ISO 8601 when omitted. */
  storeFormat?: string;
  displayFormat?: string;
}

/**
 * The pattern the value is stored as, or `undefined` for ISO 8601.
 *
 * Time-only pickers always store a wall-clock string: an ISO instant would drag
 * along a meaningless date, and reading it back in another timezone would shift
 * the time.
 */
export function storePattern(config: DateValueConfig): string | undefined {
  if (config.storeFormat) return config.storeFormat;
  if (config.timeOnly) return config.withSeconds ? 'HH:mm:ss' : 'HH:mm';
  return undefined;
}

export function displayPattern(config: DateValueConfig): string {
  if (config.displayFormat) return config.displayFormat;
  if (config.timeOnly) return config.withSeconds ? 'HH:mm:ss' : 'HH:mm';
  if (config.withTime) return config.withSeconds ? 'dd MMM yyyy HH:mm:ss' : 'dd MMM yyyy HH:mm';
  return 'dd MMM yyyy';
}

export function nativeInputType(config: DateValueConfig): 'date' | 'datetime-local' | 'time' {
  if (config.timeOnly) return 'time';
  return config.withTime ? 'datetime-local' : 'date';
}

/** `<input type="date|datetime-local|time">` only accepts these exact patterns. */
export function nativeInputPattern(config: DateValueConfig): string {
  const seconds = config.withSeconds ? ':ss' : '';
  if (config.timeOnly) return `HH:mm${seconds}`;
  if (config.withTime) return `yyyy-MM-dd'T'HH:mm${seconds}`;
  return 'yyyy-MM-dd';
}

/**
 * Reads a stored value back into a `Date`. Tolerant on purpose: a record loaded
 * from the API may still carry a full ISO timestamp for a field that now stores
 * a narrower format.
 */
export function parseDateValue(value: unknown, config: DateValueConfig = {}): Date | null {
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === 'number') {
    const fromEpoch = new Date(value);
    return isValid(fromEpoch) ? fromEpoch : null;
  }
  if (typeof value !== 'string' || value.trim() === '') return null;

  const pattern = storePattern(config);
  if (pattern) {
    const exact = parseWithFormat(value, pattern, startOfDay(new Date()));
    if (isValid(exact)) return exact;
  }

  // `parseISO` reads a bare `yyyy-MM-dd` as local midnight, where `new Date()`
  // would read it as UTC and shift the day for anyone west of Greenwich.
  const iso = parseISO(value);
  if (isValid(iso)) return iso;

  const loose = new Date(value);
  return isValid(loose) ? loose : null;
}

export function serializeDate(date: Date, config: DateValueConfig = {}): string {
  const pattern = storePattern(config);
  return pattern ? formatDate(date, pattern) : date.toISOString();
}

export function coerceDate(value: DateBound | null | undefined): Date | null {
  return value === null || value === undefined ? null : parseDateValue(value);
}

/** Minutes since midnight — how time-only values are compared. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
