import { DateRangeFilterControl } from './controls/DateRangeFilterControl';
import { Filter, type FilterConfig } from './Filter';
import type { FilterControl } from '../types';

export interface DateRangeFilterConfig extends FilterConfig {
  withTime?: boolean;
}

/** Serializes as `from..to`; either side may be omitted. */
export class DateRangeFilter extends Filter<DateRangeFilterConfig> {
  static make(name: string): DateRangeFilter {
    return new DateRangeFilter({ name });
  }

  get control(): FilterControl {
    return DateRangeFilterControl;
  }

  time(value = true): this {
    return this.mutate({ withTime: value });
  }

  isEmpty(value: string): boolean {
    return value === '' || value === '..';
  }

  describe(value: string): string {
    const [from, to] = value.split('..');
    if (from && to) return `${from} → ${to}`;
    if (from) return `after ${from}`;
    return `before ${to}`;
  }
}
