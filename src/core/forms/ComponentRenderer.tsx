import { cn } from '@/lib/utils';
import { FieldSlot } from './FieldSlot';
import { Layout, spanClassName } from './layouts/Layout';
import { useReactiveContext } from './useFieldContext';
import type { FormComponent, FormValues, Operation } from './types';

interface RendererProps {
  components: FormComponent[];
  operation: Operation;
  record: FormValues | null;
}

function LayoutSlot({
  layout,
  operation,
  record,
}: {
  layout: Layout;
  operation: Operation;
  record: FormValues | null;
}) {
  const ctx = useReactiveContext({ operation, record });
  if (!layout.isActive(ctx)) return null;

  const Component = layout.component;
  return (
    <div className={cn(spanClassName(layout.definition.columnSpan ?? 'full'))}>
      <Component
        layout={layout}
        ctx={ctx}
        renderComponents={(children) => (
          <ComponentRenderer components={children} operation={operation} record={record} />
        )}
      />
    </div>
  );
}

export function ComponentRenderer({ components, operation, record }: RendererProps) {
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
            />
          );
        }
        return (
          <FieldSlot key={component.name} field={component} operation={operation} record={record} />
        );
      })}
    </>
  );
}
