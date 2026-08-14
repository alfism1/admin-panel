import * as React from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/core/auth/useAuth';
import type { RecordShape } from '@/core/data/types';
import { SchemaForm } from '@/core/forms/SchemaForm';
import { useResourceContext } from '@/core/resources/ResourceContext';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/core/ui/dialog';
import { DropdownMenuItem } from '@/core/ui/dropdown-menu';
import { Icon } from '@/core/ui/icon';
import { Tooltip } from '@/core/ui/tooltip';
import type { Action } from './Action';
import { resolveBuiltin } from './resolveAction';
import { useActionRunner } from './useActionRunner';

export interface ActionRendererProps {
  action: Action;
  record?: RecordShape | null;
  records?: RecordShape[];
  variant?: 'button' | 'menuItem';
  onCompleted?: () => void;
}

type Stage = 'idle' | 'form' | 'confirm';

// Icon-only row actions read better as tinted ghosts than as solid buttons.
const ICON_TONE: Record<string, string> = {
  primary: 'text-primary hover:bg-primary/10',
  secondary: 'text-muted-foreground hover:text-foreground',
  success: 'text-success hover:bg-success/10',
  warning: 'text-warning hover:bg-warning/10',
  danger: 'text-destructive hover:bg-destructive/10',
  gray: 'text-muted-foreground hover:text-foreground',
};

export function ActionRenderer({
  action,
  record = null,
  records = [],
  variant = 'button',
  onCompleted,
}: ActionRendererProps) {
  const { can } = useAuth();
  const resource = useResourceContext()?.resource;
  const { run, isRunning } = useActionRunner(action);
  const [stage, setStage] = React.useState<Stage>('idle');
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});

  const config = action.definition;
  const builtin = resolveBuiltin(config, resource, record);

  const permission =
    typeof config.authorization === 'string' ? config.authorization : builtin.permission;
  const authorized =
    typeof config.authorization === 'function'
      ? config.authorization(record)
      : !permission || can(permission);

  if (!authorized || !action.isVisible(record)) return null;

  const label = config.label
    ? action.resolveLabel(record)
    : (builtin.label ?? action.resolveLabel(record));
  const href = config.urlResolver ? config.urlResolver(record) : builtin.href;
  // `resolveBuiltin` already merges `config.confirmation` over its generated
  // copy, so the built-in wins here — taking `config.confirmation` first would
  // discard the record-aware wording for the `{}` the built-ins ship with.
  const confirmation =
    config.confirmation === false ? false : (builtin.confirmation ?? config.confirmation);

  const execute = async (data: Record<string, unknown>) => {
    await run({ record, records, data, onDone: onCompleted });
    setStage('idle');
    setFormData({});
  };

  const start = () => {
    if (config.formSchema) {
      setStage('form');
      return;
    }
    if (confirmation) {
      setStage('confirm');
      return;
    }
    void execute({});
  };

  const trigger =
    variant === 'menuItem' ? (
      <DropdownMenuItem
        destructive={config.color === 'danger'}
        disabled={action.isDisabled(record)}
        onSelect={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <Icon name={config.icon} />
        {label}
      </DropdownMenuItem>
    ) : (
      <Tooltip label={config.tooltip}>
        <Button
          type="button"
          variant={config.iconOnly ? 'ghost' : (config.color ?? 'secondary')}
          size={config.iconOnly ? 'iconSm' : (config.size ?? 'sm')}
          className={config.iconOnly ? ICON_TONE[config.color ?? 'gray'] : undefined}
          disabled={action.isDisabled(record)}
          loading={isRunning}
          onClick={start}
          aria-label={config.iconOnly ? label : undefined}
        >
          <Icon name={config.icon} />
          {config.iconOnly ? null : label}
        </Button>
      </Tooltip>
    );

  // A pure navigation action needs no dialog machinery.
  if (href && !config.handler && !config.formSchema) {
    if (variant === 'menuItem') {
      return (
        <DropdownMenuItem asChild>
          <Link to={href} target={config.openInNewTab ? '_blank' : undefined}>
            <Icon name={config.icon} />
            {label}
          </Link>
        </DropdownMenuItem>
      );
    }
    return (
      <Tooltip label={config.tooltip}>
        <Button
          asChild
          variant={config.iconOnly ? 'ghost' : (config.color ?? 'secondary')}
          size={config.iconOnly ? 'iconSm' : (config.size ?? 'sm')}
          className={config.iconOnly ? ICON_TONE[config.color ?? 'gray'] : undefined}
        >
          <Link
            to={href}
            aria-label={config.iconOnly ? label : undefined}
            target={config.openInNewTab ? '_blank' : undefined}
          >
            <Icon name={config.icon} />
            {config.iconOnly ? null : label}
          </Link>
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      {trigger}

      {/* The modal is opened by the trigger, never by the dialog itself, so
          only the dismissal direction is meaningful — as with the alert below. */}
      {config.formSchema ? (
        <Dialog open={stage === 'form'} onOpenChange={(open) => !open && setStage('idle')}>
          <DialogContent width={config.modalWidth ?? 'md'}>
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              {confirmation && confirmation.description ? (
                <DialogDescription>{confirmation.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <div className="max-h-[65vh] overflow-y-auto px-0.5">
              <SchemaForm
                schema={config.formSchema}
                operation="create"
                record={record}
                submitLabel={confirmation ? 'Continue' : label}
                onCancel={() => setStage('idle')}
                onSubmit={async (data) => {
                  if (confirmation) {
                    setFormData(data);
                    setStage('confirm');
                    return;
                  }
                  await execute(data);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {confirmation ? (
        <AlertDialog open={stage === 'confirm'} onOpenChange={(open) => !open && setStage('idle')}>
          <AlertDialogContent>
            <AlertDialogTitle>{confirmation.heading ?? `${label}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation.description ?? 'This action cannot be undone.'}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost">{confirmation.cancelLabel ?? 'Cancel'}</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant={config.color ?? 'primary'}
                  loading={isRunning}
                  onClick={(event) => {
                    event.preventDefault();
                    void execute(formData);
                  }}
                >
                  {confirmation.confirmLabel ?? label}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
