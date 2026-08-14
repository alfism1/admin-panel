import { format as formatDate, startOfDay } from 'date-fns';
import { DatePickerControl } from '../controls/DatePickerControl';
import { Field, type FieldConfig } from '../Field';
import { resolveValue } from '../types';
import type { FieldContext, FieldControl, MaybeResolver, Resolver, ValueType } from '../types';
import {
  coerceDate,
  displayPattern,
  minutesOfDay,
  parseDateValue,
  serializeDate,
  type DateBound,
  type DateValueConfig,
} from './dateValue';

export type DateBoundInput = MaybeResolver<DateBound>;

export interface DatePickerConfig extends FieldConfig, DateValueConfig {
  minDate?: DateBoundInput;
  maxDate?: DateBoundInput;
  disabledDates?: MaybeResolver<DateBound[]>;
  minutesStep?: number;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  useNative?: boolean;
  closeOnSelect?: boolean;
}

/**
 * Stores an ISO string by default so the value survives JSON round-trips
 * unchanged. `.format()` narrows that to a date-fns pattern when the column is
 * a bare `date` or `time` and the timezone in an ISO instant would only cause
 * drift.
 */
export class DatePicker extends Field<string | null, DatePickerConfig> {
  readonly valueType: ValueType = 'date';

  static make(name: string): DatePicker {
    return new DatePicker({ name, validation: {} });
  }

  get control(): FieldControl {
    return DatePickerControl as FieldControl;
  }

  // ------------------------------------------------------------------ shape

  time(value = true): this {
    return this.mutate({ withTime: value });
  }

  /** Implies `.time()`, and widens the stored/displayed patterns to seconds. */
  seconds(value = true): this {
    return this.mutate({
      withSeconds: value,
      withTime: value ? !this.config.timeOnly : this.config.withTime,
    });
  }

  /** A time-of-day picker with no calendar — Filament's `TimePicker`. */
  timeOnly(value = true): this {
    return this.mutate({ timeOnly: value, withTime: value ? false : this.config.withTime });
  }

  /** Granularity of the time input, in minutes. Ignored once `.seconds()` is on. */
  minutesStep(minutes: number): this {
    return this.mutate({ minutesStep: minutes });
  }

  // ----------------------------------------------------------------- format

  /** How the value is shown to the user. */
  displayFormat(format: string): this {
    return this.mutate({ displayFormat: format });
  }

  /**
   * date-fns pattern the value is *stored* as — `'yyyy-MM-dd'` for a date
   * column, `'HH:mm'` for a time column. Defaults to ISO 8601.
   */
  format(pattern: string): this {
    return this.mutate({ storeFormat: pattern });
  }

  // ----------------------------------------------------------------- bounds

  minDate(date: DateBoundInput): this {
    return this.mutate({ minDate: date });
  }

  maxDate(date: DateBoundInput): this {
    return this.mutate({ maxDate: date });
  }

  disabledDates(dates: MaybeResolver<DateBound[]>): this {
    return this.mutate({ disabledDates: dates });
  }

  // --------------------------------------------------------------- calendar

  weekStartsOn(day: 0 | 1 | 2 | 3 | 4 | 5 | 6): this {
    return this.mutate({ weekStartsOn: day });
  }

  native(value = true): this {
    return this.mutate({ useNative: value });
  }

  closeOnDateSelection(value = true): this {
    return this.mutate({ closeOnSelect: value });
  }

  // ------------------------------------------------------------------ value

  /** Accepts a `Date` or epoch as well as the stored string form. */
  default(value: MaybeResolver<DateBound | null>): this {
    const config = this.config;
    const store = (input: DateBound | null): string | null => {
      const date = coerceDate(input, config);
      return date ? serializeDate(date, config) : null;
    };

    if (typeof value === 'function') {
      const resolve = value as Resolver<DateBound | null>;
      return super.default((ctx: FieldContext) => store(resolve(ctx)));
    }
    return super.default(store(value));
  }

  // ------------------------------------------------------------- resolution

  resolveMinDate(ctx: FieldContext): Date | null {
    return coerceDate(resolveValue(this.config.minDate, ctx) ?? null, this.config);
  }

  resolveMaxDate(ctx: FieldContext): Date | null {
    return coerceDate(resolveValue(this.config.maxDate, ctx) ?? null, this.config);
  }

  resolveDisabledDates(ctx: FieldContext): Date[] {
    const dates = resolveValue(this.config.disabledDates, ctx) ?? [];
    return dates
      .map((date) => coerceDate(date, this.config))
      .filter((date): date is Date => date !== null);
  }

  /**
   * Bounds are compared at the granularity the picker actually offers, so
   * `.maxDate(new Date())` on a date-only picker still allows today.
   */
  private rank(date: Date): number {
    if (this.config.timeOnly) return minutesOfDay(date);
    if (this.config.withTime) return date.getTime();
    return startOfDay(date).getTime();
  }

  isDateDisabled(date: Date, ctx: FieldContext): boolean {
    const day = startOfDay(date).getTime();
    return this.resolveDisabledDates(ctx).some((entry) => startOfDay(entry).getTime() === day);
  }

  /** Bounds are enforced here, not only in the UI: a native input can be typed into. */
  validate(value: unknown, ctx: FieldContext, label: string): string[] {
    const date = parseDateValue(value, this.config);
    if (!date) return [`${label} must be a valid date.`];

    const pattern = displayPattern(this.config);
    const issues: string[] = [];

    const min = this.resolveMinDate(ctx);
    if (min && this.rank(date) < this.rank(min)) {
      issues.push(`${label} must be on or after ${formatDate(min, pattern)}.`);
    }

    const max = this.resolveMaxDate(ctx);
    if (max && this.rank(date) > this.rank(max)) {
      issues.push(`${label} must be on or before ${formatDate(max, pattern)}.`);
    }

    if (!this.config.timeOnly && this.isDateDisabled(date, ctx)) {
      issues.push(`${formatDate(date, pattern)} is not available.`);
    }

    return issues;
  }
}
