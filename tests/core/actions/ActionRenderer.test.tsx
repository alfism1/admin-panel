import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Action } from '@/core/actions/Action';
import { ActionRenderer } from '@/core/actions/ActionRenderer';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import type { DataProvider, RecordShape } from '@/core/data/types';
import { TextInput } from '@/core/forms/fields/TextInput';
import { defineResource } from '@/core/resources/Resource';
import { ResourceProvider } from '@/core/resources/ResourceContext';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/core/ui/dropdown-menu';
import { TooltipProvider } from '@/core/ui/tooltip';
import { makeUser } from '../../helpers/context';
import { renderWithProviders } from '../../helpers/render';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const { notify } = await import('@/core/ui/notify');

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  recordTitleKey: 'title',
  permissions: { view: 'post.view', update: 'post.update', delete: 'post.delete' },
  table: { columns: [TextColumn.make('title')] },
});

const record: RecordShape = { id: 7, title: 'Hello world' };

const provider = {
  getList: vi.fn(),
  getOne: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  deleteMany: vi.fn().mockResolvedValue(undefined),
  getMany: vi.fn(),
} satisfies DataProvider;

beforeEach(() => {
  setDataProvider(provider);
  provider.delete.mockClear().mockResolvedValue(undefined);
  provider.deleteMany.mockClear().mockResolvedValue(undefined);
});

afterEach(() => {
  setDataProvider(restDataProvider);
});

function renderAction(
  action: Action,
  options: {
    record?: RecordShape | null;
    records?: RecordShape[];
    withResource?: boolean;
    user?: ReturnType<typeof makeUser> | null;
    onCompleted?: () => void;
    variant?: 'button' | 'menuItem';
  } = {},
) {
  const { withResource = true, user = makeUser(), variant = 'button', ...rest } = options;
  const refresh = vi.fn();

  const renderer = (
    <ActionRenderer
      action={action}
      record={rest.record ?? null}
      records={rest.records ?? []}
      variant={variant}
      onCompleted={rest.onCompleted}
    />
  );

  const tree = (
    <TooltipProvider>
      {variant === 'menuItem' ? (
        // A menu item needs a menu around it. `modal={false}` keeps the rest of
        // the document reachable, so the dialogs it opens stay queryable.
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger>Row actions</DropdownMenuTrigger>
          <DropdownMenuContent>{renderer}</DropdownMenuContent>
        </DropdownMenu>
      ) : (
        renderer
      )}
    </TooltipProvider>
  );

  return renderWithProviders(
    withResource ? (
      <ResourceProvider resource={resource} refresh={refresh}>
        {tree}
      </ResourceProvider>
    ) : (
      tree
    ),
    { user },
  );
}

