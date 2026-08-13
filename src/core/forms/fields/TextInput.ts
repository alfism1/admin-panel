import type * as React from 'react';
import { TextInputControl } from '../controls/TextInputControl';
import { Field, type FieldConfig } from '../Field';
import type { FieldControl, ValueType } from '../types';

export interface TextInputConfig extends FieldConfig {
  inputType: React.HTMLInputTypeAttribute;
  revealable?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Digit mask such as `9999-9999`; `9` accepts a digit, `a` a letter. */
  mask?: string;
  step?: number;
}

export class TextInput extends Field<string, TextInputConfig> {
  readonly valueType: ValueType = 'string';

  static make(name: string): TextInput {
    return new TextInput({ name, validation: {}, inputType: 'text' });
  }

  get control(): FieldControl {
    return TextInputControl as FieldControl;
  }

  type(htmlType: React.HTMLInputTypeAttribute): this {
    return this.mutate({ inputType: htmlType });
  }

  password(): this {
    return this.mutate({ inputType: 'password' });
  }

  revealable(value = true): this {
    return this.mutate({ revealable: value });
  }

  email(): this {
    return this.mutate({ inputType: 'email' }).withValidation({ email: true });
  }

  tel(): this {
    return this.mutate({ inputType: 'tel' });
  }

  url(): this {
    return this.mutate({ inputType: 'url' }).withValidation({ url: true });
  }

  numeric(step?: number): this {
    return this.mutate({ inputType: 'number', step }).withValidation({ numeric: true });
  }

  prefix(node: React.ReactNode): this {
    return this.mutate({ prefix: node });
  }

  suffix(node: React.ReactNode): this {
    return this.mutate({ suffix: node });
  }

  mask(pattern: string): this {
    return this.mutate({ mask: pattern });
  }
}
