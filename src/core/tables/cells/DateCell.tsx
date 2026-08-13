import { format as formatDate, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import type { DateColumnConfig } from '../columns/DateColumn';
import type { ColumnRenderProps } from '../types';

function parse(value: unknown): Date | null {
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string' || !value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

export function DateCell({ config, value }: ColumnRenderProps<DateColumnConfig>) {
  const date = parse(value);
  if (!date) return <span className="text-muted-foreground">{config.fallback ?? '—'}</span>;

  const absolute = config.timezone
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: config.timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
    : formatDate(date, config.format ?? 'dd MMM yyyy');

  return (
    <time dateTime={date.toISOString()} className="whitespace-nowrap">
      {config.relative ? formatDistanceToNow(date, { addSuffix: true }) : absolute}
    </time>
  );
}
