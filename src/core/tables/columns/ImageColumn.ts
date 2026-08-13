import { ImageCell } from '../cells/ImageCell';
import { Column, type ColumnConfig } from '../Column';
import type { ColumnCell } from '../types';

export interface ImageColumnConfig extends ColumnConfig {
  shape: 'circle' | 'square';
  size: number;
  stacked?: boolean;
  defaultImageUrl?: string;
}

export class ImageColumn extends Column<ImageColumnConfig> {
  static make(name: string): ImageColumn {
    return new ImageColumn({ name, shape: 'square', size: 32 });
  }

  get cell(): ColumnCell {
    return ImageCell as ColumnCell;
  }

  circular(): this {
    return this.mutate({ shape: 'circle' });
  }

  square(): this {
    return this.mutate({ shape: 'square' });
  }

  size(pixels: number): this {
    return this.mutate({ size: pixels });
  }

  /** Overlaps multiple images, for array-valued columns. */
  stacked(value = true): this {
    return this.mutate({ stacked: value });
  }

  defaultImageUrl(url: string): this {
    return this.mutate({ defaultImageUrl: url });
  }
}
