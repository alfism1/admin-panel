import type * as React from 'react';
import { Navigate, useLocation } from 'react-router';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import type { PermissionMode } from './types';
import { useAuth } from './useAuth';

export interface ProtectedRouteProps {
  permission?: string | string[];
  mode?: PermissionMode;
  children: React.ReactNode;
}

/**
 * Missing session -> /login. Missing permission -> 403, never a redirect:
 * bouncing an authenticated user to login hides the real problem.
 */
export function ProtectedRoute({ permission, mode = 'all', children }: ProtectedRouteProps) {
  const { isAuthenticated, canAny, canAll } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    const allowed = mode === 'any' ? canAny(list) : canAll(list);
    if (!allowed) return <ForbiddenPage requiredPermission={list.join(', ')} />;
  }

  return <>{children}</>;
}
