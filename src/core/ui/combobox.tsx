import { Check, ChevronsUpDown, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClassName } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Spinner } from './misc';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  onSearch?: (term: string) => void;
  className?: string;
}

/** Searchable single/multi picker used by Select fields and table filters alike. */
export function Combobox({
  options,
  value,
  onChange,
  multiple = false,
  searchable = false,
  placeholder = 'Select…',
  emptyMessage = 'No results found.',
  disabled,
  loading,
  invalid,
  id,
  describedBy,
  onSearch,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState('');

  const filtered = React.useMemo(() => {
    if (!searchable || onSearch || !term) return options;
    const needle = term.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, searchable, term, onSearch]);

  const selected = options.filter((option) => value.includes(option.value));
  const label = selected.length
    ? multiple
      ? `${selected.length} selected`
      : selected[0].label
    : placeholder;

  const toggle = (optionValue: string) => {
    if (multiple) {
      onChange(
        value.includes(optionValue)
          ? value.filter((item) => item !== optionValue)
          : [...value, optionValue],
      );
      return;
    }
    onChange(value[0] === optionValue ? [] : [optionValue]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn(inputClassName, 'items-center justify-between gap-2 text-left', className)}
        >
          <span className={cn('truncate', !selected.length && 'text-muted-foreground')}>
            {label}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        {searchable && (
          <div className="border-border border-b p-1.5">
            <input
              autoFocus
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                onSearch?.(event.target.value);
              }}
              placeholder="Search…"
              className="placeholder:text-muted-foreground h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none"
            />
          </div>
        )}

        {multiple && selected.length > 0 && (
          <div className="border-border flex flex-wrap gap-1 border-b p-2">
            {selected.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
              >
                {option.label}
                <X className="size-3" />
              </button>
            ))}
          </div>
        )}

        <div role="listbox" className="max-h-60 overflow-y-auto p-1">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm">
              <Spinner /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-sm">{emptyMessage}</p>
          ) : (
            filtered.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => toggle(option.value)}
                  className="hover:bg-accent focus-visible:bg-accent flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none disabled:pointer-events-none disabled:opacity-50"
                >
                  <Check
                    className={cn('mt-0.5 size-4 shrink-0', !isSelected && 'invisible')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
