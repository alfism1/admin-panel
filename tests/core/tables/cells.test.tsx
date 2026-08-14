import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BadgeCell } from '@/core/tables/cells/BadgeCell';
import { BooleanCell } from '@/core/tables/cells/BooleanCell';
import { DateCell } from '@/core/tables/cells/DateCell';
import { ImageCell } from '@/core/tables/cells/ImageCell';
import { TextCell } from '@/core/tables/cells/TextCell';
import type { BadgeColumnConfig } from '@/core/tables/columns/BadgeColumn';
import type { BooleanColumnConfig } from '@/core/tables/columns/BooleanColumn';
import type { DateColumnConfig } from '@/core/tables/columns/DateColumn';
import type { ImageColumnConfig } from '@/core/tables/columns/ImageColumn';
import type { TextColumnConfig } from '@/core/tables/columns/TextColumn';
import type { RecordShape } from '@/core/data/types';

const record: RecordShape = { id: 1, name: 'Ada Lovelace' };

describe('<TextCell>', () => {
  const renderCell = (config: Partial<TextColumnConfig>, value: unknown) =>
    render(
      <TextCell
        config={{ name: 'value', ...config } as TextColumnConfig}
        value={value}
        record={record}
      />,
    );

  it('renders the value', () => {
    renderCell({}, 'Hello');
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it.each([null, undefined, ''])('renders an em dash for %o', (value) => {
    renderCell({}, value);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('prefers a configured fallback over the em dash', () => {
    renderCell({ fallback: 'None' }, null);
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('falls back to the placeholder when no default is set', () => {
    renderCell({ placeholder: 'Unset' }, null);
    expect(screen.getByText('Unset')).toBeInTheDocument();
  });

  it('renders zero rather than treating it as empty', () => {
    renderCell({}, 0);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('truncates by character limit', () => {
    renderCell({ limit: 5 }, 'abcdefghij');
    expect(screen.getByText('abcde…')).toBeInTheDocument();
  });

  it('leaves a short value untruncated', () => {
    renderCell({ limit: 50 }, 'short');
    expect(screen.getByText('short')).toBeInTheDocument();
  });

  it('truncates by word count', () => {
    renderCell({ words: 2 }, 'one two three four');
    expect(screen.getByText('one two…')).toBeInTheDocument();
  });

  it('formats money', () => {
    renderCell({ money: { currency: 'USD', locale: 'en-US' } }, 1234.5);
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
  });

  it('treats a non-numeric money value as zero', () => {
    renderCell({ money: { currency: 'USD', locale: 'en-US' } }, 'abc');
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('formats a number to the configured decimals', () => {
    renderCell({ numericDecimals: 2 }, 5);
    expect(screen.getByText('5.00')).toBeInTheDocument();
  });

  it('renders prefix and suffix around the value', () => {
    const { container } = renderCell({ prefix: '$', suffix: ' USD' }, '10');
    expect(container.textContent).toBe('$10 USD');
  });

  it('renders as a badge when asked', () => {
    renderCell({ asBadge: true, badgeTone: 'success' }, 'Published');
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('renders a description below the value', () => {
    renderCell({ description: { resolve: (row) => String(row.name), position: 'below' } }, 'x');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders a description above the value', () => {
    renderCell({ description: { resolve: () => 'sub', position: 'above' } }, 'x');
    expect(screen.getByText('sub')).toBeInTheDocument();
  });

  it('offers a copy button only when copyable and non-empty', () => {
    renderCell({ copyable: true }, 'copy me');
    expect(screen.getByRole('button', { name: 'Copy copy me' })).toBeInTheDocument();
  });

  it('hides the copy button for an empty value', () => {
    renderCell({ copyable: true }, '');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('writes the raw value to the clipboard, not the truncated text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderCell({ copyable: true, limit: 3 }, 'abcdefgh');
    await userEvent.click(screen.getByRole('button'));

    expect(writeText).toHaveBeenCalledWith('abcdefgh');
  });
});

describe('<BadgeCell>', () => {
  const renderCell = (config: Partial<BadgeColumnConfig>, value: unknown) =>
    render(
      <BadgeCell
        config={{ name: 'status', ...config } as BadgeColumnConfig}
        value={value}
        record={record}
      />,
    );

  it('labelizes the value', () => {
    renderCell({}, 'in_review');
    expect(screen.getByText('In Review')).toBeInTheDocument();
  });

  it.each([null, undefined, ''])('renders an em dash for %o', (value) => {
    renderCell({}, value);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('uses a configured fallback when empty', () => {
    renderCell({ fallback: 'No status' }, null);
    expect(screen.getByText('No status')).toBeInTheDocument();
  });

  it('resolves a tone from the map', () => {
    renderCell({ colorMap: { published: 'success' } }, 'published');
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('resolves a tone from a function', () => {
    const colorMap = vi.fn().mockReturnValue('danger' as const);
    renderCell({ colorMap }, 'archived');

    expect(colorMap).toHaveBeenCalledWith('archived', record);
  });

  it('renders a mapped icon', () => {
    const { container } = renderCell({ iconMap: { published: 'check' } }, 'published');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('<BooleanCell>', () => {
  const renderCell = (config: Partial<BooleanColumnConfig>, value: unknown) =>
    render(
      <BooleanCell
        config={{ name: 'active', ...config } as BooleanColumnConfig}
        value={value}
        record={record}
      />,
    );

  it.each([true, 1, '1', 'true'])('reads %o as yes', (value) => {
    renderCell({}, value);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it.each([false, 0, '0', 'false', null, undefined, ''])('reads %o as no', (value) => {
    renderCell({}, value);
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('exposes the state to assistive tech only', () => {
    const { container } = renderCell({}, true);
    expect(screen.getByText('Yes')).toHaveClass('sr-only');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('<DateCell>', () => {
  const renderCell = (config: Partial<DateColumnConfig>, value: unknown) =>
    render(
      <DateCell
        config={{ name: 'at', ...config } as DateColumnConfig}
        value={value}
        record={record}
      />,
    );

  it('formats an ISO string with the configured pattern', () => {
    renderCell({ format: 'yyyy-MM-dd' }, '2024-03-01T10:00:00Z');
    expect(screen.getByText('2024-03-01')).toBeInTheDocument();
  });

  it('emits a machine-readable datetime attribute', () => {
    const { container } = renderCell({ format: 'yyyy-MM-dd' }, '2024-03-01T10:00:00Z');
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2024-03-01T10:00:00.000Z');
  });

  it('accepts a Date and an epoch', () => {
    renderCell({ format: 'yyyy' }, new Date('2024-03-01T00:00:00Z'));
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it.each([null, undefined, '', 'not a date'])('renders an em dash for %o', (value) => {
    renderCell({}, value);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('uses a configured fallback for an unreadable value', () => {
    renderCell({ fallback: 'Never' }, null);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('renders a relative time when since() is on', () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    renderCell({ relative: true }, recent);
    expect(screen.getByText(/ago$/)).toBeInTheDocument();
  });
});

describe('<ImageCell>', () => {
  const renderCell = (config: Partial<ImageColumnConfig>, value: unknown, row = record) =>
    render(
      <ImageCell
        config={{ name: 'avatar', shape: 'square', size: 32, ...config } as ImageColumnConfig}
        value={value}
        record={row}
      />,
    );

  it('renders an image for a url', () => {
    const { container } = renderCell({}, '/a.png');
    expect(container.querySelector('img')).toHaveAttribute('src', '/a.png');
  });

  it('renders initials when there is no image', () => {
    renderCell({}, null);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('falls back to the title when the record has no name', () => {
    renderCell({}, null, { id: 2, title: 'Hello World' });
    expect(screen.getByText('HW')).toBeInTheDocument();
  });

  it('renders a question mark when there is nothing to initialise', () => {
    renderCell({}, null, { id: 3 });
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('uses the default image before falling back to initials', () => {
    const { container } = renderCell({ defaultImageUrl: '/placeholder.png' }, null);
    expect(container.querySelector('img')).toHaveAttribute('src', '/placeholder.png');
  });

  it('renders several images for an array value', () => {
    const { container } = renderCell({}, ['/a.png', '/b.png']);
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('caps the stack at four images', () => {
    const { container } = renderCell({}, ['/a.png', '/b.png', '/c.png', '/d.png', '/e.png']);
    expect(container.querySelectorAll('img')).toHaveLength(4);
  });

  it('drops empty entries from an array value', () => {
    const { container } = renderCell({}, ['/a.png', '', null]);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('applies the configured size', () => {
    const { container } = renderCell({ size: 48 }, '/a.png');
    expect(container.querySelector('img')).toHaveStyle({ width: '48px', height: '48px' });
  });
});
