import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/core/ui/misc';
import { cn } from '@/lib/utils';
import type { TextColumnConfig, TextTone, TextWeight } from '../columns/TextColumn';
import type { ColumnRenderProps } from '../types';

const WEIGHTS: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const TONES: Record<TextTone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

function truncate(text: string, config: TextColumnConfig): string {
  if (config.words) {
    const parts = text.split(/\s+/);
    if (parts.length > config.words) return `${parts.slice(0, config.words).join(' ')}…`;
  }
  if (config.limit && text.length > config.limit) return `${text.slice(0, config.limit)}…`;
  return text;
}

function formatValue(value: unknown, config: TextColumnConfig): string {
  if (config.money) {
    return new Intl.NumberFormat(config.money.locale ?? 'en-US', {
      style: 'currency',
      currency: config.money.currency,
    }).format(Number(value) || 0);
  }
  if (config.numericDecimals !== undefined) {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: config.numericDecimals,
      maximumFractionDigits: config.numericDecimals,
    }).format(Number(value) || 0);
  }
  return truncate(String(value), config);
}

export function TextCell({ config, value, record }: ColumnRenderProps<TextColumnConfig>) {
  const [copied, setCopied] = React.useState(false);

  const isEmpty = value === null || value === undefined || value === '';
  const text = isEmpty
    ? (config.fallback ?? config.placeholder ?? '—')
    : formatValue(value, config);
  const description = config.description?.resolve(record);

  const body = config.asBadge ? (
    <Badge tone={config.badgeTone ?? 'gray'}>{text}</Badge>
  ) : (
    <span
      className={cn(
        WEIGHTS[config.weight ?? 'normal'],
        TONES[config.tone ?? (isEmpty ? 'muted' : 'default')],
        !config.wrap && 'truncate',
      )}
    >
      {config.prefix}
      {text}
      {config.suffix}
    </span>
  );

  const copyButton = config.copyable && !isEmpty && (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(String(value));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={`Copy ${text}`}
      className="opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
    >
      {copied ? (
        <Check className="text-success size-3.5" />
      ) : (
        <Copy className="text-muted-foreground size-3.5" />
      )}
    </button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {description && config.description?.position === 'above' ? (
        <span className="text-muted-foreground text-xs">{description}</span>
      ) : null}
      <span className="flex min-w-0 items-center gap-1.5">
        {body}
        {copyButton}
      </span>
      {description && config.description?.position === 'below' ? (
        <span className="text-muted-foreground truncate text-xs">{description}</span>
      ) : null}
    </div>
  );
}
