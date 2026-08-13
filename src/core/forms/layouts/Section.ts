import type * as React from 'react';
import { SectionComponent } from './SectionComponent';
import { Layout, type LayoutConfig } from './Layout';
import type { LayoutRenderProps, MaybeResolver } from '../types';

export interface SectionConfig extends LayoutConfig {
  heading: string;
  sectionDescription?: MaybeResolver<string>;
  collapsible?: boolean;
  collapsed?: boolean;
  /** Renders the heading in a left column beside the fields. */
  aside?: boolean;
}

export class Section extends Layout<SectionConfig> {
  static make(heading: string): Section {
    return new Section({ heading, schema: [], columns: 1 });
  }

  get component(): React.ComponentType<LayoutRenderProps> {
    return SectionComponent;
  }

  description(value: MaybeResolver<string>): this {
    return this.mutate({ sectionDescription: value });
  }

  collapsible(value = true): this {
    return this.mutate({ collapsible: value });
  }

  collapsed(value = true): this {
    return this.mutate({ collapsed: value, collapsible: true });
  }

  aside(value = true): this {
    return this.mutate({ aside: value });
  }
}
