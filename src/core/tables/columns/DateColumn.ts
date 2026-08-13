import { DateCell } from '../cells/DateCell';
import { Column, type ColumnConfig } from '../Column';
import type { ColumnCell } from '../types';

export interface DateColumnConfig extends ColumnConfig {
  format?: string;
  relative?: boolean;
  timezone?: string;
}

export class DateColumn extends Column<DateColumnConfig> {
  static make(name: string): DateColumn {
    return new DateColumn({ name, format: 'dd MMM yyyy' });
  }

  get cell(): ColumnCell {
    return DateCell as ColumnCell;
  }

  dateFormat(format: string): this {
    return this.mutate({ format, relative: false });
  }

  dateTimeFormat(format = 'dd MMM yyyy HH:mm'): this {
    return this.mutate({ format, relative: false });
  }

  /** Renders "2 hours ago" instead of an absolute date. */
  since(value = true): this {
    return this.mutate({ relative: value });
  }

  timezone(zone: string): this {
    return this.mutate({ timezone: zone });
  }
}
