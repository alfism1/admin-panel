import { CheckboxControl } from '../controls/BooleanControls';
import { Field, type FieldConfig } from '../Field';
import type { FieldControl, ValueType } from '../types';

export type BooleanTone = 'primary' | 'success' | 'warning' | 'danger' | 'gray';

export interface BooleanFieldConfig extends FieldConfig {
  inline?: boolean;
  onTone?: BooleanTone;
  offTone?: BooleanTone;
}

export class Checkbox extends Field<boolean, BooleanFieldConfig> {
  readonly valueType: ValueType = 'boolean';

  static make(name: string): Checkbox {
    return new Checkbox({ name, validation: {}, defaultValue: false });
  }

  get control(): FieldControl {
    return CheckboxControl as FieldControl;
  }

  /** Boolean fields read better with the label beside the control. */
  get layoutMode(): 'stacked' | 'inline' {
    return this.config.inline === false ? 'stacked' : 'inline';
  }

  inline(value = true): this {
    return this.mutate({ inline: value });
  }

  onColor(tone: BooleanTone): this {
    return this.mutate({ onTone: tone });
  }

  offColor(tone: BooleanTone): this {
    return this.mutate({ offTone: tone });
  }
}
