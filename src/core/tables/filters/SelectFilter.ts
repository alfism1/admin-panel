import type { RelationshipConfig, SelectOptionsInput } from '@/core/forms/fields/Select';
import { normalizeOptions } from '@/core/forms/fields/Select';
import { SelectFilterControl } from './controls/SelectFilterControl';
import { Filter, type FilterConfig } from './Filter';
import type { FilterControl } from '../types';

export interface SelectFilterConfig extends FilterConfig {
  options?: SelectOptionsInput;
  relationship?: RelationshipConfig;
  multiple?: boolean;
  searchable?: boolean;
}

export class SelectFilter extends Filter<SelectFilterConfig> {
  static make(name: string): SelectFilter {
    return new SelectFilter({ name });
  }

  get control(): FilterControl {
    return SelectFilterControl;
  }

  options(value: SelectOptionsInput): this {
    return this.mutate({ options: value });
  }

  relationship(config: RelationshipConfig): this {
    return this.mutate({ relationship: config, searchable: true });
  }

  multiple(value = true): this {
    return this.mutate({ multiple: value });
  }

  searchable(value = true): this {
    return this.mutate({ searchable: value });
  }

  describe(value: string): string {
    const values = value.split(',').filter(Boolean);
    const labels = new Map(
      normalizeOptions(this.config.options).map((option) => [String(option.value), option.label]),
    );
    if (values.length > 2) return `${values.length} selected`;
    return values.map((item) => labels.get(item) ?? item).join(', ');
  }
}
