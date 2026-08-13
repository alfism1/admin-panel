import { TextareaControl } from '../controls/TextareaControl';
import { Field, type FieldConfig } from '../Field';
import type { FieldControl, ValueType } from '../types';

export interface TextareaConfig extends FieldConfig {
  rows: number;
  autosize?: boolean;
}

export class Textarea extends Field<string, TextareaConfig> {
  readonly valueType: ValueType = 'string';

  static make(name: string): Textarea {
    return new Textarea({ name, validation: {}, rows: 3 });
  }

  get control(): FieldControl {
    return TextareaControl as FieldControl;
  }

  rows(count: number): this {
    return this.mutate({ rows: count });
  }

  autosize(value = true): this {
    return this.mutate({ autosize: value });
  }
}
