import { format as formatDate, set as setParts, startOfDay } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/core/ui/button';
import { Calendar } from '@/core/ui/calendar';
import { Input, inputClassName } from '@/core/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/core/ui/popover';
import { cn } from '@/lib/utils';
import type { DatePickerConfig } from '../fields/DatePicker';
import {
  coerceDate,
  displayPattern,
  nativeInputPattern,
  nativeInputType,
  parseDateValue,
  serializeDate,
} from '../fields/dateValue';
import { resolveValue, type FieldRenderProps } from '../types';

function timePattern(withSeconds: boolean | undefined): string {
  return withSeconds ? 'HH:mm:ss' : 'HH:mm';
}

/** Copies the time off `source` onto `day` without mutating either. */
function withTimeOf(day: Date, source: Date, withSeconds: boolean | undefined): Date {
  return setParts(day, {
    hours: source.getHours(),
    minutes: source.getMinutes(),
    seconds: withSeconds ? source.getSeconds() : 0,
    milliseconds: 0,
  });
}

function applyTimeString(base: Date, raw: string): Date | null {
  const [hours, minutes, seconds] = raw.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return setParts(base, {
    hours,
    minutes,
    seconds: Number.isFinite(seconds) ? seconds : 0,
    milliseconds: 0,
  });
}

export function DatePickerControl({
  config,
  value,
  onChange,
  onBlur,
  state,
  ctx,
}: FieldRenderProps<string | null, DatePickerConfig>) {
  const { withTime, withSeconds, timeOnly, minutesStep, weekStartsOn, useNative } = config;
  const [open, setOpen] = React.useState(false);

  const selected = parseDateValue(value, config);
  const disabled = state.disabled || state.readOnly;
  const min = coerceDate(resolveValue(config.minDate, ctx) ?? null);
  const max = coerceDate(resolveValue(config.maxDate, ctx) ?? null);
  const blockedDays = (resolveValue(config.disabledDates, ctx) ?? [])
    .map(coerceDate)
    .filter((date): date is Date => date !== null);

  const step = withSeconds ? 1 : minutesStep ? minutesStep * 60 : undefined;
  const commitDate = (date: Date | null) => onChange(date ? serializeDate(date, config) : null);

  // ------------------------------------------------------------- native input

  // A time-only picker has nothing to put in a calendar, so it always uses the
  // browser's time input regardless of `.native()`.
  if (useNative || timeOnly) {
    const pattern = nativeInputPattern(config);

    return (
      <Input
        id={state.id}
        type={nativeInputType(config)}
        value={selected ? formatDate(selected, pattern) : ''}
        min={min ? formatDate(min, pattern) : undefined}
        max={max ? formatDate(max, pattern) : undefined}
        step={step}
        disabled={disabled}
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.describedBy}
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) {
            onChange(null);
            return;
          }
          // Parsed against the input's own pattern, so a local `yyyy-MM-dd`
          // is never read as UTC and shifted a day backwards.
          commitDate(parseDateValue(raw, { ...config, storeFormat: pattern }));
        }}
        onBlur={onBlur}
      />
    );
  }

  // ------------------------------------------------------------ calendar path

  const closeOnSelect = config.closeOnSelect ?? !withTime;
  const displayFormat = displayPattern(config);

  const pickDay = (day: Date | undefined) => {
    if (!day) {
      onChange(null);
      return;
    }
    commitDate(withTime ? withTimeOf(day, selected ?? new Date(), withSeconds) : startOfDay(day));
    if (closeOnSelect) setOpen(false);
  };

  const now = new Date();
  const todayBlocked =
    (min !== null && startOfDay(now) < startOfDay(min)) ||
    (max !== null && startOfDay(now) > startOfDay(max)) ||
    blockedDays.some((date) => startOfDay(date).getTime() === startOfDay(now).getTime());

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Deferred to close so opening the calendar does not mark the field
        // touched and flash a "required" error before anything was picked.
        if (!next) onBlur();
      }}
    >
      <div className="relative flex items-center">
        <PopoverTrigger asChild>
          <button
            type="button"
            id={state.id}
            disabled={disabled}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.describedBy}
            className={cn(inputClassName, 'items-center gap-2 text-left', selected && 'pr-8')}
          >
            <CalendarIcon className="size-4 shrink-0 opacity-60" />
            <span className={cn('flex-1 truncate', !selected && 'text-muted-foreground')}>
              {selected
                ? formatDate(selected, displayFormat)
                : (state.placeholder ?? 'Pick a date')}
            </span>
          </button>
        </PopoverTrigger>
        {selected && !disabled ? (
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
          selected={selected ?? undefined}
          onSelect={pickDay}
          defaultMonth={selected ?? min ?? undefined}
          weekStartsOn={weekStartsOn}
          startMonth={min ?? undefined}
          endMonth={max ?? undefined}
          disabled={[
            ...(min ? [{ before: startOfDay(min) }] : []),
            ...(max ? [{ after: startOfDay(max) }] : []),
            ...blockedDays,
          ]}
          autoFocus
        />

        {withTime ? (
          <div className="border-border mt-2 flex items-center gap-2 border-t pt-2">
            <Input
              type="time"
              aria-label="Time"
              className="h-8"
              step={step}
              value={selected ? formatDate(selected, timePattern(withSeconds)) : ''}
              onChange={(event) => {
                if (!event.target.value) return;
                commitDate(applyTimeString(selected ?? new Date(), event.target.value));
              }}
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={todayBlocked}
            onClick={() => {
              commitDate(withTime ? withTimeOf(now, now, withSeconds) : startOfDay(now));
              if (closeOnSelect) setOpen(false);
            }}
          >
            {withTime ? 'Now' : 'Today'}
          </Button>
          {selected ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
