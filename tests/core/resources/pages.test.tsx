import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Action } from '@/core/actions/Action';
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import { TextInput } from '@/core/forms/fields/TextInput';
import { CreatePage } from '@/core/resources/pages/CreatePage';
import { EditPage } from '@/core/resources/pages/EditPage';
import { ListPage } from '@/core/resources/pages/ListPage';
import { ViewPage } from '@/core/resources/pages/ViewPage';
import { defineResource } from '@/core/resources/Resource';
import { BadgeColumn } from '@/core/tables/columns/BadgeColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { TooltipProvider } from '@/core/ui/tooltip';
import { makeUser } from '../../helpers/context';
import {
  listResult,
  makeDataProvider,
  pending,
  type MockDataProvider,
} from '../../helpers/dataProvider';
import { renderWithProviders } from '../../helpers/render';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const { notify } = await import('@/core/ui/notify');

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  recordTitleKey: 'title',
  permissions: {
    viewAny: 'post.view',
    view: 'post.view',
    create: 'post.create',
    update: 'post.update',
    delete: 'post.delete',
  },
  form: [TextInput.make('title').required(), TextInput.make('excerpt')],
  table: {
    columns: [TextColumn.make('title').sortable(), BadgeColumn.make('status')],
  },
});

const record = { id: 7, title: 'Hello world', status: 'draft', excerpt: 'A summary' };

let provider: MockDataProvider;

beforeEach(() => {
  provider = makeDataProvider();
  provider.getList.mockResolvedValue(listResult([record]));
  provider.getOne.mockResolvedValue(record);
  setDataProvider(provider);
});

afterEach(() => {
  setDataProvider(restDataProvider);
});

/** Pages read `:id` from the router, so they are always mounted on a route. */
function renderPage(
  element: React.ReactElement,
  { path = '/posts', route = '/posts', permissions = ['*'] } = {},
) {
  return renderWithProviders(
    <TooltipProvider>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/posts" element={<h1>Posts list</h1>} />
        <Route path="/posts/:id/edit" element={<h1>Edit landing</h1>} />
      </Routes>
    </TooltipProvider>,
    { route, user: makeUser({ permissions }) },
  );
}

describe('<ListPage>', () => {
  it('titles the page with the plural label', async () => {
    renderPage(<ListPage resource={resource} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Posts' })).toBeInTheDocument();
  });

  it('renders the table with the fetched rows', async () => {
    renderPage(<ListPage resource={resource} />);

    await waitFor(() =>
      expect(within(screen.getByRole('table')).getByText('Hello world')).toBeInTheDocument(),
    );
  });

  it('offers a create button when the create page is enabled', async () => {
    renderPage(<ListPage resource={resource} />);

    expect(await screen.findByRole('link', { name: 'New post' })).toHaveAttribute(
      'href',
      '/posts/create',
    );
  });

  it('hides the create button when the user cannot create', async () => {
    renderPage(<ListPage resource={resource} />, { permissions: ['post.view'] });
    await screen.findByRole('heading', { name: 'Posts' });

    expect(screen.queryByRole('link', { name: 'New post' })).not.toBeInTheDocument();
  });

  it('hides the create button when the create page is disabled', async () => {
    const noCreate = defineResource({ ...resource, pages: { create: false } });
    renderPage(<ListPage resource={noCreate} />);
    await screen.findByRole('heading', { name: 'Posts' });

    expect(screen.queryByRole('link', { name: /New post/ })).not.toBeInTheDocument();
  });

  it('renders schema header actions', async () => {
    const withHeader = defineResource({
      ...resource,
      table: { ...resource.table, headerActions: [Action.make('export').action(vi.fn())] },
    });

    renderPage(<ListPage resource={withHeader} />);

    expect(await screen.findByRole('button', { name: 'Export' })).toBeInTheDocument();
  });
});

describe('<CreatePage>', () => {
  const render = () =>
    renderPage(<CreatePage resource={resource} />, {
      path: '/posts/create',
      route: '/posts/create',
    });

  it('titles the page after the singular label', () => {
    render();

    expect(screen.getByRole('heading', { level: 1, name: 'New post' })).toBeInTheDocument();
  });

  it('renders breadcrumbs back to the list', () => {
    render();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Posts' })).toHaveAttribute('href', '/posts');
  });

  it('renders the resource form', () => {
    render();

    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByLabelText('Excerpt')).toBeInTheDocument();
  });

  it('labels the submit button after the singular', () => {
    render();

    expect(screen.getByRole('button', { name: 'Create post' })).toBeInTheDocument();
  });

  it('creates the record through the provider', async () => {
    render();

    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'New post');
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() =>
      expect(provider.create).toHaveBeenCalledWith('posts', {
        title: 'New post',
        excerpt: '',
      }),
    );
  });

  it('reports success and navigates to the new record', async () => {
    provider.create.mockResolvedValue({ id: 9, title: 'New post' });
    render();

    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'New post');
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Post created.'));
    expect(await screen.findByRole('heading', { name: 'Edit landing' })).toBeInTheDocument();
  });

  it('falls back to the list when the response carries no id', async () => {
    provider.create.mockResolvedValue({ title: 'New post' });
    render();

    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'New post');
    await userEvent.click(screen.getByRole('button', { name: 'Create post' }));

    expect(await screen.findByRole('heading', { name: 'Posts list' })).toBeInTheDocument();
  });

  it('does not submit while the form is invalid', async () => {
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Create post' }));

    expect(await screen.findByText('Title is required.')).toBeInTheDocument();
    expect(provider.create).not.toHaveBeenCalled();
  });

  it('cancel returns to the list', async () => {
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('heading', { name: 'Posts list' })).toBeInTheDocument();
  });
});

