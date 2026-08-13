import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Action } from '@/core/actions/Action';
import { ActionRenderer } from '@/core/actions/ActionRenderer';
import { Button } from '@/core/ui/button';
import { Icon } from '@/core/ui/icon';
import { Skeleton } from '@/core/ui/misc';
import { TableCell, TableRow } from '@/core/ui/table';
import type { EmptyStateOptions } from './types';

export function TableLoadingRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columns }, (_, cellIndex) => (
            <TableCell key={cellIndex}>
              <Skeleton
                className="h-4"
                style={{ width: `${50 + ((rowIndex * 7 + cellIndex * 13) % 45)}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function TableEmptyState({
  options,
  createAction,
  filtered,
  onClearFilters,
}: {
  options?: EmptyStateOptions;
  createAction?: Action;
  /** True when a search term or filter is narrowing the result set. */
  filtered?: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="bg-muted flex size-11 items-center justify-center rounded-full">
        <Icon
          name={filtered ? 'search' : (options?.icon ?? 'inbox')}
          className="text-muted-foreground size-5"
        />
      </span>
      <div className="space-y-1">
        <p className="font-medium">
          {filtered ? 'No matching records' : (options?.heading ?? 'Nothing here yet')}
        </p>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm">
          {filtered
            ? 'Try a different search term, or clear the active filters.'
            : (options?.description ?? 'Records you create will show up in this table.')}
        </p>
      </div>
      {filtered ? (
        <Button variant="outline" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : createAction ? (
        <ActionRenderer action={createAction} />
      ) : null}
    </div>
  );
}

export function TableErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="bg-destructive/10 flex size-11 items-center justify-center rounded-full">
        <AlertTriangle className="text-destructive size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-medium">Could not load this table</p>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw />
        Retry
      </Button>
    </div>
  );
}
