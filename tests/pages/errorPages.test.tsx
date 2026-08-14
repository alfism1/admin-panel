import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { renderWithProviders } from '../helpers/render';

describe('<ForbiddenPage>', () => {
  it('announces the 403', () => {
    renderWithProviders(<ForbiddenPage />);
    expect(screen.getByRole('heading', { name: '403 — Not allowed' })).toBeInTheDocument();
  });

  it('names the required permission when given one', () => {
    renderWithProviders(<ForbiddenPage requiredPermission="user.delete" />);
    expect(screen.getByText('user.delete')).toBeInTheDocument();
  });

  it('omits the requirement line when no permission is given', () => {
    renderWithProviders(<ForbiddenPage />);
    expect(screen.queryByText(/Required:/)).not.toBeInTheDocument();
  });

  it('links back to the dashboard', () => {
    renderWithProviders(<ForbiddenPage />);
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });
});

describe('<NotFoundPage>', () => {
  it('announces the 404', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByRole('heading', { name: '404 — Page not found' })).toBeInTheDocument();
  });

  it('links back to the dashboard', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });
});
