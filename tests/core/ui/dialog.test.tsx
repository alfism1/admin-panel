import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
  dialogWidths,
  type DialogWidth,
} from '@/core/ui/dialog';

function renderDialog(props: { width?: DialogWidth; hideClose?: boolean } = {}) {
  return render(
    <Dialog defaultOpen>
      <DialogContent {...props}>
        <DialogHeader className="custom-header">
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>This removes everything.</DialogDescription>
        </DialogHeader>
        <p>Body copy</p>
        <DialogFooter className="custom-footer">
          <DialogClose>Cancel</DialogClose>
          <button type="button">Confirm</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
}

describe('<Dialog>', () => {
  it('opens from its trigger', async () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Panel</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('names itself from its title and description', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Delete account');
    expect(dialog).toHaveAccessibleDescription('This removes everything.');
  });

  it('renders header, body and footer content', () => {
    const { container } = renderDialog();

    expect(screen.getByText('Body copy')).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('.custom-header')).toBeInTheDocument();

    const footer = container.ownerDocument.querySelector('.custom-footer') as HTMLElement;
    expect(footer).toHaveClass('sm:justify-end');
    expect(within(footer).getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('offers a close button by default', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the close button on request', () => {
    renderDialog({ hideClose: true });

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('closes from a DialogClose in the footer', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(Object.keys(dialogWidths) as DialogWidth[])('applies the %s width', (width) => {
    renderDialog({ width });

    expect(screen.getByRole('dialog')).toHaveClass(dialogWidths[width]);
  });

  it('defaults to the medium width', () => {
    renderDialog();

    expect(screen.getByRole('dialog')).toHaveClass(dialogWidths.md);
  });

  it('merges a custom class onto the overlay', () => {
    const { container } = render(
      <Dialog defaultOpen>
        <DialogOverlay className="custom-overlay" />
        <DialogContent>
          <DialogTitle>Panel</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const overlay = container.ownerDocument.querySelector('.custom-overlay');
    expect(overlay).toHaveClass('fixed', 'inset-0');
  });

  it('forwards refs to the content, title and description', () => {
    const content = { current: null } as React.RefObject<HTMLDivElement | null>;
    const title = { current: null } as React.RefObject<HTMLHeadingElement | null>;
    const description = { current: null } as React.RefObject<HTMLParagraphElement | null>;

    render(
      <Dialog defaultOpen>
        <DialogContent ref={content}>
          <DialogTitle ref={title} className="custom-title">
            Panel
          </DialogTitle>
          <DialogDescription ref={description} className="custom-description">
            Detail
          </DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(content.current).toBeInstanceOf(HTMLElement);
    expect(title.current).toHaveClass('custom-title', 'font-semibold');
    expect(description.current).toHaveClass('custom-description', 'text-sm');
  });

  it('reports closing through onOpenChange', async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Panel</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
