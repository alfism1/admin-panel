import { GripVertical } from 'lucide-react';
import * as React from 'react';
import { useWatch } from 'react-hook-form';
import { Icon } from '@/core/ui/icon';
import { Tooltip } from '@/core/ui/tooltip';
import { cn } from '@/lib/utils';
import { ComponentRenderer } from '../ComponentRenderer';
import { FieldSlot } from '../FieldSlot';
import { gridClassName } from '../layouts/Layout';
import type { FieldRenderProps, FormValues } from '../types';
import type { Alignment, RepeaterConfig } from '../fields/Repeater';
import {
  RepeaterAction,
  applyModifier,
  type RepeaterActionContext,
} from '../fields/RepeaterAction';
import {
  blankItemValue,
  duplicateItem,
  fixIndistinctItems,
  issuesForItem,
  moveItem,
  resolveFlag,
} from '../fields/repeaterItems';
import { RepeaterActionButton } from './RepeaterActionButton';

// Tailwind only sees literal class names, so both maps are spelled out.
const ALIGNMENT: Record<Alignment, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

const TEXT_ALIGN: Record<Alignment, string> = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

/** Labels stay in the DOM for screen readers; the column header carries them visually. */
const HIDE_LABELS = '[&_label]:sr-only';

/**
 * Renders a repeater: one card (or table row) per item, each holding its own
 * copy of the schema. The array itself is the field's value, so every mutation
 * goes through `onChange` and React Hook Form keeps owning the nested state.
 */
