import { ToggleControl } from '../controls/BooleanControls';
import { Field } from '../Field';
import type { FieldControl, ValueType } from '../types';
import type { BooleanFieldConfig, BooleanTone } from './Checkbox';

export class Toggle extends Field<boolean, BooleanFieldConfig> {
  readonly valueType: ValueType = 'boolean';

  static make(name: string): Toggle {
    return new Toggle({ name, validation: {}, defaultValue: false });
  }

  get control(): FieldControl {
    return ToggleControl as FieldControl;
  }

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
