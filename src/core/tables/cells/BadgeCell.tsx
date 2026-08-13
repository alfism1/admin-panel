import { Icon } from '@/core/ui/icon';
import { Badge, type BadgeTone } from '@/core/ui/misc';
import { labelize } from '@/lib/labelize';
import type { BadgeColumnConfig } from '../columns/BadgeColumn';
import type { ColumnRenderProps } from '../types';

export function BadgeCell({ config, value, record }: ColumnRenderProps<BadgeColumnConfig>) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">{config.fallback ?? '—'}</span>;
  }

  const key = String(value);
  const tone: BadgeTone =
    typeof config.colorMap === 'function'
      ? config.colorMap(value, record)
      : (config.colorMap?.[key] ?? 'gray');

  return (
    <Badge tone={tone}>
      <Icon name={config.iconMap?.[key]} className="size-3" />
      {labelize(key)}
    </Badge>
  );
}
