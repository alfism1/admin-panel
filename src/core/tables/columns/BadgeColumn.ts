import type { RecordShape } from '@/core/data/types';
import type { IconSpec } from '@/core/ui/icon';
import type { BadgeTone } from '@/core/ui/misc';
import { BadgeCell } from '../cells/BadgeCell';
import { Column, type ColumnConfig } from '../Column';
import type { ColumnCell } from '../types';

export type BadgeColorMap = Record<string, BadgeTone>;

export interface BadgeColumnConfig extends ColumnConfig {
  colorMap?: BadgeColorMap | ((state: unknown, record: RecordShape) => BadgeTone);
  iconMap?: Record<string, IconSpec>;
}

export class BadgeColumn extends Column<BadgeColumnConfig> {
  static make(name: string): BadgeColumn {
    return new BadgeColumn({ name });
  }

  get cell(): ColumnCell {
    return BadgeCell as ColumnCell;
  }

  colors(map: BadgeColorMap | ((state: unknown, record: RecordShape) => BadgeTone)): this {
    return this.mutate({ colorMap: map });
  }

  icons(map: Record<string, IconSpec>): this {
    return this.mutate({ iconMap: map });
  }
}
