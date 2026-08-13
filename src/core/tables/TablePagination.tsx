import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/core/ui/select';
import type { ListMeta } from '@/core/data/types';

interface TablePaginationProps {
  meta: ListMeta;
  perPageOptions: number[];
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}

export function TablePagination({
  meta,
  perPageOptions,
  onPageChange,
  onPerPageChange,
}: TablePaginationProps) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.perPage + 1;
  const to = Math.min(meta.page * meta.perPage, meta.total);

  return (
    <nav
      aria-label="Pagination"
      className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5"
    >
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Showing <span className="text-foreground font-medium">{from}</span>–
        <span className="text-foreground font-medium">{to}</span> of{' '}
        <span className="text-foreground font-medium">{meta.total}</span>
      </p>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-muted-foreground text-sm">Per page</span>
          <Select
            value={String(meta.perPage)}
            onValueChange={(value) => onPerPageChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {perPageOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="iconSm"
            aria-label="First page"
            disabled={meta.page <= 1}
            onClick={() => onPageChange(1)}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="iconSm"
            aria-label="Previous page"
            disabled={meta.page <= 1}
            onClick={() => onPageChange(meta.page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground px-2 text-sm tabular-nums">
            {meta.page} / {meta.lastPage}
          </span>
          <Button
            variant="outline"
            size="iconSm"
            aria-label="Next page"
            disabled={meta.page >= meta.lastPage}
            onClick={() => onPageChange(meta.page + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="iconSm"
            aria-label="Last page"
            disabled={meta.page >= meta.lastPage}
            onClick={() => onPageChange(meta.lastPage)}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}
