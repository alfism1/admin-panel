import type * as React from 'react';
import type { RecordShape } from '@/core/data/types';
import type { BadgeTone } from '@/core/ui/misc';
import { Column, type ColumnConfig } from '../Column';
import { TextCell } from '../cells/TextCell';
import type { ColumnCell } from '../types';

export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';
export type TextTone = 'default' | 'muted' | 'primary' | 'success' | 'warning' | 'danger';

export interface TextColumnConfig extends ColumnConfig {
  limit?: number;
  words?: number;
  weight?: TextWeight;
  tone?: TextTone;
  copyable?: boolean;
  prefix?: string;
  suffix?: string;
  numericDecimals?: number;
  money?: { currency: string; locale?: string };
  description?: { resolve: (record: RecordShape) => React.ReactNode; position: 'above' | 'below' };
  asBadge?: boolean;
  badgeTone?: BadgeTone;
}

export class TextColumn extends Column<TextColumnConfig> {
  static make(name: string): TextColumn {
    return new TextColumn({ name });
  }

  get cell(): ColumnCell {
    return TextCell as ColumnCell;
  }

  limit(characters: number): this {
    return this.mutate({ limit: characters });
  }

  words(count: number): this {
    return this.mutate({ words: count });
  }

  weight(value: TextWeight): this {
    return this.mutate({ weight: value });
  }

  color(value: TextTone): this {
    return this.mutate({ tone: value });
  }

  copyable(value = true): this {
    return this.mutate({ copyable: value });
  }

  prefix(value: string): this {
    return this.mutate({ prefix: value });
  }

  suffix(value: string): this {
    return this.mutate({ suffix: value });
  }

  numeric(options: { decimals?: number } = {}): this {
    return this.mutate({ numericDecimals: options.decimals ?? 0 });
  }

  money(currency: string, locale?: string): this {
    return this.mutate({ money: { currency, locale } });
  }

  /** Small secondary line rendered under (or over) the main value. */
  description(
    resolve: (record: RecordShape) => React.ReactNode,
    options: { position?: 'above' | 'below' } = {},
  ): this {
    return this.mutate({ description: { resolve, position: options.position ?? 'below' } });
  }

  badge(tone?: BadgeTone): this {
    return this.mutate({ asBadge: true, badgeTone: tone });
  }
}
