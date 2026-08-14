import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ListMeta } from '@/core/data/types';
import { TablePagination } from '@/core/tables/TablePagination';

function setup(meta: Partial<ListMeta> = {}) {
  const onPageChange = vi.fn();
  const onPerPageChange = vi.fn();

  render(
    <TablePagination
      meta={{ total: 100, page: 2, perPage: 25, lastPage: 4, ...meta }}
      perPageOptions={[10, 25, 50]}
      onPageChange={onPageChange}
      onPerPageChange={onPerPageChange}
    />,
  );

  return { onPageChange, onPerPageChange };
}

describe('range summary', () => {
  it('reports the current slice', () => {
    setup();
    const summary = screen.getByRole('navigation', { name: 'Pagination' });

    expect(summary.textContent).toContain('26');
    expect(summary.textContent).toContain('50');
    expect(summary.textContent).toContain('100');
  });

  it('starts at 1 on the first page', () => {
    setup({ page: 1 });
    expect(screen.getByRole('navigation').textContent).toContain('1');
  });

  it('reports 0 when there are no records', () => {
    setup({ total: 0, page: 1, lastPage: 1 });
    const text = screen.getByRole('navigation').textContent ?? '';

    expect(text).toContain('0');
  });

  it('clamps the upper bound to the total on a partial last page', () => {
    setup({ total: 30, page: 2, perPage: 25, lastPage: 2 });
    expect(screen.getByRole('navigation').textContent).toContain('30');
  });

  it('shows the page position', () => {
    setup();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });
});

describe('page navigation', () => {
  it('steps forward and back', async () => {
    const { onPageChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('jumps to the first and last pages', async () => {
    const { onPageChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'First page' }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole('button', { name: 'Last page' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables backward navigation on the first page', () => {
    setup({ page: 1 });

    expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('disables forward navigation on the last page', () => {
    setup({ page: 4 });

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('disables every control when there is only one page', () => {
    setup({ page: 1, lastPage: 1, total: 5 });

    for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});

describe('rows per page', () => {
  it('exposes a labelled control showing the current size', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('25');
  });
});
