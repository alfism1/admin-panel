import type * as React from 'react';
import type { PermissionMode } from './types';
import { useAuth } from './useAuth';

export interface CanProps {
  permission: string | string[];
  mode?: PermissionMode;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function Can({ permission, mode = 'all', fallback = null, children }: CanProps) {
  const { canAny, canAll } = useAuth();
  const list = Array.isArray(permission) ? permission : [permission];
  const allowed = mode === 'any' ? canAny(list) : canAll(list);
  return <>{allowed ? children : fallback}</>;
}
