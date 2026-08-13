import type * as React from 'react';
import type { IconSpec } from '@/core/ui/icon';
import type { LayoutRenderProps } from '../types';
import { Layout, type LayoutConfig } from './Layout';
import { TabPanelComponent, TabsComponent } from './TabsComponent';

export interface TabConfig extends LayoutConfig {
  heading: string;
  icon?: IconSpec;
}

export class Tab extends Layout<TabConfig> {
  static make(heading: string): Tab {
    return new Tab({ heading, schema: [], columns: 1 });
  }

  /** Only reached if a Tab is used outside a Tabs container. */
  get component(): React.ComponentType<LayoutRenderProps> {
    return TabPanelComponent;
  }

  icon(value: IconSpec): this {
    return this.mutate({ icon: value });
  }
}

export interface TabsConfig extends LayoutConfig {
  tabs: Tab[];
}

export class Tabs extends Layout<TabsConfig> {
  static make(id = 'tabs'): Tabs {
    return new Tabs({ id, schema: [], tabs: [], columns: 1 });
  }

  get component(): React.ComponentType<LayoutRenderProps> {
    return TabsComponent;
  }

  /** Children live on both keys so generic traversal (validation, defaults) sees them. */
  tabs(items: Tab[]): this {
    return this.mutate({ tabs: items, schema: items });
  }
}
