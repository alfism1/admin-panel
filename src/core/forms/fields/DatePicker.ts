import { DatePickerControl } from '../controls/DatePickerControl';
import { Field, type FieldConfig } from '../Field';
import type { FieldControl, ValueType } from '../types';

export interface DatePickerConfig extends FieldConfig {
  withTime?: boolean;
  minDate?: Date;
  maxDate?: Date;
  displayFormat?: string;
  useNative?: boolean;
}

/** Stores an ISO string so the value survives JSON round-trips unchanged. */
export class DatePicker extends Field<string | null, DatePickerConfig> {
  readonly valueType: ValueType = 'date';

  static make(name: string): DatePicker {
    return new DatePicker({ name, validation: {}, displayFormat: 'dd MMM yyyy' });
  }

  get control(): FieldControl {
    return DatePickerControl as FieldControl;
  }

  time(value = true): this {
    return this.mutate({ withTime: value, displayFormat: value ? 'dd MMM yyyy HH:mm' : undefined });
  }

  minDate(date: Date): this {
    return this.mutate({ minDate: date });
  }

  maxDate(date: Date): this {
    return this.mutate({ maxDate: date });
  }

  displayFormat(format: string): this {
    return this.mutate({ displayFormat: format });
  }

  native(value = true): this {
    return this.mutate({ useNative: value });
  }
}
