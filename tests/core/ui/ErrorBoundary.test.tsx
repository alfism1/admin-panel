import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/core/ui/ErrorBoundary';

/** React logs caught render errors; silence it so the run stays readable. */
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Boom({ message = 'Kaboom' }: { message?: string }): React.ReactElement {
  throw new Error(message);
}

describe('<ErrorBoundary>', () => {
  it('renders children while nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('catches a render error instead of blanking the app', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', { name: 'Something broke on this page' }),
    ).toBeInTheDocument();
  });

  it('shows the error message', () => {
    render(
      <ErrorBoundary>
        <Boom message="Database unreachable" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Database unreachable')).toBeInTheDocument();
  });

  it('logs the error for diagnosis', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(console.error).toHaveBeenCalled();
  });

  it('offers a retry and a way back to the dashboard', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to dashboard' })).toBeInTheDocument();
  });

  it('re-renders the children after a successful retry', async () => {
    // The condition has to come from outside the subtree. React 19 re-runs a
    // component that threw, so a self-clearing flag would recover on its own
    // and the boundary would never show its fallback at all.
    function Flaky({ broken }: { broken: boolean }) {
      if (broken) throw new Error('Still broken');
      return <p>Recovered</p>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <Flaky broken />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    // Fix the underlying cause first; the fallback stays up until it is dismissed.
    rerender(
      <ErrorBoundary>
        <Flaky broken={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
