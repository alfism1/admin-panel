import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AuthProvider } from '@/core/auth/AuthProvider';
import { authStore } from '@/core/auth/authStore';
import { useAuth } from '@/core/auth/useAuth';
import { apiClient } from '@/core/data/apiClient';
import { makeUser } from '../../helpers/context';

// Re-spied per test: the suite runs with `restoreMocks: true`, which would undo
// a module-scope spy after the first test and let real requests through.
let get: MockInstance;
let post: MockInstance;

const user = makeUser({ permissions: ['user.view', 'post.*'], roles: ['admin', 'editor'] });

function response<T>(data: T) {
  return { data } as Awaited<ReturnType<typeof apiClient.get>>;
}

/** Surfaces the context so assertions can read it without a second provider. */
function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="name">{auth.user?.name ?? 'anonymous'}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="can-view">{String(auth.can('user.view'))}</span>
      <span data-testid="can-delete">{String(auth.can('user.delete'))}</span>
      <span data-testid="can-post">{String(auth.can('post.publish'))}</span>
      <span data-testid="role-admin">{String(auth.hasRole('admin'))}</span>
      <span data-testid="role-any">{String(auth.hasRole(['viewer', 'editor']))}</span>
      <span data-testid="role-none">{String(auth.hasRole('viewer'))}</span>
      {/* `.catch` rather than `void`: login and logout both reject on failure,
          and a floating rejection fails the run even though the test asserts
          on the resulting state. */}
      <button
        type="button"
        onClick={() => {
          auth.login({ email: 'a@b.c', password: 'pw' }).catch(() => undefined);
        }}
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={() => {
          auth.logout().catch(() => undefined);
        }}
      >
        Sign out
      </button>
      <button
        type="button"
        onClick={() => {
          auth.refreshUser().catch(() => undefined);
        }}
      >
        Reload me
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  authStore.setState({ accessToken: null, refreshToken: null, user: null, status: 'idle' });
  get = vi.spyOn(apiClient, 'get');
  post = vi.spyOn(apiClient, 'post');
});

