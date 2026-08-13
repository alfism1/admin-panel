import { Link } from 'react-router';
import type { RecordShape } from '@/core/data/types';
import { Tooltip } from '@/core/ui/tooltip';
import { cn, getPath } from '@/lib/utils';
import type { Column } from './Column';
import type { ColumnAlignment } from './types';

export const ALIGNMENT: Record<ColumnAlignment, string> = {
  start: 'text-left justify-start',
  center: 'text-center justify-center',
  end: 'text-right justify-end',
};

export function CellRenderer({
  column,
  record,
  align,
}: {
  column: Column;
  record: RecordShape;
  /** Overrides the column's alignment — definition lists always read left. */
  align?: ColumnAlignment;
}) {
  const config = column.definition;
  const value = getPath(record, column.name);

  const Cell = config.custom ?? column.cell;
  const content = config.formatState ? (
    <>{config.formatState(value, record)}</>
  ) : (
    <Cell config={config} value={value} record={record} />
  );

  const aligned = (
    <span className={cn('flex min-w-0 items-center', ALIGNMENT[align ?? config.align ?? 'start'])}>
      {content}
    </span>
  );

  const interactive = config.urlResolver ? (
    <Link
      to={config.urlResolver(record)}
      target={config.openInNewTab ? '_blank' : undefined}
      onClick={(event) => event.stopPropagation()}
      className="focus-visible:ring-ring min-w-0 rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {aligned}
    </Link>
  ) : config.onClick ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        config.onClick?.(record);
      }}
      className="min-w-0 rounded-sm text-left hover:underline"
    >
      {aligned}
    </button>
  ) : (
    aligned
  );

  if (!config.tooltip) return interactive;
  return <Tooltip label={config.tooltip(record)}>{interactive}</Tooltip>;
}
