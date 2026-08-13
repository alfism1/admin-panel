import { format as formatDate, isValid, parseISO } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/core/ui/button';
import { Calendar } from '@/core/ui/calendar';
import { Input, inputClassName } from '@/core/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/core/ui/popover';
import { cn } from '@/lib/utils';
import type { DatePickerConfig } from '../fields/DatePicker';
import type { FieldRenderProps } from '../types';

function toDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

export function DatePickerControl({
  config,
  value,
  onChange,
  onBlur,
  state,
}: FieldRenderProps<string | null, DatePickerConfig>) {
  const { withTime, minDate, maxDate, displayFormat, useNative } = config;
  const [open, setOpen] = React.useState(false);
  const selected = toDate(value);

  if (useNative) {
    const nativeValue = selected
      ? formatDate(selected, withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd')
      : '';
    return (
      <Input
        id={state.id}
        type={withTime ? 'datetime-local' : 'date'}
        value={nativeValue}
        min={minDate ? formatDate(minDate, 'yyyy-MM-dd') : undefined}
        max={maxDate ? formatDate(maxDate, 'yyyy-MM-dd') : undefined}
        disabled={state.disabled || state.readOnly}
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.describedBy}
        onChange={(event) =>
          onChange(event.target.value ? new Date(event.target.value).toISOString() : null)
        }
        onBlur={onBlur}
      />
    );
  }

  const commit = (date: Date | undefined) => {
    if (!date) {
      onChange(null);
      return;
    }
    if (withTime && selected) {
      date.setHours(selected.getHours(), selected.getMinutes());
    }
    onChange(date.toISOString());
    if (!withTime) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative flex items-center">
        <PopoverTrigger asChild>
          <button
            type="button"
            id={state.id}
            disabled={state.disabled || state.readOnly}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.describedBy}
            onBlur={onBlur}
            className={cn(inputClassName, 'items-center gap-2 text-left')}
          >
            <CalendarIcon className="size-4 shrink-0 opacity-60" />
            <span className={cn('flex-1 truncate', !selected && 'text-muted-foreground')}>
              {selected
                ? formatDate(selected, displayFormat ?? 'dd MMM yyyy')
                : (state.placeholder ?? 'Pick a date')}
            </span>
          </button>
        </PopoverTrigger>
        {selected && !state.disabled ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Clear date"
            className="text-muted-foreground hover:text-foreground absolute right-2 rounded p-0.5"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <PopoverContent className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={commit}
          defaultMonth={selected}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          autoFocus
        />
        {withTime ? (
          <div className="border-border mt-2 flex items-center gap-2 border-t pt-2">
            <Input
              type="time"
              className="h-8"
              value={selected ? formatDate(selected, 'HH:mm') : ''}
              onChange={(event) => {
                const [hours, minutes] = event.target.value.split(':').map(Number);
                const base = selected ?? new Date();
                base.setHours(hours || 0, minutes || 0, 0, 0);
                onChange(base.toISOString());
              }}
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
