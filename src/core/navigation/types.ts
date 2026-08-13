import type * as React from 'react';
import type { IconSpec } from '@/core/ui/icon';

export interface NavigationItem {
  key: string;
  label: string;
  path: string;
  icon?: IconSpec;
  group?: string;
  sort: number;
  permission?: string;
  /** Runs as a hook during render, so it may use TanStack Query. */
  badge?: () => React.ReactNode;
  /** Marks the item active for nested routes such as `/users/3/edit`. */
  matchPrefix?: boolean;
}

export interface NavigationGroup {
  label: string | null;
  items: NavigationItem[];
  sort: number;
}