describe('<EditPage>', () => {
  const render = (permissions = ['*']) =>
    renderPage(<EditPage resource={resource} />, {
      path: '/posts/:id/edit',
      route: '/posts/7/edit',
      permissions,
    });

  it('fetches the record by the route id', async () => {
    render();

    await waitFor(() => expect(provider.getOne).toHaveBeenCalledWith('posts', '7'));
  });

  it('titles the page with the record title', async () => {
    render();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello world' }),
    ).toBeInTheDocument();
  });

  it('populates the form from the record', async () => {
    render();

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Hello world'),
    );
    expect(screen.getByLabelText('Excerpt')).toHaveValue('A summary');
  });

  it('shows a loading skeleton before the record arrives', () => {
    provider.getOne.mockReturnValue(pending());

    const { container } = render();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
  });

  it('updates the record through the provider', async () => {
    render();
    const title = await screen.findByRole('textbox', { name: 'Title' });

    await userEvent.clear(title);
    await userEvent.type(title, 'Edited');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(provider.update).toHaveBeenCalledWith('posts', '7', {
        title: 'Edited',
        excerpt: 'A summary',
      }),
    );
  });

  it('reports success after saving', async () => {
    render();
    await screen.findByRole('textbox', { name: 'Title' });

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Post updated.'));
  });

  it('offers view and delete actions once the record loads', async () => {
    render();

    expect(await screen.findByRole('link', { name: 'View' })).toHaveAttribute('href', '/posts/7');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides the delete action from a user without the permission', async () => {
    render(['post.view', 'post.update']);
    await screen.findByRole('textbox', { name: 'Title' });

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('shows an error state when the record cannot be loaded', async () => {
    provider.getOne.mockRejectedValue(new Error('Record not found'));

    render();

    expect(await screen.findByText('Could not load this table')).toBeInTheDocument();
    expect(screen.getByText('Record not found')).toBeInTheDocument();
  });

  it('retries the fetch from the error state', async () => {
    provider.getOne.mockRejectedValueOnce(new Error('Boom'));
    provider.getOne.mockResolvedValue(record);

    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Hello world'),
    );
  });

  it('links the middle breadcrumb to the record view', async () => {
    render();
    await screen.findByRole('textbox', { name: 'Title' });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Hello world' })).toHaveAttribute(
      'href',
      '/posts/7',
    );
  });
});

describe('<ViewPage>', () => {
  const render = (permissions = ['*']) =>
    renderPage(<ViewPage resource={resource} />, {
      path: '/posts/:id',
      route: '/posts/7',
      permissions,
    });

  it('fetches and titles the record', async () => {
    render();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello world' }),
    ).toBeInTheDocument();
    expect(provider.getOne).toHaveBeenCalledWith('posts', '7');
  });

  it('renders a definition list of the table columns', async () => {
    render();
    await screen.findByRole('heading', { name: 'Hello world' });

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders each column value through its cell renderer', async () => {
    render();

    // BadgeColumn labelizes the value.
    expect(await screen.findByText('Draft')).toBeInTheDocument();
  });

  it('prefers an explicit infolist over the table columns', async () => {
    const withInfolist = defineResource({
      ...resource,
      infolist: [TextColumn.make('excerpt')],
    });

    renderPage(<ViewPage resource={withInfolist} />, { path: '/posts/:id', route: '/posts/7' });
    await screen.findByRole('heading', { name: 'Hello world' });

    expect(screen.getByText('Excerpt')).toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('drops an entry the user is not permitted to see', async () => {
    const gated = defineResource({
      ...resource,
      infolist: [TextColumn.make('title'), TextColumn.make('revenue').authorize('finance.view')],
    });

    renderPage(<ViewPage resource={gated} />, {
      path: '/posts/:id',
      route: '/posts/7',
      permissions: ['post.view'],
    });
    await screen.findByRole('heading', { name: 'Hello world' });

    expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
  });

  it('shows skeletons while loading', () => {
    provider.getOne.mockReturnValue(pending());

    const { container } = render();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('offers edit and delete actions', async () => {
    render();

    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/posts/7/edit',
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides the edit action when the edit page is disabled', async () => {
    const noEdit = defineResource({ ...resource, pages: { edit: false } });

    renderPage(<ViewPage resource={noEdit} />, { path: '/posts/:id', route: '/posts/7' });
    await screen.findByRole('heading', { name: 'Hello world' });

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows an error state when the record cannot be loaded', async () => {
    provider.getOne.mockRejectedValue(new Error('Gone'));

    render();

    expect(await screen.findByText('Could not load this table')).toBeInTheDocument();
  });
});
