import type { ListParams } from '@/core/data/types';
import { SelectControl } from '../controls/SelectControl';
import { Field, type FieldConfig } from '../Field';
import type { FieldControl, MaybeResolver, ValueType } from '../types';

export interface SelectOption {
  value: string | number;
  label: string;
  description?: string;
  disabled?: boolean;
}

export type SelectOptionsInput = Record<string, string> | SelectOption[];

export type SelectValue = string | number | Array<string | number> | null;

export interface RelationshipConfig {
  resource: string;
  titleKey: string;
  valueKey?: string;
  /** Extra list params merged into every option lookup, e.g. a status filter. */
  query?: Partial<ListParams>;
}

export interface SelectConfig extends FieldConfig {
  options?: MaybeResolver<SelectOptionsInput>;
  multiple?: boolean;
  searchable?: boolean;
  preload?: boolean;
  relationship?: RelationshipConfig;
  native?: boolean;
}

export class Select extends Field<SelectValue, SelectConfig> {
  readonly valueType: ValueType = 'unknown';

  static make(name: string): Select {
    return new Select({ name, validation: {} });
  }

  get control(): FieldControl {
    return SelectControl as FieldControl;
  }

  options(value: MaybeResolver<SelectOptionsInput>): this {
    return this.mutate({ options: value });
  }

  multiple(value = true): this {
    return this.mutate({ multiple: value });
  }

  searchable(value = true): this {
    return this.mutate({ searchable: value });
  }

  /** Fetches the whole option list up front instead of searching server-side. */
  preload(value = true): this {
    return this.mutate({ preload: value });
  }

  relationship(config: RelationshipConfig): this {
    return this.mutate({ relationship: config });
  }

  /** Renders a plain `<select>` — useful for short, static option lists. */
  native(value = true): this {
    return this.mutate({ native: value });
  }
}

export function normalizeOptions(input: SelectOptionsInput | undefined): SelectOption[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return Object.entries(input).map(([value, label]) => ({ value, label }));
}
