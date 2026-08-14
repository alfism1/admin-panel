import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';
import { registerResources } from '@/core/resources/registry';
import { defineResource } from '@/core/resources/Resource';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { useTheme } from '@/core/ui/useTheme';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { GlobalSearch } from '@/layouts/GlobalSearch';
import { Sidebar } from '@/layouts/Sidebar';
import { Topbar } from '@/layouts/Topbar';
import { makeUser } from '../helpers/context';
import { renderWithProviders } from '../helpers/render';

const table = { columns: [TextColumn.make('name')] };

// Registered once for the whole file: the registry rejects duplicate names.
registerResources([
  defineResource({
    name: 'users',
    labels: { singular: 'User', plural: 'Users' },
    navigation: { label: 'Users', icon: 'users', group: 'Admin' },
    permissions: { viewAny: 'user.view' },
    table,
  }),
  defineResource({
    name: 'posts',
    labels: { singular: 'Post', plural: 'Posts' },
    navigation: { label: 'Posts', icon: 'file-text' },
    permissions: { viewAny: 'post.view' },
    table,
  }),
]);

describe('<Sidebar>', () => {
  it('renders a labelled navigation landmark', () => {
    renderWithProviders(<Sidebar collapsed={false} />);

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('renders a link per resource the user may view', () => {
    renderWithProviders(<Sidebar collapsed={false} />);

    expect(screen.getByRole('link', { name: /Users/ })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: /Posts/ })).toHaveAttribute('href', '/posts');
  });

  it('omits a resource the user cannot view', () => {
    renderWithProviders(<Sidebar collapsed={false} />, {
      user: makeUser({ permissions: ['post.view'] }),
    });

    expect(screen.queryByRole('link', { name: /Users/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Posts/ })).toBeInTheDocument();
  });

  it('renders group headings when expanded', () => {
    renderWithProviders(<Sidebar collapsed={false} />);

    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('hides group headings when collapsed', () => {
    renderWithProviders(<Sidebar collapsed />);

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('keeps labels available to screen readers when collapsed', () => {
    renderWithProviders(<Sidebar collapsed />);

    const link = screen.getByRole('link', { name: 'Users' });
    expect(within(link).getByText('Users')).toHaveClass('sr-only');
    expect(link).toHaveAttribute('title', 'Users');
  });

  it('marks the active route', () => {
    renderWithProviders(<Sidebar collapsed={false} />, { route: '/users' });

    expect(screen.getByRole('link', { name: /Users/ })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps a resource active on its nested routes', () => {
    renderWithProviders(<Sidebar collapsed={false} />, { route: '/users/3/edit' });

    expect(screen.getByRole('link', { name: /Users/ })).toHaveAttribute('aria-current', 'page');
  });
});

describe('<Topbar>', () => {
  const renderTopbar = (props = {}) =>
    renderWithProviders(
      <Topbar
        onToggleSidebar={vi.fn()}
        onOpenMobileNav={vi.fn()}
        onOpenSearch={vi.fn()}
        {...props}
      />,
    );

  beforeEach(() => {
    useTheme.setState({ theme: 'light', resolvedTheme: 'light' });
  });

  it('renders the sidebar and mobile-nav toggles', () => {
    renderTopbar();

    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });

  it('invokes the sidebar toggle', async () => {
    const onToggleSidebar = vi.fn();
    renderTopbar({ onToggleSidebar });

    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));

    expect(onToggleSidebar).toHaveBeenCalledOnce();
  });

  it('invokes the mobile nav opener', async () => {
    const onOpenMobileNav = vi.fn();
    renderTopbar({ onOpenMobileNav });

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(onOpenMobileNav).toHaveBeenCalledOnce();
  });

  it('opens search from the search affordance', async () => {
    const onOpenSearch = vi.fn();
    renderTopbar({ onOpenSearch });

    await userEvent.click(screen.getByText('Search…'));

    expect(onOpenSearch).toHaveBeenCalledOnce();
  });

  it('labels the theme toggle by its destination', () => {
    renderTopbar();

    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('toggles the theme', async () => {
    renderTopbar();

    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(useTheme.getState().resolvedTheme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('shows the signed-in user in the account menu', async () => {
    renderTopbar();

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('offers profile and sign-out entries', async () => {
    renderTopbar();

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(await screen.findByRole('menuitem', { name: /Profile/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Sign out/ })).toBeInTheDocument();
  });

  it('signs out through the auth context', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <Topbar onToggleSidebar={vi.fn()} onOpenMobileNav={vi.fn()} onOpenSearch={vi.fn()} />,
      { auth: { logout } },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Sign out/ }));

    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });

  it('falls back to a placeholder avatar without a user', () => {
    renderWithProviders(
      <Topbar onToggleSidebar={vi.fn()} onOpenMobileNav={vi.fn()} onOpenSearch={vi.fn()} />,
      { user: null },
    );

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('navigates to the profile page from the account menu', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <Topbar onToggleSidebar={vi.fn()} onOpenMobileNav={vi.fn()} onOpenSearch={vi.fn()} />
          }
        />
        <Route path="/profile" element={<h1>Profile page</h1>} />
      </Routes>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Profile/ }));

    expect(await screen.findByRole('heading', { name: 'Profile page' })).toBeInTheDocument();
  });

  it('goes back to the login page after signing out', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <Topbar onToggleSidebar={vi.fn()} onOpenMobileNav={vi.fn()} onOpenSearch={vi.fn()} />
          }
        />
        <Route path="/login" element={<h1>Login page</h1>} />
      </Routes>,
      { auth: { logout } },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Sign out/ }));

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });
});

