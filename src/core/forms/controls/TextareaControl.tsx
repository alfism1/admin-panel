import * as React from 'react';
import { Textarea as TextareaPrimitive } from '@/core/ui/input';
import type { TextareaConfig } from '../fields/Textarea';
import type { FieldRenderProps } from '../types';

export function TextareaControl({
  config,
  value,
  onChange,
  onBlur,
  state,
}: FieldRenderProps<string, TextareaConfig>) {
  const { rows, autosize, autofocus } = config;
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const maxLength = config.validation.maxLength;

  React.useLayoutEffect(() => {
    if (!autosize || !ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [autosize, value]);

  return (
    <div className="space-y-1">
      <TextareaPrimitive
        ref={ref}
        id={state.id}
        rows={rows}
        value={value ?? ''}
        autoFocus={autofocus}
        placeholder={state.placeholder}
        disabled={state.disabled}
        readOnly={state.readOnly}
        maxLength={maxLength}
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.describedBy}
        aria-required={state.required || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        style={autosize ? { resize: 'none', overflow: 'hidden' } : undefined}
      />
      {maxLength ? (
        <p className="text-muted-foreground text-right text-xs tabular-nums">
          {(value ?? '').length}/{maxLength}
        </p>
      ) : null}
    </div>
  );
}