describe('bootstrap', () => {
  it('shows a splash while the session is being resolved', () => {
    get.mockReturnValue(new Promise(() => undefined) as never);

    renderProvider();

    expect(screen.getByText('Loading your workspace…')).toBeInTheDocument();
    expect(screen.queryByTestId('status')).not.toBeInTheDocument();
  });

  it('asks the server who the current user is', async () => {
    get.mockResolvedValue(response(user));

    renderProvider();

    await waitFor(() => expect(get).toHaveBeenCalledWith('/auth/me'));
  });

  it('authenticates from a bare user payload', async () => {
    get.mockResolvedValue(response(user));

    renderProvider();

    expect(await screen.findByTestId('status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
  });

  it('unwraps a { data } envelope', async () => {
    get.mockResolvedValue(response({ data: user }));

    renderProvider();

    expect(await screen.findByTestId('name')).toHaveTextContent('Ada Lovelace');
  });

  it('falls back to unauthenticated when there is no session', async () => {
    get.mockRejectedValue(new Error('401'));

    renderProvider();

    expect(await screen.findByTestId('status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('clears any stale token when the bootstrap fails', async () => {
    authStore.getState().setTokens('stale', 'refresh-1');
    get.mockRejectedValue(new Error('401'));

    renderProvider();

    await screen.findByTestId('status');
    expect(authStore.getState().accessToken).toBeNull();
    expect(authStore.getState().refreshToken).toBeNull();
  });

  it('does not apply a late response after unmount', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    get.mockReturnValue(new Promise((r) => (resolve = r)) as never);

    const { unmount } = renderProvider();
    unmount();
    resolve(response(user));

    await waitFor(() => expect(authStore.getState().user).toBeNull());
  });
});

describe('permissions and roles', () => {
  // Block body, not a concise one: returning the mock would hand Vitest a
  // "teardown function", which it then calls — firing a stray request.
  beforeEach(() => {
    get.mockResolvedValue(response(user));
  });

  it('derives the permission checker from the user', async () => {
    renderProvider();

    expect(await screen.findByTestId('can-view')).toHaveTextContent('true');
    expect(screen.getByTestId('can-delete')).toHaveTextContent('false');
  });

  it('honours wildcard grants', async () => {
    renderProvider();

    expect(await screen.findByTestId('can-post')).toHaveTextContent('true');
  });

  it('matches a single role', async () => {
    renderProvider();

    expect(await screen.findByTestId('role-admin')).toHaveTextContent('true');
    expect(screen.getByTestId('role-none')).toHaveTextContent('false');
  });

  it('matches any role from a list', async () => {
    renderProvider();

    expect(await screen.findByTestId('role-any')).toHaveTextContent('true');
  });

  it('grants nothing to a user with no permissions', async () => {
    get.mockResolvedValue(response(makeUser({ permissions: [] })));

    renderProvider();

    expect(await screen.findByTestId('can-view')).toHaveTextContent('false');
  });
});

describe('login', () => {
  beforeEach(() => {
    get.mockRejectedValue(new Error('401'));
  });

  it('posts the credentials and skips the refresh interceptor', async () => {
    post.mockResolvedValue(response({ accessToken: 'token-1', user }));

    renderProvider();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'a@b.c', password: 'pw' },
        { skipAuthRefresh: true },
      ),
    );
  });

  it('stores the tokens and the user', async () => {
    post.mockResolvedValue(response({ accessToken: 'token-1', refreshToken: 'refresh-1', user }));

    renderProvider();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(authStore.getState().accessToken).toBe('token-1'));
    expect(authStore.getState().refreshToken).toBe('refresh-1');
    expect(authStore.getState().user).toEqual(user);
  });

  it('flips the context to authenticated', async () => {
    post.mockResolvedValue(response({ accessToken: 'token-1', user }));

    renderProvider();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
  });

  it('leaves the session untouched when the credentials are rejected', async () => {
    post.mockRejectedValue(new Error('Bad credentials'));

    renderProvider();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(authStore.getState().accessToken).toBeNull();
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });
});

describe('logout', () => {
  beforeEach(() => {
    get.mockResolvedValue(response(user));
  });

  it('tells the server, then clears the session', async () => {
    post.mockResolvedValue(response({ success: true }));

    renderProvider();
    await screen.findByTestId('status');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/logout', {}, { skipAuthRefresh: true }),
    );
    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().status).toBe('unauthenticated');
  });

  it('clears the session even when the server call fails', async () => {
    post.mockRejectedValue(new Error('Network down'));

    renderProvider();
    await screen.findByTestId('status');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(authStore.getState().user).toBeNull());
    expect(authStore.getState().accessToken).toBeNull();
  });

  it('removes the persisted refresh token', async () => {
    authStore.getState().setTokens('token-1', 'refresh-1');
    post.mockResolvedValue(response({}));

    renderProvider();
    await screen.findByTestId('status');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(localStorage.getItem('admin.refresh_token')).toBeNull());
  });
});

describe('refreshUser', () => {
  it('re-reads the user and updates the context', async () => {
    get.mockResolvedValueOnce(response(user));
    get.mockResolvedValueOnce(response(makeUser({ name: 'Grace Hopper' })));

    renderProvider();
    await screen.findByTestId('status');
    await userEvent.click(screen.getByRole('button', { name: 'Reload me' }));

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Grace Hopper'));
  });

  it('unwraps a { data } envelope', async () => {
    get.mockResolvedValueOnce(response(user));
    get.mockResolvedValueOnce(response({ data: makeUser({ name: 'Grace Hopper' }) }));

    renderProvider();
    await screen.findByTestId('status');
    await userEvent.click(screen.getByRole('button', { name: 'Reload me' }));

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Grace Hopper'));
  });
});

describe('useAuth outside a provider', () => {
  it('throws a directed error rather than returning undefined', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>.');
  });
});
