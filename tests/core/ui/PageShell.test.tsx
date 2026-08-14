import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageShell } from '@/core/ui/PageShell';
import { renderWithProviders } from '../../helpers/render';

describe('<PageShell>', () => {
  it('renders the title as the page heading', () => {
    renderWithProviders(
      <PageShell title="Users">
        <p>Body</p>
      </PageShell>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
  });

  it('renders its children', () => {
    renderWithProviders(
      <PageShell title="Users">
        <p>Body</p>
      </PageShell>,
    );

    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders an optional description', () => {
    renderWithProviders(
      <PageShell title="Users" description="Everyone with access">
        <p>Body</p>
      </PageShell>,
    );

    expect(screen.getByText('Everyone with access')).toBeInTheDocument();
  });

  it('omits the description element when there is none', () => {
    renderWithProviders(
      <PageShell title="Users">
        <p>Body</p>
      </PageShell>,
    );

    expect(screen.queryByText('Everyone with access')).not.toBeInTheDocument();
  });

  it('renders header actions', () => {
    renderWithProviders(
      <PageShell title="Users" actions={<button type="button">New user</button>}>
        <p>Body</p>
      </PageShell>,
    );

    expect(screen.getByRole('button', { name: 'New user' })).toBeInTheDocument();
  });

  it('sets the document title', () => {
    renderWithProviders(
      <PageShell title="Users">
        <p>Body</p>
      </PageShell>,
    );

    expect(document.title).toContain('Users');
  });
});

describe('breadcrumbs', () => {
  const crumbs = [
    { label: 'Dashboard', to: '/' },
    { label: 'Users', to: '/users' },
    { label: 'Ada' },
  ];

  it('renders a labelled navigation landmark', () => {
    renderWithProviders(
      <PageShell title="Ada" breadcrumbs={crumbs}>
        <p>Body</p>
      </PageShell>,
    );

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('links every crumb that has a target', () => {
    renderWithProviders(
      <PageShell title="Ada" breadcrumbs={crumbs}>
        <p>Body</p>
      </PageShell>,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
  });

  it('marks the final crumb as the current page instead of linking it', () => {
    renderWithProviders(
      <PageShell title="Ada" breadcrumbs={crumbs}>
        <p>Body</p>
      </PageShell>,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).queryByRole('link', { name: 'Ada' })).not.toBeInTheDocument();
    expect(within(nav).getByText('Ada')).toHaveAttribute('aria-current', 'page');
  });

  it('omits the nav entirely for an empty list', () => {
    renderWithProviders(
      <PageShell title="Users" breadcrumbs={[]}>
        <p>Body</p>
      </PageShell>,
    );

    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });
});