describe('navigation actions', () => {
  it('renders a built-in view action as a link to the record', () => {
    renderAction(ViewAction.make(), { record });

    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/posts/7');
  });

  it('renders a built-in edit action as a link', () => {
    renderAction(EditAction.make(), { record });

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/posts/7/edit');
  });

  it('renders a custom url action', () => {
    const action = Action.make('docs').url(() => 'https://example.com', { openInNewTab: true });
    renderAction(action, { record });

    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('authorization', () => {
  it('renders nothing when the permission is missing', () => {
    renderAction(EditAction.make(), {
      record,
      user: makeUser({ permissions: ['post.view'] }),
    });

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('renders when the resource permission is held', () => {
    renderAction(EditAction.make(), {
      record,
      user: makeUser({ permissions: ['post.update'] }),
    });

    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
  });

  it('honours an explicit permission string over the built-in one', () => {
    const action = Action.make('publish').action(vi.fn()).authorize('post.publish');

    renderAction(action, { record, user: makeUser({ permissions: ['post.publish'] }) });
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('honours a predicate authorization', () => {
    const action = Action.make('publish')
      .action(vi.fn())
      .authorize((row) => row?.title === 'Hello world');

    renderAction(action, { record });
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('renders nothing when the predicate denies', () => {
    const action = Action.make('publish')
      .action(vi.fn())
      .authorize(() => false);

    renderAction(action, { record });
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('renders nothing when the action is not visible for this record', () => {
    const action = Action.make('publish')
      .action(vi.fn())
      .visible((row) => row?.status === 'draft');

    renderAction(action, { record });
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('renders a disabled button when disabled for this record', () => {
    const action = Action.make('publish').action(vi.fn()).disabled(true);

    renderAction(action, { record });
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });
});

describe('handler actions', () => {
  it('runs the handler immediately when there is no confirmation', async () => {
    const handler = vi.fn();
    renderAction(Action.make('publish').action(handler), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(handler).toHaveBeenCalledOnce());
  });

  it('hands the handler the record and an empty data payload', async () => {
    const handler = vi.fn();
    renderAction(Action.make('publish').action(handler), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(handler.mock.calls[0][0]).toMatchObject({ record, data: {} });
  });

  it('notifies on success', async () => {
    renderAction(Action.make('publish').action(vi.fn()), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Publish completed.'));
  });

  it('uses a custom success message', async () => {
    const action = Action.make('publish').action(vi.fn()).successNotification('Post is live.');
    renderAction(action, { record });

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Post is live.'));
  });

  it('stays silent when notifications are opted out', async () => {
    const action = Action.make('publish').action(vi.fn()).successNotification(false);
    renderAction(action, { record });

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(notify.success).not.toHaveBeenCalled());
  });

  // Failure paths are covered in useActionRunner.test.tsx instead: the renderer
  // launches the run as `void execute(...)`, so a rejection here escapes as an
  // unhandled promise rejection rather than something a test can await.

  it('calls onCompleted after a successful run', async () => {
    const onCompleted = vi.fn();
    renderAction(Action.make('publish').action(vi.fn()), { record, onCompleted });

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
  });
});

describe('confirmation', () => {
  it('opens a confirmation dialog instead of running straight away', async () => {
    const handler = vi.fn();
    const action = Action.make('archive').action(handler).requiresConfirmation();

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the handler once confirmed', async () => {
    const handler = vi.fn();
    const action = Action.make('archive').action(handler).requiresConfirmation();

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await screen.findByRole('alertdialog');

    // Radix marks the background inert while the dialog is open, so the trigger
    // has left the accessibility tree and this resolves to the confirm button.
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(handler).toHaveBeenCalled());
  });

  it('does not run the handler when cancelled', async () => {
    const handler = vi.fn();
    const action = Action.make('archive').action(handler).requiresConfirmation();

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(handler).not.toHaveBeenCalled();
  });

  it('shows the configured confirmation copy', async () => {
    const action = Action.make('archive').action(vi.fn()).requiresConfirmation({
      heading: 'Archive this post?',
      description: 'It will leave the public site.',
      confirmLabel: 'Yes, archive',
      cancelLabel: 'Keep it',
    });

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Archive this post?')).toBeInTheDocument();
    expect(screen.getByText('It will leave the public site.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
  });
});

describe('built-in delete', () => {
  const confirmDelete = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  };

  it('deletes through the data provider once confirmed', async () => {
    renderAction(DeleteAction.make(), { record });

    await confirmDelete();

    await waitFor(() => expect(provider.delete).toHaveBeenCalledWith('posts', '7'));
  });

  it('reports the resource-specific success message', async () => {
    renderAction(DeleteAction.make(), { record });

    await confirmDelete();

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Post deleted.'));
  });

  it('does not delete when cancelled', async () => {
    renderAction(DeleteAction.make(), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(provider.delete).not.toHaveBeenCalled();
  });

  /**
   * KNOWN BUG — pinned so a fix is a deliberate, visible change.
   *
   * `resolveBuiltin` builds resource-aware confirmation copy for `delete` and
   * `deleteBulk` — "Delete this post?" / '"Hello world" will be permanently
   * removed.' — but `ActionRenderer` selects it with
   *
   *     const confirmation = config.confirmation ?? builtin.confirmation;
   *
   * and `DeleteAction.make()` sets `confirmation: {}`. An empty object is not
   * nullish, so `??` keeps it and the generated copy is discarded. The user
   * sees a generic "Delete?" with no idea which record is about to go. The
   * whole `confirmation` branch of `resolveBuiltin` is unreachable in the UI.
   *
   * Fix: merge instead of short-circuit —
   * `{ ...builtin.confirmation, ...config.confirmation }` — while still
   * honouring `confirmation: false`. Then flip these assertions to the copy
   * asserted in tests/core/actions/resolveAction.test.ts.
   */
  it('shows the resource-aware copy resolveBuiltin generated', async () => {
    renderAction(DeleteAction.make(), { record });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent('Delete this post?');
    expect(dialog).toHaveTextContent('"Hello world" will be permanently removed.');
  });

  it('honours an explicit opt-out of confirmation on a built-in', async () => {
    renderAction(DeleteAction.make().requiresConfirmation(false), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(provider.delete).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('an explicit confirmation on the built-in does reach the dialog', async () => {
    const action = DeleteAction.make().requiresConfirmation({
      heading: 'Remove this post?',
      confirmLabel: 'Remove it',
    });

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Remove this post?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove it' })).toBeInTheDocument();
  });
});

describe('form actions', () => {
  it('opens a modal form rather than running immediately', async () => {
    const handler = vi.fn();
    const action = Action.make('reject')
      .action(handler)
      .form([TextInput.make('reason').required()]);

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Reason/)).toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes the submitted form data to the handler', async () => {
    const handler = vi.fn();
    const action = Action.make('reject')
      .action(handler)
      .form([TextInput.make('reason')]);

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await userEvent.type(await screen.findByLabelText('Reason'), 'Not ready');
    await userEvent.click(screen.getByRole('button', { name: 'Reject', hidden: false }));

    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(handler.mock.calls[0][0]).toMatchObject({ data: { reason: 'Not ready' } });
  });

  it('blocks submission while the modal form is invalid', async () => {
    const handler = vi.fn();
    const action = Action.make('reject')
      .action(handler)
      .form([TextInput.make('reason').required()]);

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reject', hidden: false }));

    expect(await screen.findByText('Reason is required.')).toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('outside a resource', () => {
  it('still renders and runs a custom action', async () => {
    const handler = vi.fn();
    renderAction(Action.make('ping').action(handler), { withResource: false });

    await userEvent.click(screen.getByRole('button', { name: 'Ping' }));

    await waitFor(() => expect(handler).toHaveBeenCalled());
  });

  it('renders nothing for a built-in that needs resource routes', () => {
    renderAction(ViewAction.make(), { record, withResource: false });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('menu item variant', () => {
  it('renders a navigation action as a menu link', () => {
    renderAction(ViewAction.make(), { record, variant: 'menuItem' });

    expect(screen.getByRole('menuitem', { name: 'View' })).toHaveAttribute('href', '/posts/7');
  });

  it('opens a custom url in a new tab from the menu', () => {
    const action = Action.make('docs').url(() => 'https://example.com', { openInNewTab: true });
    renderAction(action, { record, variant: 'menuItem' });

    expect(screen.getByRole('menuitem', { name: 'Docs' })).toHaveAttribute('target', '_blank');
  });

  it('runs a handler action straight from the menu', async () => {
    const handler = vi.fn();
    renderAction(Action.make('ping').action(handler), { record, variant: 'menuItem' });

    await userEvent.click(screen.getByRole('menuitem', { name: 'Ping' }));

    await waitFor(() => expect(handler).toHaveBeenCalled());
  });

  it('confirms before running a destructive menu action', async () => {
    renderAction(DeleteAction.make(), { record, variant: 'menuItem' });

    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this post?');
  });

  it('styles a destructive menu action', () => {
    renderAction(DeleteAction.make(), { record, variant: 'menuItem' });

    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('text-destructive');
  });

  it('disables a menu item the action marks disabled', () => {
    const action = Action.make('ping').action(vi.fn()).disabled(true);
    renderAction(action, { record, variant: 'menuItem' });

    expect(screen.getByRole('menuitem', { name: 'Ping' })).toHaveAttribute(
      'data-disabled',
      expect.anything() as unknown as string,
    );
  });

  it('opens a modal form from the menu', async () => {
    const action = Action.make('reject')
      .action(vi.fn())
      .form([TextInput.make('reason')]);
    renderAction(action, { record, variant: 'menuItem' });

    await userEvent.click(screen.getByRole('menuitem', { name: 'Reject' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('a form action that also confirms', () => {
  const build = () =>
    Action.make('reject')
      .action(vi.fn())
      .form([TextInput.make('reason')])
      .requiresConfirmation({ heading: 'Really reject?', description: 'The author is notified.' });

  it('describes the confirmation inside the form modal', async () => {
    renderAction(build(), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('The author is notified.');
  });

  it('labels the form submit "Continue" rather than the action name', async () => {
    renderAction(build(), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('shows no description when the confirmation has none', async () => {
    const action = Action.make('reject')
      .action(vi.fn())
      .form([TextInput.make('reason')])
      .requiresConfirmation({ heading: 'Really reject?' });

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).not.toHaveTextContent('undefined');
  });

  it('confirms after the form and passes the form data to the handler', async () => {
    const handler = vi.fn();
    const action = Action.make('reject')
      .action(handler)
      .form([TextInput.make('reason')])
      .requiresConfirmation({ heading: 'Really reject?' });

    renderAction(action, { record });

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.type(await screen.findByLabelText('Reason'), 'Not ready');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(handler).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(handler.mock.calls[0][0]).toMatchObject({ data: { reason: 'Not ready' } });
  });

  it('closes the form modal from its Cancel button', async () => {
    renderAction(build(), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes the form modal when the overlay dismisses it', async () => {
    renderAction(build(), { record });

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('button sizing', () => {
  it('honours an explicit size', () => {
    renderAction(Action.make('ping').action(vi.fn()).size('lg'), { record });

    expect(screen.getByRole('button', { name: 'Ping' })).toHaveClass('h-10');
  });
});

describe('icon-only styling', () => {
  it('falls back to the grey tone when no colour is set', () => {
    renderAction(Action.make('ping').action(vi.fn()).icon('star').iconOnly(), { record });

    expect(screen.getByRole('button', { name: 'Ping' })).toHaveClass('text-muted-foreground');
  });

  it('uses the action colour when one is set', () => {
    renderAction(Action.make('ping').action(vi.fn()).icon('star').iconOnly().color('danger'), {
      record,
    });

    expect(screen.getByRole('button', { name: 'Ping' })).toHaveClass('text-destructive');
  });

  it('falls back to the grey tone on an icon-only link', () => {
    const action = Action.make('docs')
      .url(() => '/docs')
      .icon('link')
      .iconOnly();
    renderAction(action, { record });

    expect(screen.getByRole('link', { name: 'Docs' })).toHaveClass('text-muted-foreground');
  });

  it('uses the action colour on an icon-only link', () => {
    const action = Action.make('docs')
      .url(() => '/docs')
      .icon('link')
      .iconOnly()
      .color('success');
    renderAction(action, { record });

    expect(screen.getByRole('link', { name: 'Docs' })).toHaveClass('text-success');
  });
});

describe('modal width', () => {
  it('widens the form modal when asked', async () => {
    const action = Action.make('reject')
      .action(vi.fn())
      .form([TextInput.make('reason')])
      .modalWidth('2xl');

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('dialog')).toHaveClass('sm:max-w-2xl');
  });

  it('defaults the form modal to a medium width', async () => {
    const action = Action.make('reject')
      .action(vi.fn())
      .form([TextInput.make('reason')]);

    renderAction(action, { record });
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('dialog')).toHaveClass('sm:max-w-md');
  });
});
