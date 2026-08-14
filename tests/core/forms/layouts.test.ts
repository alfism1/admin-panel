import { describe, expect, it } from 'vitest';
import { Grid } from '@/core/forms/layouts/Grid';
import { Layout, gridClassName, spanClassName } from '@/core/forms/layouts/Layout';
import { Section } from '@/core/forms/layouts/Section';
import { Tab, Tabs } from '@/core/forms/layouts/Tabs';
import { TextInput } from '@/core/forms/fields/TextInput';
import { makeFieldContext } from '../../helpers/context';

describe('Grid', () => {
  it('defaults to two columns and an empty schema', () => {
    const grid = Grid.make();
    expect(grid.definition.columns).toBe(2);
    expect(grid.children).toEqual([]);
  });

  it('accepts a column count', () => {
    expect(Grid.make(4).definition.columns).toBe(4);
  });

  it('accepts responsive columns', () => {
    expect(Grid.make({ sm: 1, lg: 3 }).definition.columns).toEqual({ sm: 1, lg: 3 });
  });

  it('holds its children', () => {
    const fields = [TextInput.make('a'), TextInput.make('b')];
    expect(Grid.make(2).schema(fields).children).toEqual(fields);
  });

  it('is a layout, not a field', () => {
    expect(Grid.make().kind).toBe('layout');
    expect(Grid.make()).toBeInstanceOf(Layout);
  });

  it('is immutable across mutators', () => {
    const base = Grid.make(2);
    const wider = base.columns(4);

    expect(base.definition.columns).toBe(2);
    expect(wider.definition.columns).toBe(4);
  });

  it('carries a visibility gate like any component', () => {
    const grid = Grid.make(2).hiddenOn('view');

    expect(grid.isVisible(makeFieldContext({ operation: 'view' }))).toBe(false);
    expect(grid.isVisible(makeFieldContext({ operation: 'edit' }))).toBe(true);
  });
});

describe('Section', () => {
  it('starts as a single-column section with its heading', () => {
    const section = Section.make('Profile');
    expect(section.definition.heading).toBe('Profile');
    expect(section.definition.columns).toBe(1);
  });

  it('stores a description', () => {
    expect(Section.make('Profile').description('Who they are').definition.sectionDescription).toBe(
      'Who they are',
    );
  });

  it('resolves a description function', () => {
    const section = Section.make('Profile').description((ctx) => `Mode: ${ctx.operation}`);
    const resolve = section.definition.sectionDescription as (ctx: unknown) => string;

    expect(resolve(makeFieldContext({ operation: 'edit' }))).toBe('Mode: edit');
  });

  it('collapsible() alone leaves it expanded', () => {
    const section = Section.make('Profile').collapsible();
    expect(section.definition.collapsible).toBe(true);
    expect(section.definition.collapsed).toBeUndefined();
  });

  it('collapsed() implies collapsible', () => {
    const section = Section.make('Profile').collapsed();
    expect(section.definition.collapsed).toBe(true);
    expect(section.definition.collapsible).toBe(true);
  });

  it('stores the aside flag', () => {
    expect(Section.make('Profile').aside().definition.aside).toBe(true);
  });
});

describe('Tabs', () => {
  it('defaults to an id of "tabs"', () => {
    expect(Tabs.make().definition.id).toBe('tabs');
    expect(Tabs.make('post-tabs').definition.id).toBe('post-tabs');
  });

  it('mirrors tabs onto the schema so generic traversal finds them', () => {
    const tabs = [Tab.make('One'), Tab.make('Two')];
    const container = Tabs.make().tabs(tabs);

    expect(container.definition.tabs).toEqual(tabs);
    expect(container.children).toEqual(tabs);
  });

  it('gives a Tab its heading and icon', () => {
    const tab = Tab.make('Content').icon('file-text');
    expect(tab.definition.heading).toBe('Content');
    expect(tab.definition.icon).toBe('file-text');
  });

  it('lets a Tab hold fields', () => {
    const fields = [TextInput.make('title')];
    expect(Tab.make('Content').schema(fields).children).toEqual(fields);
  });
});

describe('gridClassName', () => {
  it.each([
    [undefined, 'grid-cols-1'],
    [1, 'grid-cols-1'],
    [2, 'sm:grid-cols-2'],
    [3, 'sm:grid-cols-2 lg:grid-cols-3'],
    [4, 'sm:grid-cols-2 lg:grid-cols-4'],
    [6, 'sm:grid-cols-3 lg:grid-cols-6'],
    [12, 'sm:grid-cols-6 lg:grid-cols-12'],
  ])('maps %o to %s', (columns, expected) => {
    expect(gridClassName(columns)).toBe(expected);
  });

  it('falls back to one column for an unsupported count', () => {
    expect(gridClassName(5)).toBe('grid-cols-1');
  });

  it('builds a responsive class list', () => {
    expect(gridClassName({ sm: 2, md: 3, lg: 4 })).toBe(
      'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    );
  });

  it('omits breakpoints that were not given', () => {
    expect(gridClassName({ lg: 4 })).toBe('grid-cols-1 lg:grid-cols-4');
  });
});

describe('spanClassName', () => {
  it.each([
    [undefined, 'col-span-1'],
    [1, 'col-span-1'],
    [2, 'col-span-1 sm:col-span-2'],
    [3, 'col-span-1 sm:col-span-2 lg:col-span-3'],
    [4, 'col-span-1 sm:col-span-2 lg:col-span-4'],
    [6, 'col-span-1 sm:col-span-3 lg:col-span-6'],
  ])('maps %o to %s', (span, expected) => {
    expect(spanClassName(span)).toBe(expected);
  });

  it('maps "full" to a full-width span', () => {
    expect(spanClassName('full')).toBe('col-span-full');
  });

  it('falls back to a single column for an unsupported span', () => {
    expect(spanClassName(5)).toBe('col-span-1');
  });
});
