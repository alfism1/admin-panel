import { cn } from '@/lib/utils';
import type { TernaryFilter } from '../TernaryFilter';
import type { FilterRenderProps } from '../../types';

export function TernaryFilterControl({ filter, value, onChange }: FilterRenderProps) {
  const config = (filter as TernaryFilter).definition;
  const choices = [
    { value: '', label: config.blankLabel },
    { value: 'true', label: config.trueLabel },
    { value: 'false', label: config.falseLabel },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={filter.resolveLabel()}
      className="border-input inline-flex rounded-md border p-0.5"
    >
      {choices.map((choice) => (
        <button
          key={choice.value || 'any'}
          type="button"
          role="radio"
          aria-checked={value === choice.value}
          onClick={() => onChange(choice.value)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === choice.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
