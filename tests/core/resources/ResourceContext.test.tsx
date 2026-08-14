import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defineResource } from '@/core/resources/Resource';
import {
  ResourceProvider,
  useResource,
  useResourceContext,
} from '@/core/resources/ResourceContext';
import { TextColumn } from '@/core/tables/columns/TextColumn';

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  table: { columns: [TextColumn.make('title')] },
});

function Probe() {
  const current = useResource();
  const context = useResourceContext();

  return (
    <button type="button" onClick={() => context?.refresh()}>
      {current.labels.plural}
    </button>
  );
}

describe('useResource', () => {
  it('reads the resource from the nearest provider', () => {
    render(
      <ResourceProvider resource={resource} refresh={vi.fn()}>
        <Probe />
      </ResourceProvider>,
    );

    expect(screen.getByRole('button', { name: 'Posts' })).toBeInTheDocument();
  });

  it('throws outside a provider rather than returning undefined', () => {
    // React logs the error it re-throws from the failed render.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Probe />)).toThrow('useResource must be used inside <ResourceProvider>.');
  });
});

describe('useResourceContext', () => {
  it('returns null outside a provider so optional consumers can cope', () => {
    function Optional() {
      return <span>{String(useResourceContext())}</span>;
    }

    render(<Optional />);

    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('exposes the refresh callback the provider was given', async () => {
    const refresh = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');

    render(
      <ResourceProvider resource={resource} refresh={refresh}>
        <Probe />
      </ResourceProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Posts' }));

    expect(refresh).toHaveBeenCalledOnce();
  });
});
