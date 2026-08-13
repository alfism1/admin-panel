import { Input } from '@/core/ui/input';
import type { FilterRenderProps } from '../../types';

export function DateRangeFilterControl({ filter, value, onChange }: FilterRenderProps) {
  const [from = '', to = ''] = value.split('..');
  const emit = (nextFrom: string, nextTo: string) =>
    onChange(nextFrom || nextTo ? `${nextFrom}..${nextTo}` : '');

  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={from}
        max={to || undefined}
        aria-label={`${filter.resolveLabel()} from`}
        onChange={(event) => emit(event.target.value, to)}
      />
      <span className="text-muted-foreground text-xs">to</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        aria-label={`${filter.resolveLabel()} to`}
        onChange={(event) => emit(from, event.target.value)}
      />
    </div>
  );
}
