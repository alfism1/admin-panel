import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { registerNavigationItems } from '@/core/navigation/navigation';
import { defineResource } from '@/core/resources/Resource';
import { registerResources } from '@/core/resources/registry';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { GlobalSearch } from '@/layouts/GlobalSearch';
import { Sidebar } from '@/layouts/Sidebar';
import { renderWithProviders } from '../helpers/render';

const table = { columns: [TextColumn.make('name')] };

// Isolated in its own file: both registries are module-level, so an extra item
// registered here would change every other navigation assertion in the suite.
registerResources([
  defineResource({
    name: 'tickets',
    labels: { singular: 'Ticket', plural: 'Tickets' },
    navigation: { badge: () => '7' },
    table,
  }),
  defineResource({
    name: 'archives',
    labels: { singular: 'Archive', plural: 'Archives' },
    navigation: { icon: 'archive', badge: () => null },
    table,
  }),
]);

registerNavigationItems([{ key: 'dashboard', label: 'Dashboard', path: '/', icon: 'home' }]);

describe('<Sidebar> badges', () => {
  it('renders a badge next to the item that has one', () => {
    renderWithProviders(<Sidebar collapsed={false} />);

    const link = screen.getByRole('link', { name: /Tickets/ });
    expect(link).toHaveTextContent('7');
  });

  it('renders no badge when the resolver returns nothing', () => {
    renderWithProviders(<Sidebar collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Archives' })).toHaveTextContent(/^Archives$/);
  });

  it('renders no badge for an item that declares none', () => {
    renderWithProviders(<Sidebar collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveTextContent(/^Dashboard$/);
  });

  it('hides the badge while collapsed, keeping only the accessible label', () => {
    renderWithProviders(<Sidebar collapsed />);

    const link = screen.getByRole('link', { name: 'Tickets' });
    expect(link).not.toHaveTextContent('7');
  });

  it('falls back to a default icon when a resource declares none', () => {
    renderWithProviders(<Sidebar collapsed={false} />);

    // Every entry gets an icon, including the one that never asked for one.
    const withIcon = screen
      .getAllByRole('link')
      .filter((link) => link.querySelector('svg') !== null);

    expect(withIcon).toHaveLength(3);
  });
});

describe('<GlobalSearch> icons', () => {
  it('gives every destination an icon, including one that declares none', async () => {
    const onOpenChange = () => undefined;
    renderWithProviders(<GlobalSearch open onOpenChange={onOpenChange} />);

    const tickets = (await screen.findByText('Tickets')).closest('button');
    const archives = screen.getByText('Archives').closest('button');

    expect(tickets?.querySelector('svg')).toBeInTheDocument();
    expect(archives?.querySelector('svg')).toBeInTheDocument();
  });
});