export function RepeaterControl({
  config,
  onChange,
  state,
  ctx,
}: FieldRenderProps<unknown[], RepeaterConfig>) {
  const {
    name,
    schema,
    simpleField,
    minItems,
    maxItems,
    itemNumbers,
    itemLabelResolver,
    tableColumns,
    itemColumns,
    compact,
    addActionLabel,
    addActionAlignment,
    withButtons,
    withDragAndDrop,
    extraItemActions,
    distinctNames,
    fixIndistinct,
    relationship,
  } = config;

  // `Controller` subscribes to `name` exactly, so its `value` goes stale the
  // moment a child writes to `name.0.child`. Watching the path loosely keeps
  // both the array the actions splice and `itemLabel()` in step with the form.
  const watched = useWatch({ name }) as unknown;
  const items = React.useMemo(() => (Array.isArray(watched) ? watched : []), [watched]);
  const count = items.length;
  const disabled = state.disabled;

  const [opened, setOpened] = React.useState<Record<number, boolean>>({});
  const dragged = React.useRef<number | null>(null);

  const collapsible = resolveFlag(config.collapsible, ctx, false);
  const startCollapsed = collapsible && resolveFlag(config.collapsed, ctx, false);

  const canAddMore = maxItems === undefined || count < maxItems;
  const canAdd = !disabled && resolveFlag(config.addable, ctx, true) && canAddMore;
  const canClone = !disabled && resolveFlag(config.cloneable, ctx, false) && canAddMore;
  const canDelete =
    !disabled && resolveFlag(config.deletable, ctx, true) && count > (minItems ?? 0);
  const canReorder = !disabled && resolveFlag(config.reorderable, ctx, true) && count > 1;

  const previousItems = React.useRef<unknown[] | null>(null);

  React.useEffect(() => {
    if (!fixIndistinct) return;
    const fixed = fixIndistinctItems(items, previousItems.current, schema, distinctNames);
    previousItems.current = fixed ?? items;
    if (fixed) onChange(fixed);
  });

  const itemFields = (index: number) =>
    simpleField ? (
      // A simple repeater stores scalars, so its one child binds to the item slot.
      <FieldSlot
        field={simpleField}
        name={`${name}.${index}`}
        scope={name}
        operation={ctx.operation}
        record={ctx.record}
        disabled={disabled}
      />
    ) : (
      <ComponentRenderer
        components={schema}
        scope={`${name}.${index}`}
        operation={ctx.operation}
        record={ctx.record}
        disabled={disabled}
      />
    );

  const headingFor = (index: number) =>
    itemLabelResolver?.(items[index] as FormValues, index) || `Item ${index + 1}`;

  const contextFor = (index: number): RepeaterActionContext => ({
    item: (items[index] ?? {}) as FormValues,
    index,
    items,
    set: (value) => onChange(items.map((item, at) => (at === index ? value : item))),
    replace: (next) => onChange(next),
    remove: () => onChange(items.filter((_item, at) => at !== index)),
    field: ctx,
  });

  const itemActions = (index: number): RepeaterAction[] => {
    const heading = headingFor(index);
    const actions: RepeaterAction[] = [];

    if (canReorder && withButtons) {
      actions.push(
        applyModifier(
          RepeaterAction.make('moveUp')
            .label(`Move ${heading} up`)
            .icon('chevron-up')
            .disabled(index === 0)
            .action(({ items: current, replace }) => replace(moveItem(current, index, index - 1))),
          config.moveUpActionModifier,
        ),
        applyModifier(
          RepeaterAction.make('moveDown')
            .label(`Move ${heading} down`)
            .icon('chevron-down')
            .disabled(index === count - 1)
            .action(({ items: current, replace }) => replace(moveItem(current, index, index + 1))),
          config.moveDownActionModifier,
        ),
      );
    }

    if (canClone) {
      actions.push(
        applyModifier(
          RepeaterAction.make('clone')
            .label(`Clone ${heading}`)
            .icon('copy')
            .action(({ items: current, replace }) =>
              replace(duplicateItem(current, index, relationship === undefined)),
            ),
          config.cloneActionModifier,
        ),
      );
    }

    actions.push(...extraItemActions);

    if (canDelete) {
      actions.push(
        applyModifier(
          RepeaterAction.make('delete')
            .label(`Delete ${heading}`)
            .icon('trash')
            .color('danger')
            .action(({ remove }) => remove()),
          config.deleteActionModifier,
        ),
      );
    }

    return actions;
  };

  const actionBar = (index: number) => {
    const context = contextFor(index);
    return (
      <div className="flex shrink-0 items-center gap-0.5">
        {itemActions(index).map((action) => (
          <RepeaterActionButton key={action.name} action={action} context={context} />
        ))}
      </div>
    );
  };

  const rowStyle = tableColumns
    ? {
        gridTemplateColumns: `${tableColumns
          .map((column) => column.width ?? 'minmax(0,1fr)')
          .join(' ')} auto`,
      }
    : undefined;

  const issuesFor = (index: number) =>
    state.error ? issuesForItem(schema, simpleField, name, ctx, index) : [];

  const dragProps = (index: number) =>
    canReorder && withDragAndDrop
      ? {
          onDragOver: (event: React.DragEvent) => {
            if (dragged.current !== null) event.preventDefault();
          },
          onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            if (dragged.current !== null) onChange(moveItem(items, dragged.current, index));
            dragged.current = null;
          },
        }
      : {};

  const handleFor = (index: number) => {
    if (!canReorder || !withDragAndDrop) return null;

    const item = (items[index] ?? {}) as FormValues;
    const action = applyModifier(
      RepeaterAction.make('reorder')
        .label(`Reorder ${headingFor(index)}`)
        .icon(GripVertical),
      config.reorderActionModifier,
    );
    if (!action.isVisible(item, index)) return null;

    return (
      <Tooltip label={action.definition.tooltip}>
        <span
          draggable
          role="button"
          tabIndex={-1}
          aria-label={action.resolveLabel(item, index)}
          className="text-muted-foreground hover:text-foreground cursor-grab"
          onDragStart={() => {
            dragged.current = index;
          }}
          onDragEnd={() => {
            dragged.current = null;
          }}
        >
          <Icon name={action.definition.icon} className="size-4" />
        </span>
      </Tooltip>
    );
  };

  const collapseButton = (index: number, open: boolean) => {
    if (!collapsible) return null;

    const action = applyModifier(
      RepeaterAction.make('collapse')
        .label(`${open ? 'Collapse' : 'Expand'} ${headingFor(index)}`)
        .icon(open ? 'chevron-up' : 'chevron-down')
        .action(() => setOpened((current) => ({ ...current, [index]: !open }))),
      config.collapseActionModifier,
    );

    return <RepeaterActionButton action={action} context={contextFor(index)} expanded={open} />;
  };

  const issueList = (index: number) => {
    const issues = issuesFor(index);
    if (issues.length === 0) return null;
    return (
      <ul className="text-destructive space-y-0.5 text-xs font-medium">
        {issues.map((issue) => (
          <li key={`${issue.name}-${issue.message}`}>{issue.message}</li>
        ))}
      </ul>
    );
  };

  const addButton = () => {
    if (!canAdd) return null;

    const action = applyModifier(
      RepeaterAction.make('add')
        .label(addActionLabel ?? `Add to ${state.label}`)
        .icon('plus')
        .iconOnly(false)
        .action(({ items: current, replace }) =>
          replace([...current, blankItemValue(schema, simpleField, ctx)]),
        ),
      config.addActionModifier,
    );

    return (
      <div className={cn('flex', ALIGNMENT[addActionAlignment])}>
        <RepeaterActionButton
          action={action}
          context={{ ...contextFor(count), item: {} as FormValues }}
        />
      </div>
    );
  };

  const footer = addButton();

  if (tableColumns) {
    return (
      <div className="space-y-3">
        <div className="border-border overflow-x-auto rounded-lg border">
          <div
            className="bg-muted/40 border-border text-muted-foreground grid gap-3 border-b px-3 py-2 text-xs font-medium"
            style={rowStyle}
          >
            {tableColumns.map((column) => (
              <span key={column.label} className={TEXT_ALIGN[column.align ?? 'start']}>
                {column.label}
              </span>
            ))}
            <span className="sr-only">Actions</span>
          </div>

          {count === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">No items yet.</p>
          ) : null}

          {items.map((_item, index) => (
            <div
              key={index}
              className={cn('border-border border-b last:border-b-0', compact ? 'px-2' : 'px-3')}
              aria-label={headingFor(index)}
              {...dragProps(index)}
            >
              <div
                className={cn('grid items-start gap-3', HIDE_LABELS, compact ? 'py-1.5' : 'py-2.5')}
                style={rowStyle}
              >
                {itemFields(index)}
                <div className="flex items-center gap-0.5 pt-1">
                  {handleFor(index)}
                  {actionBar(index)}
                </div>
              </div>
              <div className="pb-2">{issueList(index)}</div>
            </div>
          ))}
        </div>

        {footer}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {count === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
          No items yet.
        </p>
      ) : null}

      {items.map((_item, index) => {
        const heading = headingFor(index);
        const open = opened[index] ?? !startCollapsed;

        return (
          <div
            key={index}
            className="border-border bg-card rounded-lg border"
            aria-label={heading}
            {...dragProps(index)}
          >
            <div
              className={cn(
                'flex items-center gap-2 border-b border-transparent',
                compact ? 'px-2 py-1.5' : 'px-3 py-2',
                open && 'border-border',
              )}
            >
              {handleFor(index)}
              {itemNumbers ? (
                <span className="bg-muted text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center rounded text-xs font-medium">
                  {index + 1}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{heading}</span>

              {collapseButton(index, open)}
              {actionBar(index)}
            </div>

            {open ? (
              <div className={cn('space-y-3', compact ? 'p-2' : 'p-3')}>
                <div className={cn('grid gap-4', gridClassName(itemColumns))}>
                  {itemFields(index)}
                </div>
                {issueList(index)}
              </div>
            ) : null}
          </div>
        );
      })}

      {footer}
    </div>
  );
}
