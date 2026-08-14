import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Action } from '@/core/actions/Action';
import { defineResource } from '@/core/resources/Resource';
import { ResourceProvider } from '@/core/resources/ResourceContext';
import { ImageColumn } from '@/core/tables/columns/ImageColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { TableCards } from '@/core/tables/TableCards';
import { TooltipProvider } from '@/core/ui/tooltip';
import { renderWithProviders } from '../../helpers/render';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const resource = defineResource({
  name: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  table: { columns: [TextColumn.make('title')] },
});

const rows = [
  { id: 1, title: 'First post', status: 'draft', avatar: '/a.png' },
  { id: 2, title: 'Second post', status: 'published', avatar: null },
];

type CardsProps = React.ComponentProps<typeof TableCards>;

function renderCards(overrides: Partial<CardsProps> = {}) {
  const props: CardsProps = {
    rows,
    columns: [TextColumn.make('title'), TextColumn.make('status')],
    actions: [],
    loading: false,
    ...overrides,
  };

  return renderWithProviders(
    <TooltipProvider>
      <ResourceProvider resource={resource} refresh={() => undefined}>
        <TableCards {...props} />
      </ResourceProvider>
    </TooltipProvider>,
  );
}

describe('loading', () => {
  it('renders placeholder cards while loading', () => {
    const { container } = renderCards({ loading: true });

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders placeholders even when rows are already present', () => {
    const { container } = renderCards({ loading: true, rows });

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });
});

describe('empty', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = renderCards({ rows: [] });

    expect(container).toBeEmptyDOMElement();
  });
});

describe('card content', () => {
  it('renders one card per row', () => {
    renderCards();

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('titles each card with the first labelled column', () => {
    renderCards();

    const [first] = screen.getAllByRole('listitem');
    expect(within(first).getByText('First post')).toBeInTheDocument();
  });

  it('renders the remaining columns as a labelled definition list', () => {
    renderCards();

    const [first] = screen.getAllByRole('listitem');
    expect(within(first).getByText('Status')).toBeInTheDocument();
    expect(within(first).getByText('draft')).toBeInTheDocument();
  });

  it('does not repeat the primary column in the definition list', () => {
    renderCards();

    const [first] = screen.getAllByRole('listitem');
    expect(within(first).queryByText('Title')).not.toBeInTheDocument();
  });

  it('places an unlabelled leading column beside the heading rather than as it', () => {
    renderCards({
      columns: [
        ImageColumn.make('avatar').label(''),
        TextColumn.make('title'),
        TextColumn.make('status'),
      ],
    });

    const [first] = screen.getAllByRole('listitem');
    expect(within(first).getByText('First post')).toBeInTheDocument();
    // `alt=""` makes the thumbnail presentational, so it has no img role.
    expect(first.querySelector('img')).toHaveAttribute('src', '/a.png');
  });

  it('falls back to the first column when every column is unlabelled', () => {
    renderCards({ columns: [TextColumn.make('title').label('')] });

    const [first] = screen.getAllByRole('listitem');
    expect(within(first).getByText('First post')).toBeInTheDocument();
  });

  it('renders each value through its cell renderer', () => {
    renderCards({ columns: [TextColumn.make('title'), TextColumn.make('missing')] });

    const [first] = screen.getAllByRole('listitem');
    expect(within(first).getByText('—')).toBeInTheDocument();
  });
});

describe('actions', () => {
  it('renders each action on every card', () => {
    renderCards({ actions: [Action.make('flag').action(vi.fn())] });

    expect(screen.getAllByRole('button', { name: 'Flag' })).toHaveLength(2);
  });

  it('passes the card record to the action', async () => {
    const handler = vi.fn();
    renderCards({ actions: [Action.make('flag').action(handler)] });

    await userEvent.click(screen.getAllByRole('button', { name: 'Flag' })[1]);

    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
    expect(handler.mock.calls[0][0].record).toMatchObject({ id: 2 });
  });

  it('renders no action area when there are none', () => {
    renderCards();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
