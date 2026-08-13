import { allResources } from '@/core/resources/registry';
import type { Resource } from '@/core/resources/types';
import type { NavigationGroup, NavigationItem } from './types';

const standaloneItems: NavigationItem[] = [];

/** Registers non-resource pages (Dashboard, Settings…) into the same sidebar. */
export function registerNavigationItems(
  items: Array<Omit<NavigationItem, 'sort'> & { sort?: number }>,
): void {
  for (const item of items) {
    standaloneItems.push({ sort: 0, ...item });
  }
}

function toItem(resource: Resource): NavigationItem | null {
  const nav = resource.navigation;
  if (nav === false) return null;

  return {
    key: resource.name,
    label: nav.label ?? resource.labels.plural,
    path: resource.routes.list,
    icon: nav.icon,
    group: nav.group,
    sort: nav.sort ?? 0,
    permission: resource.permissions.viewAny,
    badge: nav.badge,
    matchPrefix: true,
  };
}

/**
 * Builds the sidebar from the resource registry. Items the user cannot view are
 * dropped here — one of the four enforcement points, not the only one.
 */
export function buildNavigation(can: (permission: string) => boolean): NavigationGroup[] {
  const items = [
    ...standaloneItems,
    ...allResources()
      .map(toItem)
      .filter((item): item is NavigationItem => item !== null),
  ]
    .filter((item) => !item.permission || can(item.permission))
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));

  const groups = new Map<string | null, NavigationGroup>();
  for (const item of items) {
    const key = item.group ?? null;
    if (!groups.has(key)) {
      groups.set(key, { label: key, items: [], sort: key === null ? -1 : groups.size });
    }
    groups.get(key)!.items.push(item);
  }

  return [...groups.values()].sort((a, b) => a.sort - b.sort);
}
