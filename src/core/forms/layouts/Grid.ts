import type * as React from 'react';
import type { LayoutRenderProps } from '../types';
import { GridComponent } from './GridComponent';
import { Layout, type LayoutConfig } from './Layout';

export class Grid extends Layout {
  static make(columns: LayoutConfig['columns'] = 2): Grid {
    return new Grid({ schema: [], columns });
  }

  get component(): React.ComponentType<LayoutRenderProps> {
    return GridComponent;
  }
}
