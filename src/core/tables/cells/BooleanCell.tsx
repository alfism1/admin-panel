import { Icon } from '@/core/ui/icon';
import { cn } from '@/lib/utils';
import type { BooleanColumnConfig, BooleanTone } from '../columns/BooleanColumn';
import type { ColumnRenderProps } from '../types';

const TONES: Record<BooleanTone, string> = {
  success: 'text-success',
  danger: 'text-destructive',
  warning: 'text-warning',
  gray: 'text-muted-foreground',
  primary: 'text-primary',
};

export function BooleanCell({ config, value }: ColumnRenderProps<BooleanColumnConfig>) {
  const truthy = value === true || value === 1 || value === '1' || value === 'true';
  const icon = truthy ? (config.trueIcon ?? 'check-circle') : (config.falseIcon ?? 'x-circle');
  const tone = truthy ? (config.trueTone ?? 'success') : (config.falseTone ?? 'gray');

  return (
    <span className="inline-flex items-center justify-center">
      <Icon name={icon} className={cn('size-4', TONES[tone])} />
      <span className="sr-only">{truthy ? 'Yes' : 'No'}</span>
    </span>
  );
}
