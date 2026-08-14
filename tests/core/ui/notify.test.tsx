import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = Object.assign(vi.fn(), {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
});

vi.mock('sonner', () => ({
  toast,
  Toaster: (props: Record<string, unknown>) => (
    <div data-testid="sonner" data-theme={String(props.theme)} />
  ),
}));

const { notify, Toaster } = await import('@/core/ui/notify');
const { useTheme } = await import('@/core/ui/useTheme');

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  toast.info.mockClear();
  toast.warning.mockClear();
});

describe('notify shorthands', () => {
  it.each(['success', 'error', 'info', 'warning'] as const)('raises a %s toast', (kind) => {
    notify[kind]('Saved', 'Everything went through');

    expect(toast[kind]).toHaveBeenCalledWith('Saved', { description: 'Everything went through' });
  });

  it.each(['success', 'error', 'info', 'warning'] as const)(
    'allows a %s toast with no description',
    (kind) => {
      notify[kind]('Saved');

      expect(toast[kind]).toHaveBeenCalledWith('Saved', { description: undefined });
    },
  );
});

describe('notify.show', () => {
  it('defaults to an info toast', () => {
    notify.show({ title: 'Heads up' });

    expect(toast.info).toHaveBeenCalledWith('Heads up', {
      description: undefined,
      duration: undefined,
    });
  });

  it('routes to the requested type and carries a duration', () => {
    notify.show({ title: 'Gone', description: 'Deleted', type: 'error', duration: 5000 });

    expect(toast.error).toHaveBeenCalledWith('Gone', { description: 'Deleted', duration: 5000 });
  });
});

describe('<Toaster>', () => {
  it('follows the resolved theme', () => {
    useTheme.getState().setTheme('dark');
    const { getByTestId, rerender } = render(<Toaster />);

    expect(getByTestId('sonner')).toHaveAttribute('data-theme', 'dark');

    useTheme.getState().setTheme('light');
    rerender(<Toaster />);

    expect(getByTestId('sonner')).toHaveAttribute('data-theme', 'light');
  });
});
