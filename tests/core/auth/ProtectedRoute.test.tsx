import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router';
import { ProtectedRoute } from '@/core/auth/ProtectedRoute';
import { makeUser } from '../../helpers/context';
import { renderWithProviders } from '../../helpers/render';

/**
 * Mounted inside real routes on purpose. `<Navigate>` rendered with nowhere to
 * land re-mounts on every location change and spins forever, so a redirect can
 * only be observed by giving it a destination.
 */
function renderGuard(
  options: {
    permission?: string | string[];
    mode?: 'any' | 'all';
    user?: ReturnType<typeof makeUser> | null;
    route?: string;
  } = {},
) {
  const { permission, mode, user = makeUser(), route = '/users' } = options;

  return renderWithProviders(
    <Routes>
      <Route
        path="/users"
        element={
          <ProtectedRoute permission={permission} mode={mode}>
            <h1>Protected content</h1>
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<h1>Login screen</h1>} />
    </Routes>,
    { user, route },
  );
}

describe('<ProtectedRoute>', () => {
  it('renders children for an authorised user', () => {
    renderGuard({
      permission: 'user.viewAny',
      user: makeUser({ permissions: ['user.viewAny'] }),
    });

    expect(screen.getByRole('heading', { name: 'Protected content' })).toBeInTheDocument();
  });

  it('renders children when no permission is required', () => {
    renderGuard({ user: makeUser({ permissions: [] }) });

    expect(screen.getByRole('heading', { name: 'Protected content' })).toBeInTheDocument();
  });

  it('admits a user whose wildcard covers the permission', () => {
    renderGuard({ permission: 'user.delete', user: makeUser({ permissions: ['user.*'] }) });

    expect(screen.getByRole('heading', { name: 'Protected content' })).toBeInTheDocument();
  });

  it('shows 403 rather than redirecting an authenticated user who lacks the permission', () => {
    renderGuard({ permission: 'user.delete', user: makeUser({ permissions: ['user.view'] }) });

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /403/ })).toBeInTheDocument();
  });

  it('names the missing permission on the 403 page', () => {
    renderGuard({
      permission: ['user.delete', 'user.update'],
      user: makeUser({ permissions: [] }),
    });

    expect(screen.getByText('user.delete, user.update')).toBeInTheDocument();
  });

  it('sends an anonymous visitor to login', () => {
    renderGuard({ permission: 'user.viewAny', user: null });

    expect(screen.getByRole('heading', { name: 'Login screen' })).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('checks the session before the permission, so anonymous never sees 403', () => {
    renderGuard({ permission: 'nobody.has.this', user: null });

    expect(screen.getByRole('heading', { name: 'Login screen' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /403/ })).not.toBeInTheDocument();
  });

  it('mode="any" admits a user holding one of several permissions', () => {
    renderGuard({
      permission: ['user.delete', 'user.view'],
      mode: 'any',
      user: makeUser({ permissions: ['user.view'] }),
    });

    expect(screen.getByRole('heading', { name: 'Protected content' })).toBeInTheDocument();
  });

  it('default mode requires every permission in the list', () => {
    renderGuard({
      permission: ['user.delete', 'user.view'],
      user: makeUser({ permissions: ['user.view'] }),
    });

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
