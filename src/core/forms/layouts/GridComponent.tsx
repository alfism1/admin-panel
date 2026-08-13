import { cn } from '@/lib/utils';
import type { LayoutRenderProps } from '../types';
import { gridClassName } from './Layout';

export function GridComponent({ layout, renderComponents }: LayoutRenderProps) {
  return (
    <div className={cn('grid gap-4', gridClassName(layout.definition.columns))}>
      {renderComponents(layout.children)}
    </div>
  );
}
