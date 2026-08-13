import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { Input } from '@/core/ui/input';
import { cn } from '@/lib/utils';
import type { TextInputConfig } from '../fields/TextInput';
import type { FieldRenderProps } from '../types';

/** Applies a `9999-99` style mask: `9` = digit, `a` = letter, anything else literal. */
function applyMask(raw: string, mask: string): string {
  const chars = raw.replace(/[^0-9a-zA-Z]/g, '').split('');
  let output = '';

  for (const token of mask) {
    if (chars.length === 0) break;
    if (token === '9') {
      const index = chars.findIndex((char) => /[0-9]/.test(char));
      if (index === -1) break;
      output += chars.splice(index, 1)[0];
    } else if (token === 'a') {
      const index = chars.findIndex((char) => /[a-zA-Z]/.test(char));
      if (index === -1) break;
      output += chars.splice(index, 1)[0];
    } else {
      output += token;
    }
  }

  return output;
}

export function TextInputControl({
  config,
  value,
  onChange,
  onBlur,
  state,
}: FieldRenderProps<string, TextInputConfig>) {
  const { inputType, revealable, prefix, suffix, mask, step, autofocus } = config;
  const [revealed, setRevealed] = React.useState(false);

  const resolvedType = inputType === 'password' && revealed ? 'text' : inputType;
  const showToggle = inputType === 'password' && revealable;

  return (
    <div className="relative flex items-stretch">
      {prefix ? (
        <span className="border-input bg-muted text-muted-foreground inline-flex items-center rounded-l-md border border-r-0 px-2.5 text-sm">
          {prefix}
        </span>
      ) : null}

      <Input
        id={state.id}
        type={resolvedType}
        step={step}
        value={value ?? ''}
        autoFocus={autofocus}
        placeholder={state.placeholder}
        disabled={state.disabled}
        readOnly={state.readOnly}
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.describedBy}
        aria-required={state.required || undefined}
        onChange={(event) =>
          onChange(mask ? applyMask(event.target.value, mask) : event.target.value)
        }
        onBlur={onBlur}
        className={cn(
          prefix && 'rounded-l-none',
          (suffix || showToggle) && 'rounded-r-none',
          showToggle && 'pr-2',
        )}
      />

      {showToggle ? (
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          className="border-input bg-card text-muted-foreground hover:text-foreground inline-flex items-center rounded-r-md border border-l-0 px-2.5 transition-colors"
          aria-label={revealed ? 'Hide password' : 'Show password'}
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      ) : suffix ? (
        <span className="border-input bg-muted text-muted-foreground inline-flex items-center rounded-r-md border border-l-0 px-2.5 text-sm">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
