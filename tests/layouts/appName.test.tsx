import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';

/**
 * Both shells read `VITE_APP_NAME` once, at module scope, so the fallback can
 * only be observed by re-importing them with the variable unset. The render
 * helper is re-imported alongside them: after `resetModules` it would otherwise
 * provide a different `AuthContext` instance than the shell consumes.
 */
async function load(appName: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_APP_NAME', appName);

  return {
    AppLayout: (await import('@/layouts/AppLayout')).AppLayout,
    AuthLayout: (await import('@/layouts/AuthLayout')).AuthLayout,
    renderWithProviders: (await import('../helpers/render')).renderWithProviders,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('the app name in the shells', () => {
  it.each([
    ['Acme Admin', /Acme Admin/],
    [undefined, /Admin Panel/],
  ] as Array<[string | undefined, RegExp]>)(
    'brands the app shell with %s',
    async (appName, expected) => {
      const { AppLayout, renderWithProviders } = await load(appName);

      renderWithProviders(
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<h1>Page</h1>} />
          </Route>
        </Routes>,
      );

      expect(screen.getByRole('link', { name: expected })).toBeInTheDocument();
    },
  );

  it.each([
    ['Acme Admin', /Acme Admin/],
    [undefined, /Admin Panel/],
  ] as Array<[string | undefined, RegExp]>)(
    'brands the auth shell with %s',
    async (appName, expected) => {
      const { AuthLayout, renderWithProviders } = await load(appName);

      renderWithProviders(
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/" element={<h1>Sign in</h1>} />
          </Route>
        </Routes>,
        { user: null },
      );

      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );
});
