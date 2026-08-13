import type { Action } from '@/core/actions/Action';
import { ActionRenderer } from '@/core/actions/ActionRenderer';
import type { RecordShape } from '@/core/data/types';
import { Skeleton } from '@/core/ui/misc';
import type { Column } from './Column';
import { CellRenderer } from './CellRenderer';

interface TableCardsProps {
  rows: RecordShape[];
  columns: Column[];
  actions: Action[];
  loading: boolean;
}

/** Below `md` a horizontal scrollbar is unusable, so rows become stacked cards. */
export function TableCards({ rows, columns, actions, loading }: TableCardsProps) {
  if (loading) {
    return (
      <div className="space-y-2 p-3 md:hidden">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) return null;

  // Unlabelled leading columns (avatars, thumbnails) sit beside the heading
  // rather than becoming it, so the card is titled by something readable.
  const primaryIndex = Math.max(
    0,
    columns.findIndex((column) => column.resolveLabel() !== ''),
  );
  const leading = columns.slice(0, primaryIndex);
  const primary = columns[primaryIndex];
  const rest = columns.slice(primaryIndex + 1);

  return (
    <ul className="divide-border divide-y md:hidden">
      {rows.map((record) => (
        <li key={String(record.id)} className="space-y-2.5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 font-medium">
              {leading.map((column) => (
                <CellRenderer key={column.name} column={column} record={record} />
              ))}
              {primary ? <CellRenderer column={primary} record={record} /> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions.map((action) => (
                <ActionRenderer key={action.name} action={action} record={record} />
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
            {rest.map((column) => (
              <div key={column.name} className="contents">
                <dt className="text-muted-foreground truncate">{column.resolveLabel()}</dt>
                <dd className="min-w-0">
                  <CellRenderer column={column} record={record} />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
