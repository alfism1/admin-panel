import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { Card } from '@/core/ui/misc';
import { cn } from '@/lib/utils';
import { resolveValue, type LayoutRenderProps } from '../types';
import { gridClassName } from './Layout';
import type { Section } from './Section';

export function SectionComponent({ layout, ctx, renderComponents }: LayoutRenderProps) {
  const config = (layout as Section).definition;
  const [open, setOpen] = React.useState(!config.collapsed);
  const description = resolveValue(config.sectionDescription, ctx);
  const contentId = React.useId();

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{config.heading}</h3>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {config.collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={contentId}
          className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1 transition-colors"
        >
          <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
          <span className="sr-only">{open ? 'Collapse' : 'Expand'} section</span>
        </button>
      ) : null}
    </div>
  );

  const body = (
    <div id={contentId} hidden={!open} className={cn('grid gap-4', gridClassName(config.columns))}>
      {renderComponents(layout.children)}
    </div>
  );

  if (config.aside) {
    return (
      <Card className="grid gap-4 p-5 md:grid-cols-3">
        <div className="md:col-span-1">{header}</div>
        <div className="md:col-span-2">{body}</div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      {header}
      {body}
    </Card>
  );
}
