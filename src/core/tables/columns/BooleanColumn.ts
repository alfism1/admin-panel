import type { IconSpec } from '@/core/ui/icon';
import { BooleanCell } from '../cells/BooleanCell';
import { Column, type ColumnConfig } from '../Column';
import type { ColumnCell } from '../types';

export type BooleanTone = 'success' | 'danger' | 'warning' | 'gray' | 'primary';

export interface BooleanColumnConfig extends ColumnConfig {
  trueIcon?: IconSpec;
  falseIcon?: IconSpec;
  trueTone?: BooleanTone;
  falseTone?: BooleanTone;
}

export class BooleanColumn extends Column<BooleanColumnConfig> {
  static make(name: string): BooleanColumn {
    return new BooleanColumn({ name, align: 'center' });
  }

  get cell(): ColumnCell {
    return BooleanCell as ColumnCell;
  }

  trueIcon(icon: IconSpec): this {
    return this.mutate({ trueIcon: icon });
  }

  falseIcon(icon: IconSpec): this {
    return this.mutate({ falseIcon: icon });
  }

  trueColor(tone: BooleanTone): this {
    return this.mutate({ trueTone: tone });
  }

  falseColor(tone: BooleanTone): this {
    return this.mutate({ falseTone: tone });
  }
}
