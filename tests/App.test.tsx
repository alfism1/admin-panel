import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { App } from '@/App';
import { authStore } from '@/core/auth/authStore';
import { apiClient } from '@/core/data/apiClient';
import { makeUser } from './helpers/context';
import { makeQueryClient } from './helpers/render';
import { pending } from './helpers/dataProvider';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

/**
 * `App` is the composition root: it mounts the real `AuthProvider`, so the
 * session is driven by `/auth/me` rather than an injected context.
 */
let get: MockInstance;

beforeEach(() => {
  authStore.setState({ accessToken: null, refreshToken: null, user: null, status: 'idle' });
  get = vi.spyOn(apiClient, 'get');
});

function renderApp(route: string) {
  const queryClient = makeQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signedIn(permissions = ['*']) {
  get.mockImplementation((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ data: makeUser({ permissions }) });
    return Promise.resolve({ data: { data: {} } });
  });
}

function signedOut() {
  get.mockRejectedValue(new Error('401'));
}

describe('bootstrap', () => {
  it('shows a splash while the session resolves', () => {
    get.mockReturnValue(pending());

    renderApp('/');

    expect(screen.getByText('Loading your workspace…')).toBeInTheDocument();
  });
});

describe('signed out', () => {
  beforeEach(signedOut);

  it('renders the login page', async () => {
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects a protected route to login', async () => {
    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects the dashboard to login', async () => {
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('signed in', () => {
  beforeEach(() => signedIn());

  it('renders the dashboard at the index route', async () => {
    renderApp('/');

    expect(await screen.findByRole('heading', { name: /Welcome back/ })).toBeInTheDocument();
  });

  it('renders the profile page', async () => {
    renderApp('/profile');

    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
  });

  it('mounts the generated resource routes', async () => {
    renderApp('/users');

    expect(await screen.findByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
  });

  it('renders the app shell around the page', async () => {
    renderApp('/');

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('shows 404 for an unknown path inside the shell', async () => {
    renderApp('/nowhere');

    expect(
      await screen.findByRole('heading', { name: '404 — Page not found' }),
    ).toBeInTheDocument();
  });

  it('gates a resource the user may not view', async () => {
    signedIn(['post.view']);

    renderApp('/users');

    expect(await screen.findByRole('heading', { name: /403/ })).toBeInTheDocument();
  });

  it('registers Dashboard in the sidebar ahead of the resources', async () => {
    renderApp('/');

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(nav.textContent?.indexOf('Dashboard')).toBe(0);
  });
});
