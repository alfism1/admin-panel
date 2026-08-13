import * as React from 'react';
import { apiClient } from '@/core/data/apiClient';
import { authStore } from './authStore';
import { createPermissionChecker, type PermissionChecker } from './can';
import type { AuthStatus, AuthUser, LoginCredentials, LoginResponse } from './types';

export interface AuthContextValue extends PermissionChecker {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  hasRole: (role: string | string[]) => boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);

function SplashScreen() {
  return (
    <div className="bg-background flex h-full min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="border-muted border-t-primary size-8 animate-spin rounded-full border-2" />
        <p className="text-muted-foreground text-sm">Loading your workspace…</p>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const user = authStore((state) => state.user);
  const status = authStore((state) => state.status);

  React.useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      authStore.getState().setStatus('authenticating');
      try {
        const { data } = await apiClient.get<{ data?: AuthUser } | AuthUser>('/auth/me');
        const me = (data as { data?: AuthUser }).data ?? (data as AuthUser);
        if (cancelled) return;
        authStore.getState().setUser(me);
        authStore.getState().setStatus('authenticated');
      } catch {
        if (cancelled) return;
        authStore.getState().clear();
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = React.useMemo<AuthContextValue>(() => {
    const checker = createPermissionChecker(user?.permissions ?? []);
    const roles = new Set(user?.roles ?? []);

    return {
      ...checker,
      user,
      status,
      isAuthenticated: status === 'authenticated' && user !== null,
      hasRole: (role) => (Array.isArray(role) ? role.some((r) => roles.has(r)) : roles.has(role)),

      login: async (credentials) => {
        const { data } = await apiClient.post<LoginResponse>('/auth/login', credentials, {
          skipAuthRefresh: true,
        } as never);
        authStore.getState().setTokens(data.accessToken, data.refreshToken);
        authStore.getState().setUser(data.user);
        authStore.getState().setStatus('authenticated');
        return data.user;
      },

      logout: async () => {
        try {
          await apiClient.post('/auth/logout', {}, { skipAuthRefresh: true } as never);
        } finally {
          authStore.getState().clear();
        }
      },

      refreshUser: async () => {
        const { data } = await apiClient.get<{ data?: AuthUser } | AuthUser>('/auth/me');
        authStore.getState().setUser((data as { data?: AuthUser }).data ?? (data as AuthUser));
      },
    };
  }, [user, status]);

  if (status === 'idle' || status === 'authenticating') return <SplashScreen />;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
