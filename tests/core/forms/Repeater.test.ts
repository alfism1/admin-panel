import { describe, expect, it } from 'vitest';
import { TextInput } from '@/core/forms/fields/TextInput';
import type { FormValues } from '@/core/forms/types';
import { Repeater } from '@/core/forms/fields/Repeater';
import { makeFieldContext } from '../../helpers/context';

const lines = () => Repeater.make('lines').schema([TextInput.make('sku'), TextInput.make('note')]);

/** `validate` reads sibling items through the context, so both must agree. */
function check(field: Repeater, items: unknown[], label = 'Lines') {
  const ctx = makeFieldContext({ values: { lines: items }, ownName: 'lines' });
  return field.validate(items, ctx, label);
}

describe('builder', () => {
  it('seeds one blank item shaped by the schema', () => {
    const ctx = makeFieldContext();
    const seed = lines().definition.defaultValue as (c: typeof ctx) => unknown[];

    expect(seed(ctx)).toEqual([{ sku: '', note: '' }]);
  });

  it('re-seeds when the schema changes after defaultItems', () => {
    const ctx = makeFieldContext();
    const field = Repeater.make('lines')
      .defaultItems(2)
      .schema([TextInput.make('sku')]);
    const seed = field.definition.defaultValue as (c: typeof ctx) => unknown[];

    expect(seed(ctx)).toEqual([{ sku: '' }, { sku: '' }]);
  });

  it('stops seeding once an explicit default is set', () => {
    const field = lines()
      .default([{ sku: 'A-1' }])
      .schema([TextInput.make('sku')]);

    expect(field.definition.autoDefault).toBe(false);
    expect(field.definition.defaultValue).toEqual([{ sku: 'A-1' }]);
  });

  it('makes a positive minimum required, and a zero minimum optional', () => {
    expect(lines().minItems(2).definition.validation.required).toBe(true);
    expect(lines().minItems(0).definition.validation.required).toBeUndefined();
  });

  it('takes distinct as one name or a list', () => {
    expect(lines().distinct('sku').definition.distinctNames).toEqual(['sku']);
    expect(lines().distinct(['sku', 'note']).definition.distinctNames).toEqual(['sku', 'note']);
  });

  it('makes collapsed() imply collapsible()', () => {
    expect(lines().collapsed().definition.collapsible).toBe(true);
  });

  it('binds a simple repeater to a single field', () => {
    const field = Repeater.make('emails').simple(TextInput.make('email'));

    expect(field.definition.simpleField?.name).toBe('email');
    expect(field.definition.schema).toEqual([]);
  });

  it('seeds a simple repeater with the child default', () => {
    const ctx = makeFieldContext();
    const field = Repeater.make('emails')
      .defaultItems(2)
      .simple(TextInput.make('email').default('nobody@example.com'));
    const seed = field.definition.defaultValue as (c: typeof ctx) => unknown[];

    expect(seed(ctx)).toEqual(['nobody@example.com', 'nobody@example.com']);
  });
});

describe('item counts', () => {
  it('reports too few items, in the singular', () => {
    expect(check(lines().minItems(1), [])).toEqual(['Lines needs at least 1 item.']);
  });

  it('reports too few items, in the plural', () => {
    expect(check(lines().minItems(3), [{ sku: 'A' }])).toEqual(['Lines needs at least 3 items.']);
  });

  it('reports too many items', () => {
    expect(check(lines().maxItems(1), [{ sku: 'A' }, { sku: 'B' }])).toEqual([
      'Lines accepts at most 1 item.',
    ]);
  });

  it('stays quiet inside the bounds', () => {
    expect(check(lines().minItems(1).maxItems(3), [{ sku: 'A' }])).toEqual([]);
  });

  it('treats a non-array value as empty', () => {
    expect(check(lines().minItems(1), 'nope' as unknown as unknown[])).toEqual([
      'Lines needs at least 1 item.',
    ]);
  });
});

describe('distinct', () => {
  it('flags a repeated value', () => {
    expect(check(lines().distinct('sku'), [{ sku: 'A' }, { sku: 'A' }])).toEqual([
      'SKU must be unique across items.',
    ]);
  });

  it('accepts values that differ', () => {
    expect(check(lines().distinct('sku'), [{ sku: 'A' }, { sku: 'B' }])).toEqual([]);
  });

  it('ignores blanks, which are the empty state rather than a duplicate', () => {
    expect(check(lines().distinct('sku'), [{ sku: '' }, { sku: '' }])).toEqual([]);
  });

  it('ignores items that never set the key at all', () => {
    expect(check(lines().distinct('sku'), [{}, {}])).toEqual([]);
  });

  it('labelizes a name the schema does not declare', () => {
    const field = Repeater.make('lines')
      .schema([TextInput.make('note')])
      .distinct('sku');

    expect(check(field, [{ sku: 'A' }, { sku: 'A' }])).toEqual([
      'SKU must be unique across items.',
    ]);
  });
});

describe('failing items', () => {
  const required = () => Repeater.make('lines').schema([TextInput.make('sku').required()]);

  it('summarises one failing item', () => {
    expect(check(required(), [{ sku: 'A' }, { sku: '' }])).toEqual(['1 item needs attention.']);
  });

  it('summarises several failing items', () => {
    expect(check(required(), [{ sku: '' }, { sku: '' }])).toEqual(['2 items need attention.']);
  });

  it('says nothing when every item is valid', () => {
    expect(check(required(), [{ sku: 'A' }])).toEqual([]);
  });
});

describe('orderColumn', () => {
  const dehydrate = (field: Repeater, state: unknown) =>
    field.definition.dehydrateState?.(state) as FormValues[];

  it('writes each item position into the named key', () => {
    const field = lines().orderColumn('sort');

    expect(dehydrate(field, [{ sku: 'A' }, { sku: 'B' }])).toEqual([
      { sku: 'A', sort: 0 },
      { sku: 'B', sort: 1 },
    ]);
  });

  it('tolerates a value that is not an array', () => {
    expect(dehydrate(lines().orderColumn('sort'), null)).toEqual([]);
  });
});
