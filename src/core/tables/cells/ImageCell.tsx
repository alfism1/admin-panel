import { initials } from '@/lib/labelize';
import { cn, getPath } from '@/lib/utils';
import type { ImageColumnConfig } from '../columns/ImageColumn';
import type { ColumnRenderProps } from '../types';

export function ImageCell({ config, value, record }: ColumnRenderProps<ImageColumnConfig>) {
  const urls = (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === 'string' && item ? item : null))
    .filter((item): item is string => item !== null);

  const sources = urls.length > 0 ? urls : config.defaultImageUrl ? [config.defaultImageUrl] : [];
  const style = { width: config.size, height: config.size } as const;
  const rounded = config.shape === 'circle' ? 'rounded-full' : 'rounded-md';

  if (sources.length === 0) {
    const label = String(getPath(record, 'name') ?? getPath(record, 'title') ?? '?');
    return (
      <span
        style={style}
        className={cn(
          'bg-muted text-muted-foreground inline-flex items-center justify-center text-xs font-medium',
          rounded,
        )}
      >
        {initials(label) || '?'}
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center', config.stacked && '-space-x-2')}>
      {sources.slice(0, 4).map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          style={style}
          className={cn('ring-card object-cover ring-2', rounded)}
        />
      ))}
    </span>
  );
}
