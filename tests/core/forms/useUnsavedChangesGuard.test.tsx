import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { confirmDiscard, useUnsavedChangesGuard } from '@/core/forms/useUnsavedChangesGuard';

const MESSAGE = 'You have unsaved changes. Leave this page and discard them?';

let confirmSpy: MockInstance<(message?: string) => boolean>;

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

/** Anchors would otherwise trip jsdom's unimplemented navigation. */
const swallow = (event: React.MouseEvent) => event.preventDefault();

function Harness({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty);
  return (
    <div>
      <a href="/elsewhere" onClick={swallow}>
        Elsewhere
      </a>
      <a href="#section" onClick={swallow}>
        Anchor
      </a>
      <a href="/external" target="_blank" rel="noreferrer" onClick={swallow}>
        New tab
      </a>
      <a href="/" onClick={swallow}>
        Current page
      </a>
      <a onClick={swallow}>No href</a>
      <span>
        <a href="/nested" onClick={swallow}>
          <em>Nested label</em>
        </a>
      </span>
      <button type="button">Not a link</button>
    </div>
  );
}

const leave = () => screen.getByText('Elsewhere');

describe('beforeunload', () => {
  it('asks the browser to confirm while dirty', () => {
    render(<Harness dirty />);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    // The legacy `returnValue` getter reports `!defaultPrevented`, so assigning
    // the empty string the spec asks for reads back as `false`.
    expect(event.returnValue).toBe(false);
  });

  it('stays quiet while clean', () => {
    render(<Harness dirty={false} />);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('detaches its listeners when the form stops being dirty', () => {
    const { rerender } = render(<Harness dirty />);
    rerender(<Harness dirty={false} />);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    fireEvent.click(leave());
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('in-app navigation', () => {
  it('confirms before following a link', () => {
    render(<Harness dirty />);

    fireEvent.click(leave());

    expect(confirmSpy).toHaveBeenCalledWith(MESSAGE);
  });

  it('lets the click through when the user confirms', () => {
    render(<Harness dirty />);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    leave().dispatchEvent(event);

    // Only the harness's own handler prevented it, and that runs afterwards.
    expect(confirmSpy).toHaveBeenCalled();
  });

  it('cancels the click when the user declines', () => {
    confirmSpy.mockReturnValue(false);
    render(<Harness dirty />);

    const stopped = vi.fn();
    document.addEventListener('click', stopped);
    fireEvent.click(leave());
    document.removeEventListener('click', stopped);

    // `stopPropagation` on the capture phase means the click never bubbles.
    expect(stopped).not.toHaveBeenCalled();
  });

  it('finds the anchor from a nested target', () => {
    render(<Harness dirty />);

    fireEvent.click(screen.getByText('Nested label'));

    expect(confirmSpy).toHaveBeenCalled();
  });

  it('ignores a click that is not on a link', () => {
    render(<Harness dirty />);

    fireEvent.click(screen.getByRole('button', { name: 'Not a link' }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('ignores an anchor with no href', () => {
    render(<Harness dirty />);

    fireEvent.click(screen.getByText('No href'));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('ignores a same-page hash link', () => {
    render(<Harness dirty />);

    fireEvent.click(screen.getByText('Anchor'));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('ignores a link that opens in a new tab', () => {
    render(<Harness dirty />);

    fireEvent.click(screen.getByText('New tab'));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('ignores a link back to the current page', () => {
    render(<Harness dirty />);

    fireEvent.click(screen.getByText('Current page'));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('ignores a middle click', () => {
    render(<Harness dirty />);

    fireEvent.click(leave(), { button: 1 });

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it.each([['metaKey'], ['ctrlKey']])('ignores a %s-modified click', (modifier) => {
    render(<Harness dirty />);

    fireEvent.click(leave(), { [modifier]: true });

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('ignores a click something else already cancelled', () => {
    const preventer = (event: Event) => event.preventDefault();
    document.addEventListener('click', preventer, true);
    render(<Harness dirty />);

    try {
      fireEvent.click(leave());
    } finally {
      document.removeEventListener('click', preventer, true);
    }

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('confirmDiscard', () => {
  it('passes straight through when nothing is dirty', () => {
    expect(confirmDiscard(false)).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks when dirty and reports the answer', () => {
    expect(confirmDiscard(true)).toBe(true);
    expect(confirmSpy).toHaveBeenCalledWith(MESSAGE);

    confirmSpy.mockReturnValue(false);
    expect(confirmDiscard(true)).toBe(false);
  });
});

afterEach(() => {
  confirmSpy.mockRestore();
});
