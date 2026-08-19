import * as React from 'react';
import { useAuth } from '@/core/auth/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/core/ui/alert-dialog';
import { Button } from '@/core/ui/button';
import { Icon } from '@/core/ui/icon';
import { Tooltip } from '@/core/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RepeaterAction, RepeaterActionContext } from '../fields/RepeaterAction';

/** Icon-only controls read better as tinted ghosts, as they do in row action bars. */
const ICON_TONE: Record<string, string> = {
  primary: 'text-primary hover:bg-primary/10',
  secondary: 'text-muted-foreground hover:text-foreground',
  success: 'text-success hover:bg-success/10',
  warning: 'text-warning hover:bg-warning/10',
  danger: 'text-destructive hover:bg-destructive/10',
  gray: 'text-muted-foreground hover:text-foreground',
};

export interface RepeaterActionButtonProps {
  action: RepeaterAction;
  context: RepeaterActionContext;
  className?: string;
  /** Set by the collapse control, which toggles a region rather than acting on the item. */
  expanded?: boolean;
}

export function RepeaterActionButton({
  action,
  context,
  className,
  expanded,
}: RepeaterActionButtonProps) {
  const { can } = useAuth();
  const [confirming, setConfirming] = React.useState(false);

  const config = action.definition;
  const { item, index } = context;

  if (!action.isAuthorized(item, index, can)) return null;
  if (!action.isVisible(item, index)) return null;

  const label = action.resolveLabel(item, index);
  const iconOnly = config.iconOnly !== false;
  const confirmation = config.confirmation === false ? undefined : config.confirmation;

  const run = () => {
    setConfirming(false);
    void config.handler?.(context);
  };

  const trigger = (
    <Tooltip label={config.tooltip}>
      <Button
        type="button"
        variant={iconOnly ? 'ghost' : (config.color ?? 'outline')}
        size={iconOnly ? 'iconSm' : 'sm'}
        className={cn(iconOnly && ICON_TONE[config.color ?? 'gray'], className)}
        disabled={action.isDisabled(item, index)}
        aria-label={iconOnly ? label : undefined}
        aria-expanded={expanded}
        onClick={() => (confirmation ? setConfirming(true) : run())}
      >
        <Icon name={config.icon} />
        {iconOnly ? null : label}
      </Button>
    </Tooltip>
  );

  if (!confirmation) return trigger;

  return (
    <>
      {trigger}
      {/* Opened by the trigger, so only the dismissal direction is meaningful. */}
      <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogTitle>{confirmation.heading ?? `${label}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation.description ?? 'This cannot be undone once the form is saved.'}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{confirmation.cancelLabel ?? 'Cancel'}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant={config.color ?? 'primary'}
                onClick={(event) => {
                  event.preventDefault();
                  run();
                }}
              >
                {confirmation.confirmLabel ?? label}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
