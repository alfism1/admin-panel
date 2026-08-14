import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter } from 'react-router';
import { AuthContext, type AuthContextValue } from '@/core/auth/AuthProvider';
import { createPermissionChecker } from '@/core/auth/can';
import type { AuthUser } from '@/core/auth/types';
import { makeUser } from './context';

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Pass `null` to render as a signed-out visitor. */
  user?: AuthUser | null;
  permissions?: string[];
  route?: string;
  auth?: Partial<AuthContextValue>;
}

/**
 * The real `AuthProvider` bootstraps over HTTP and shows a splash until it
 * settles, so tests inject the context value directly instead.
 */
export function makeAuthValue(
  user: AuthUser | null,
  permissions?: string[],
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  const checker = createPermissionChecker(permissions ?? user?.permissions ?? []);
  const roles = new Set(user?.roles ?? []);

  return {
    ...checker,
    user,
    status: user ? 'authenticated' : 'unauthenticated',
    isAuthenticated: user !== null,
    hasRole: (role) => (Array.isArray(role) ? role.some((r) => roles.has(r)) : roles.has(role)),
    login: async () => user as AuthUser,
    logout: async () => undefined,
    refreshUser: async () => undefined,
    ...overrides,
  };
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(ui: React.ReactElement, options: ProviderOptions = {}) {
  const { user = makeUser(), permissions, route = '/', auth = {}, ...renderOptions } = options;

  const queryClient = makeQueryClient();
  const authValue = makeAuthValue(user, permissions, auth);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  const result: RenderResult = render(ui, { wrapper: Wrapper, ...renderOptions });
  return { ...result, queryClient, authValue };
}
