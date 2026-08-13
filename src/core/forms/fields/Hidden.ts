import { Field, type FieldConfig } from '../Field';
import type { FieldControl, ValueType } from '../types';

export type HiddenValue = string | number | boolean | null;

const HiddenControl: FieldControl = () => null;

/** Carries a value through the form without rendering anything. */
export class Hidden extends Field<HiddenValue, FieldConfig> {
  readonly valueType: ValueType = 'unknown';

  static make(name: string): Hidden {
    return new Hidden({ name, validation: {} });
  }

  get control(): FieldControl {
    return HiddenControl;
  }

  get layoutMode(): 'bare' {
    return 'bare';
  }
}
