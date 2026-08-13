import { TernaryFilterControl } from './controls/TernaryFilterControl';
import { Filter, type FilterConfig } from './Filter';
import type { FilterControl } from '../types';

export interface TernaryFilterConfig extends FilterConfig {
  trueLabel: string;
  falseLabel: string;
  blankLabel: string;
}

/** Three-state boolean filter: any / true / false. */
export class TernaryFilter extends Filter<TernaryFilterConfig> {
  static make(name: string): TernaryFilter {
    return new TernaryFilter({ name, trueLabel: 'Yes', falseLabel: 'No', blankLabel: 'All' });
  }

  get control(): FilterControl {
    return TernaryFilterControl;
  }

  trueLabel(value: string): this {
    return this.mutate({ trueLabel: value });
  }

  falseLabel(value: string): this {
    return this.mutate({ falseLabel: value });
  }

  blankLabel(value: string): this {
    return this.mutate({ blankLabel: value });
  }

  describe(value: string): string {
    return value === 'true' ? this.config.trueLabel : this.config.falseLabel;
  }
}
