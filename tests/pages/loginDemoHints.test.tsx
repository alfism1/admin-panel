import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `USE_MOCK` is read once, when `apiClient` is first imported, so the demo
 * affordances can only be observed by re-importing the page with the flag set.
 */
async function load(useMock: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_USE_MOCK', useMock);

  return {
    LoginPage: (await import('@/pages/LoginPage')).LoginPage,
    renderWithProviders: (await import('../helpers/render')).renderWithProviders,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('running against the mock backend', () => {
  it('prefills the demo credentials', async () => {
    const { LoginPage, renderWithProviders } = await load('true');

    renderWithProviders(<LoginPage />, { user: null });

    expect(screen.getByLabelText('Email address')).toHaveValue('admin@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('password');
  });

  it('lists the demo accounts', async () => {
    const { LoginPage, renderWithProviders } = await load('true');

    renderWithProviders(<LoginPage />, { user: null });

    expect(screen.getByText(/Demo accounts/)).toBeInTheDocument();
    expect(screen.getByText(/admin@example.com — full access/)).toBeInTheDocument();
    expect(screen.getByText(/editor@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/viewer@example.com/)).toBeInTheDocument();
  });
});

describe('running against a real backend', () => {
  it('starts with empty credentials and no demo hints', async () => {
    const { LoginPage, renderWithProviders } = await load(undefined);

    renderWithProviders(<LoginPage />, { user: null });

    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByText(/Demo accounts/)).not.toBeInTheDocument();
  });
});
