import { Checkbox as CheckboxPrimitive } from '@/core/ui/checkbox';
import { Switch } from '@/core/ui/switch';
import { cn } from '@/lib/utils';
import type { BooleanFieldConfig, BooleanTone } from '../fields/Checkbox';
import type { FieldRenderProps } from '../types';

// Literal class strings keep Tailwind's scanner able to see them.
const CHECKED_TONE: Record<BooleanTone, string> = {
  primary: 'data-[state=checked]:bg-primary data-[state=checked]:border-primary',
  success: 'data-[state=checked]:bg-success data-[state=checked]:border-success',
  warning: 'data-[state=checked]:bg-warning data-[state=checked]:border-warning',
  danger: 'data-[state=checked]:bg-destructive data-[state=checked]:border-destructive',
  gray: 'data-[state=checked]:bg-muted-foreground data-[state=checked]:border-muted-foreground',
};

const UNCHECKED_TONE: Record<BooleanTone, string> = {
  primary: 'data-[state=unchecked]:bg-primary/40',
  success: 'data-[state=unchecked]:bg-success/40',
  warning: 'data-[state=unchecked]:bg-warning/40',
  danger: 'data-[state=unchecked]:bg-destructive/40',
  gray: 'data-[state=unchecked]:bg-input',
};

export function CheckboxControl({
  config,
  value,
  onChange,
  onBlur,
  state,
}: FieldRenderProps<boolean, BooleanFieldConfig>) {
  const { onTone } = config;
  return (
    <CheckboxPrimitive
      id={state.id}
      checked={Boolean(value)}
      disabled={state.disabled || state.readOnly}
      aria-invalid={Boolean(state.error)}
      aria-describedby={state.describedBy}
      onCheckedChange={(checked) => onChange(checked === true)}
      onBlur={onBlur}
      className={cn(onTone && CHECKED_TONE[onTone])}
    />
  );
}

export function ToggleControl({
  config,
  value,
  onChange,
  onBlur,
  state,
}: FieldRenderProps<boolean, BooleanFieldConfig>) {
  const { onTone, offTone } = config;
  return (
    <Switch
      id={state.id}
      checked={Boolean(value)}
      disabled={state.disabled || state.readOnly}
      aria-describedby={state.describedBy}
      onCheckedChange={onChange}
      onBlur={onBlur}
      className={cn(
        onTone && CHECKED_TONE[onTone].replace(/border-\S+/g, ''),
        offTone && UNCHECKED_TONE[offTone],
      )}
    />
  );
}
