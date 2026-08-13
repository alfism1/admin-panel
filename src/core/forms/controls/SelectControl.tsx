import * as React from 'react';
import { Combobox } from '@/core/ui/combobox';
import { inputClassName } from '@/core/ui/input';
import { cn } from '@/lib/utils';
import { normalizeOptions, type SelectConfig, type SelectValue } from '../fields/Select';
import { resolveValue, type FieldRenderProps } from '../types';
import { useRelationshipOptions } from './useRelationshipOptions';

// Inline chevron so the native control keeps the same affordance as the combobox.
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

function toArray(value: SelectValue): Array<string | number> {
  if (value === null || value === undefined || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

export function SelectControl({
  config,
  value,
  onChange,
  onBlur,
  state,
  ctx,
}: FieldRenderProps<SelectValue, SelectConfig>) {
  const selected = React.useMemo(() => toArray(value), [value]);

  const staticOptions = React.useMemo(
    () => normalizeOptions(resolveValue(config.options, ctx)),
    // The resolver reads live form state; ctx is rebuilt whenever that changes.
    [config.options, ctx],
  );

  const relationship = useRelationshipOptions(config.relationship, {
    preload: config.preload,
    selected,
  });

  const options = config.relationship ? relationship.options : staticOptions;

  const emit = (next: string[]) => {
    if (config.multiple) {
      onChange(next);
      return;
    }
    onChange(next[0] ?? null);
  };

  if (config.native && !config.multiple && !config.relationship) {
    return (
      <select
        id={state.id}
        value={selected[0] !== undefined ? String(selected[0]) : ''}
        disabled={state.disabled || state.readOnly}
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.describedBy}
        aria-required={state.required || undefined}
        onChange={(event) => onChange(event.target.value || null)}
        onBlur={onBlur}
        className={cn(inputClassName, 'appearance-none bg-[right_0.6rem_center] bg-no-repeat pr-8')}
        style={{ backgroundImage: CHEVRON }}
      >
        <option value="">{state.placeholder ?? 'Select…'}</option>
        {options.map((option) => (
          <option
            key={String(option.value)}
            value={String(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div onBlur={onBlur}>
      <Combobox
        id={state.id}
        options={options.map((option) => ({ ...option, value: String(option.value) }))}
        value={selected.map(String)}
        onChange={emit}
        multiple={config.multiple}
        searchable={config.searchable}
        loading={relationship.loading}
        disabled={state.disabled || state.readOnly}
        invalid={Boolean(state.error)}
        describedBy={state.describedBy}
        placeholder={state.placeholder ?? 'Select…'}
        onSearch={config.searchable ? relationship.onSearch : undefined}
      />
    </div>
  );
}
