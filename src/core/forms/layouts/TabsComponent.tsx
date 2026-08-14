import * as React from 'react';
import { Icon } from '@/core/ui/icon';
import { Tabs as TabsPrimitive, TabsContent, TabsList, TabsTrigger } from '@/core/ui/tabs';
import { cn } from '@/lib/utils';
import type { LayoutRenderProps } from '../types';
import { gridClassName } from './Layout';
import type { Tab, Tabs } from './Tabs';

export function TabPanelComponent({ layout, renderComponents }: LayoutRenderProps) {
  return (
    <div className={cn('grid gap-4', gridClassName(layout.definition.columns))}>
      {renderComponents(layout.children)}
    </div>
  );
}

export function TabsComponent({ layout, ctx, renderComponents }: LayoutRenderProps) {
  // Defensive: the cast is only sound for a `Tabs`, which always has the array.
  /* v8 ignore next */
  const tabs = ((layout as Tabs).definition.tabs ?? []).filter((tab) => tab.isActive(ctx));
  const [active, setActive] = React.useState(tabs[0]?.definition.heading ?? '');

  if (tabs.length === 0) return null;

  const current = tabs.some((tab) => tab.definition.heading === active)
    ? active
    : tabs[0].definition.heading;

  return (
    <TabsPrimitive value={current} onValueChange={setActive}>
      <TabsList>
        {tabs.map((tab: Tab) => (
          <TabsTrigger key={tab.definition.heading} value={tab.definition.heading}>
            <Icon name={tab.definition.icon} className="size-4" />
            {tab.definition.heading}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab: Tab) => (
        <TabsContent
          key={tab.definition.heading}
          value={tab.definition.heading}
          forceMount
          hidden={tab.definition.heading !== current}
        >
          <div className={cn('grid gap-4', gridClassName(tab.definition.columns))}>
            {renderComponents(tab.children)}
          </div>
        </TabsContent>
      ))}
    </TabsPrimitive>
  );
}