describe('<GlobalSearch>', () => {
  const renderSearch = (open = true) => {
    const onOpenChange = vi.fn();
    const utils = renderWithProviders(
      <Routes>
        <Route path="/" element={<GlobalSearch open={open} onOpenChange={onOpenChange} />} />
        <Route path="/users" element={<h1>Users page</h1>} />
      </Routes>,
    );
    return { ...utils, onOpenChange };
  };

  it('renders nothing while closed', () => {
    renderSearch(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every navigable item when open', async () => {
    renderSearch();

    expect(await screen.findByLabelText('Search navigation')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Posts')).toBeInTheDocument();
  });

  it('filters by the typed term', async () => {
    renderSearch();

    await userEvent.type(await screen.findByLabelText('Search navigation'), 'post');

    expect(screen.getByText('Posts')).toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('shows only permitted destinations', async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<GlobalSearch open onOpenChange={onOpenChange} />, {
      user: makeUser({ permissions: ['post.view'] }),
    });

    expect(await screen.findByText('Posts')).toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('navigates on selection and closes', async () => {
    const { onOpenChange } = renderSearch();

    await userEvent.click(await screen.findByText('Users'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await screen.findByRole('heading', { name: 'Users page' })).toBeInTheDocument();
  });

  it('reports when nothing matches', async () => {
    renderSearch();

    await userEvent.type(await screen.findByLabelText('Search navigation'), 'zzzz');

    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });

  it('highlights the first result to begin with', async () => {
    renderSearch();

    const first = (await screen.findByText('Posts')).closest('button');
    expect(first).toHaveClass('bg-accent');
  });

  it('moves the highlight with the arrow keys', async () => {
    renderSearch();
    const input = await screen.findByLabelText('Search navigation');

    await userEvent.type(input, '{ArrowDown}');
    expect(screen.getByText('Users').closest('button')).toHaveClass('bg-accent');
    expect(screen.getByText('Posts').closest('button')).not.toHaveClass('bg-accent');

    await userEvent.type(input, '{ArrowUp}');
    expect(screen.getByText('Posts').closest('button')).toHaveClass('bg-accent');
  });

  it('stops at the ends of the list', async () => {
    renderSearch();
    const input = await screen.findByLabelText('Search navigation');

    await userEvent.type(input, '{ArrowUp}');
    expect(screen.getByText('Posts').closest('button')).toHaveClass('bg-accent');

    await userEvent.type(input, '{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getByText('Users').closest('button')).toHaveClass('bg-accent');
  });

  it('follows the highlighted result on Enter', async () => {
    const { onOpenChange } = renderSearch();
    const input = await screen.findByLabelText('Search navigation');

    await userEvent.type(input, '{ArrowDown}{Enter}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await screen.findByRole('heading', { name: 'Users page' })).toBeInTheDocument();
  });

  it('ignores Enter when nothing matches', async () => {
    const { onOpenChange } = renderSearch();
    const input = await screen.findByLabelText('Search navigation');

    await userEvent.type(input, 'zzzz{Enter}');

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('follows the hovered result rather than the keyboard cursor', async () => {
    renderSearch();

    await userEvent.hover(screen.getByText('Users').closest('button') as HTMLElement);

    expect(screen.getByText('Users').closest('button')).toHaveClass('bg-accent');
  });

  it('resets the highlight when the term changes', async () => {
    renderSearch();
    const input = await screen.findByLabelText('Search navigation');

    await userEvent.type(input, '{ArrowDown}');
    expect(screen.getByText('Users').closest('button')).toHaveClass('bg-accent');

    await userEvent.type(input, 's');
    expect(screen.getByText('Posts').closest('button')).toHaveClass('bg-accent');
  });
});

describe('<AppLayout>', () => {
  const renderLayout = (route = '/') =>
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<h1>Dashboard content</h1>} />
        </Route>
      </Routes>,
      { route },
    );

  it('renders the brand, sidebar, topbar and outlet', () => {
    renderLayout();

    expect(screen.getByRole('heading', { name: 'Dashboard content' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
  });

  it('links the brand back to the dashboard', () => {
    renderLayout();

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/');
  });

  it('persists the collapsed state', async () => {
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));

    await waitFor(() => expect(localStorage.getItem('admin.sidebar-collapsed')).toBe('true'));
  });

  it('restores the collapsed state on mount', () => {
    localStorage.setItem('admin.sidebar-collapsed', 'true');

    renderLayout();

    // Collapsed hides group headings.
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('opens the command palette on ⌘K', async () => {
    renderLayout();

    await userEvent.keyboard('{Meta>}k{/Meta}');

    expect(await screen.findByLabelText('Search navigation')).toBeInTheDocument();
  });

  it('opens the command palette on Ctrl+K', async () => {
    renderLayout();

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(await screen.findByLabelText('Search navigation')).toBeInTheDocument();
  });

  it('catches a render error from the page without blanking the shell', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function Boom(): React.ReactElement {
      throw new Error('Page exploded');
    }

    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Boom />} />
        </Route>
      </Routes>,
    );

    expect(screen.getByText('Page exploded')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('opens the mobile navigation drawer', async () => {
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    const drawer = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(within(drawer).getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('closes the mobile drawer once a destination is chosen', async () => {
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = await screen.findByRole('dialog', { name: 'Navigation' });
    await userEvent.click(within(drawer).getByRole('link', { name: /Posts/ }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument(),
    );
  });

  it('opens the command palette from the topbar affordance', async () => {
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: /Search/ }));

    expect(await screen.findByLabelText('Search navigation')).toBeInTheDocument();
  });
});

describe('<AuthLayout>', () => {
  it('renders the outlet', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/" element={<h1>Sign in form</h1>} />
        </Route>
      </Routes>,
      { user: null },
    );

    expect(screen.getByRole('heading', { name: 'Sign in form' })).toBeInTheDocument();
  });

  it('renders the marketing aside', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/" element={<h1>Sign in form</h1>} />
        </Route>
      </Routes>,
      { user: null },
    );

    expect(screen.getByText(/Declare a resource/)).toBeInTheDocument();
  });
});
