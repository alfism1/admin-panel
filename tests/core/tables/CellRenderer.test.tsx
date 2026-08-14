import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/core/ui/tooltip';
import { CellRenderer } from '@/core/tables/CellRenderer';
import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';
import { DateColumn } from '@/core/tables/columns/DateColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import type { Column } from '@/core/tables/Column';
import type { RecordShape } from '@/core/data/types';
import { renderWithProviders } from '../../helpers/render';

const record: RecordShape = {
  id: 1,
  name: 'Ada Lovelace',
  role: { name: 'Admin' },
  active: true,
};

function renderCell(column: Column, row: RecordShape = record) {
  return renderWithProviders(
    <TooltipProvider>
      <CellRenderer column={column} record={row} />
    </TooltipProvider>,
  );
}

describe('value resolution', () => {
  it('reads a top-level value', () => {
    renderCell(TextColumn.make('name'));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('reads a dotted path', () => {
    renderCell(TextColumn.make('role.name'));
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('renders the empty placeholder for a missing path', () => {
    renderCell(TextColumn.make('role.missing'));
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('uses the column type-specific cell', () => {
    renderCell(BooleanColumn.make('active'));
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });
});

describe('rendering overrides', () => {
  it('formatStateUsing replaces the cell body', () => {
    const column = TextColumn.make('name').formatStateUsing((value) => (
      <em>{String(value).toUpperCase()}</em>
    ));

    renderCell(column);
    expect(screen.getByText('ADA LOVELACE')).toBeInTheDocument();
  });

  it('formatStateUsing receives the value and the whole record', () => {
    const format = vi.fn().mockReturnValue('x');
    renderCell(TextColumn.make('name').formatStateUsing(format));

    expect(format).toHaveBeenCalledWith('Ada Lovelace', record);
  });

  it('customComponent replaces the cell renderer', () => {
    const Custom = () => <span>custom cell</span>;
    renderCell(TextColumn.make('name').customComponent(Custom));

    expect(screen.getByText('custom cell')).toBeInTheDocument();
  });
});

describe('interactivity', () => {
  it('wraps the cell in a link when a url resolver is set', () => {
    renderCell(TextColumn.make('name').url((row) => `/users/${String(row.id)}`));

    expect(screen.getByRole('link')).toHaveAttribute('href', '/users/1');
  });

  it('opens in a new tab when asked', () => {
    const column = TextColumn.make('name').url(() => '/users/1', { openInNewTab: true });
    renderCell(column);

    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('renders a button for an action column and passes it the record', async () => {
    const onClick = vi.fn();
    renderCell(TextColumn.make('name').action(onClick));

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledWith(record);
  });

  it('renders plain content when neither url nor action is set', () => {
    renderCell(TextColumn.make('name'));

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a tooltip trigger when a tooltip is configured', () => {
    renderCell(TextColumn.make('name').tooltip((row) => String(row.role)));

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('keeps a link click from also selecting the row', async () => {
    const onRowClick = vi.fn();
    renderWithProviders(
      <TooltipProvider>
        <div onClick={onRowClick}>
          <CellRenderer
            column={TextColumn.make('name').url((row) => `/users/${String(row.id)}`)}
            record={record}
          />
        </div>
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole('link'));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('keeps an action click from also selecting the row', async () => {
    const onRowClick = vi.fn();
    const onClick = vi.fn();
    renderWithProviders(
      <TooltipProvider>
        <div onClick={onRowClick}>
          <CellRenderer column={TextColumn.make('name').action(onClick)} record={record} />
        </div>
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledWith(record);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders a date column through its own cell', () => {
    const { container } = renderCell(DateColumn.make('joined_at').dateFormat('yyyy-MM-dd'), {
      ...record,
      joined_at: '2024-03-01T00:00:00.000Z',
    });

    expect(container.querySelector('time')).toHaveTextContent('2024-03-01');
  });
});

describe('alignment', () => {
  it('defaults to start', () => {
    const { container } = renderCell(TextColumn.make('name'));
    expect(container.querySelector('.justify-start')).toBeInTheDocument();
  });

  it('honours the column alignment', () => {
    const { container } = renderCell(TextColumn.make('name').alignEnd());
    expect(container.querySelector('.justify-end')).toBeInTheDocument();
  });

  it('centres a boolean column by default', () => {
    const { container } = renderCell(BooleanColumn.make('active'));
    expect(container.querySelector('.justify-center')).toBeInTheDocument();
  });
});
