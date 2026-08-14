import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfilePage } from '@/pages/ProfilePage';
import { makeUser } from '../helpers/context';
import { renderWithProviders } from '../helpers/render';

describe('<ProfilePage>', () => {
  it('titles the page', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Your profile' })).toBeInTheDocument();
  });

  it('shows the signed-in name and email', () => {
    renderWithProviders(<ProfilePage />, {
      user: makeUser({ name: 'Grace Hopper', email: 'grace@example.com' }),
    });

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('grace@example.com')).toBeInTheDocument();
  });

  it('falls back to initials when there is no avatar', () => {
    renderWithProviders(<ProfilePage />, {
      user: makeUser({ name: 'Grace Hopper', avatar: null }),
    });

    expect(screen.getByText('GH')).toBeInTheDocument();
  });

  it('lists every role', () => {
    renderWithProviders(<ProfilePage />, {
      user: makeUser({ roles: ['admin', 'editor'] }),
    });

    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
  });

  it('lists every permission', () => {
    renderWithProviders(<ProfilePage />, {
      user: makeUser({ permissions: ['user.view', 'post.create'] }),
    });

    expect(screen.getByText('user.view')).toBeInTheDocument();
    expect(screen.getByText('post.create')).toBeInTheDocument();
  });

  it('states that these gates are UX only, not a security boundary', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.getByText(/backend remains the source of truth/)).toBeInTheDocument();
  });

  it('renders without a user rather than throwing', () => {
    renderWithProviders(<ProfilePage />, { user: null });

    expect(screen.getByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
