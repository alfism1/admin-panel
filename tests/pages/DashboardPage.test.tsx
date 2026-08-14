import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { apiClient } from '@/core/data/apiClient';
import { DashboardPage } from '@/pages/DashboardPage';
import { makeUser } from '../helpers/context';
import { renderWithProviders } from '../helpers/render';
import { pending } from '../helpers/dataProvider';

const stats = { users: 12, activeUsers: 9, posts: 34, published: 21, roles: 3, views: 12345 };

let get: MockInstance;

beforeEach(() => {
  get = vi.spyOn(apiClient, 'get');
  get.mockResolvedValue({ data: { data: stats } } as never);
});

describe('<DashboardPage>', () => {
  it('greets the user by first name', async () => {
    renderWithProviders(<DashboardPage />, { user: makeUser({ name: 'Grace Hopper' }) });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome back, Grace' }),
    ).toBeInTheDocument();
  });

  it('falls back to a neutral greeting without a user', async () => {
    renderWithProviders(<DashboardPage />, { user: null });

    expect(await screen.findByRole('heading', { name: 'Welcome back, there' })).toBeInTheDocument();
  });

  it('fetches the dashboard statistics', async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/dashboard/stats'));
  });

  it('renders a card per statistic', async () => {
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Posts')).toBeInTheDocument();
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('Total views')).toBeInTheDocument();
  });

  it('shows the fetched values, thousand-separated', async () => {
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows the supporting hints', async () => {
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('9 active')).toBeInTheDocument();
    expect(screen.getByText('21 published')).toBeInTheDocument();
  });

  it('links each card to its resource', async () => {
    renderWithProviders(<DashboardPage />);

    await screen.findByText('Users');
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/users',
      '/posts',
      '/roles',
      '/posts',
    ]);
  });

  it('shows skeletons while loading', () => {
    get.mockReturnValue(pending());

    const { container } = renderWithProviders(<DashboardPage />);

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);
  });

  it('falls back to zero when the request fails', async () => {
    get.mockRejectedValue(new Error('offline'));

    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getAllByText('0').length).toBeGreaterThan(0));
  });

  it('renders the getting-started card', async () => {
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('heading', { name: 'Adding a module' })).toBeInTheDocument();
    expect(screen.getByText('pnpm gen:resource Product')).toBeInTheDocument();
  });
});
