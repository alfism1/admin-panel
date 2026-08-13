/**
 * Permission matcher for dotted strings with wildcard support:
 * `*` grants everything, `user.*` grants every `user.` action.
 */
export interface PermissionChecker {
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  canAll: (permissions: string[]) => boolean;
}

export function createPermissionChecker(permissions: string[]): PermissionChecker {
  const exact = new Set(permissions);
  const superAdmin = exact.has('*');

  // Precomputed prefixes turn `user.*` into an O(depth) lookup instead of a scan.
  const wildcardPrefixes = new Set<string>();
  for (const permission of permissions) {
    if (permission.endsWith('.*')) wildcardPrefixes.add(permission.slice(0, -2));
  }

  const cache = new Map<string, boolean>();

  const can = (permission: string): boolean => {
    if (superAdmin) return true;
    if (!permission) return true;

    const cached = cache.get(permission);
    if (cached !== undefined) return cached;

    let granted = exact.has(permission);
    if (!granted) {
      const segments = permission.split('.');
      for (let i = segments.length - 1; i > 0 && !granted; i -= 1) {
        granted = wildcardPrefixes.has(segments.slice(0, i).join('.'));
      }
    }

    cache.set(permission, granted);
    return granted;
  };

  return {
    can,
    canAny: (list) => list.length === 0 || list.some(can),
    canAll: (list) => list.every(can),
  };
}
