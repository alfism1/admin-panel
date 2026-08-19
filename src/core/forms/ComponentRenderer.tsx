import { cn } from '@/lib/utils';
import { FieldSlot } from './FieldSlot';
import { Layout, spanClassName } from './layouts/Layout';
import { useReactiveContext } from './useFieldContext';
import type { FormComponent, FormValues, Operation } from './types';

interface RendererProps {
  components: FormComponent[];
  operation: Operation;
  record: FormValues | null;
  /**
   * Path prefix for a nested item, e.g. `line_items.0`. Fields bind to
   * `scope.name` and their resolvers read relative to it, so one schema can be
   * rendered many times over without being cloned.
   */
  scope?: string;
  /** Forced on by a disabled ancestor, which the children cannot see. */
  disabled?: boolean;
}

function LayoutSlot({
  layout,
  operation,
  record,
  scope,
  disabled,
}: {
  layout: Layout;
  operation: Operation;
  record: FormValues | null;
  scope?: string;
  disabled?: boolean;
}) {
  const ctx = useReactiveContext({ operation, record, scope });
  if (!layout.isActive(ctx)) return null;

  const Component = layout.component;
  return (
    <div className={cn(spanClassName(layout.definition.columnSpan ?? 'full'))}>
      <Component
        layout={layout}
        ctx={ctx}
        renderComponents={(children) => (
          <ComponentRenderer
            components={children}
            operation={operation}
            record={record}
            scope={scope}
            disabled={disabled}
          />
        )}
      />
    </div>
  );
}

export function ComponentRenderer({
  components,
  operation,
  record,
  scope,
  disabled,
}: RendererProps) {
  return (
    <>
      {components.map((component, index) => {
        if (component instanceof Layout) {
          return (
            <LayoutSlot
              key={component.definition.id ?? `layout-${index}`}
              layout={component}
              operation={operation}
              record={record}
              scope={scope}
              disabled={disabled}
            />
          );
        }
        return (
          <FieldSlot
            key={component.name}
            field={component}
            operation={operation}
            record={record}
            scope={scope}
            disabled={disabled}
          />
        );
      })}
    </>
  );
}
