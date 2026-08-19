import { describe, expect, it } from 'vitest';
import { collectFields } from '@/core/forms/formState';
import { PostResource } from '@/resources/PostResource';
import { Repeater } from '@/core/forms/fields/Repeater';
import { RepeaterAction } from '@/core/forms/fields/RepeaterAction';

/**
 * The two repeaters the post form ships are the worked examples for both
 * storage shapes, so their wiring is pinned here: swap the column or the
 * foreign key and `pnpm db:migrate` has to move with it.
 */
function repeater(name: string): Repeater {
  const field = collectFields(PostResource.form ?? []).find((candidate) => candidate.name === name);
  if (!(field instanceof Repeater)) throw new Error(`No repeater named "${name}" on PostResource.`);
  return field;
}

describe('faqs — a JSON column', () => {
  const faqs = () => repeater('faqs');

  it('stores itself on the record with no relationship', () => {
    expect(faqs().definition.relationship).toBeUndefined();
  });

  it('is bounded and de-duplicated on the question', () => {
    expect(faqs().definition).toMatchObject({
      maxItems: 10,
      distinctNames: ['question'],
      fixIndistinct: true,
      itemCount: 0,
    });
  });

  it('titles an item by its question', () => {
    expect(faqs().definition.itemLabelResolver?.({ question: 'Why?' }, 0)).toBe('Why?');
    expect(faqs().definition.itemLabelResolver?.({}, 0)).toBe('');
  });

  it('carries the two fields the migration created columns for', () => {
    expect(collectFields(faqs().definition.schema).map((field) => field.name)).toEqual([
      'question',
      'answer',
    ]);
  });
});

describe('blocks — a child table', () => {
  const blocks = () => repeater('blocks');

  it('points at post_blocks through post_id', () => {
    expect(blocks().definition.relationship).toEqual({
      resource: 'post_blocks',
      foreignKey: 'post_id',
    });
  });

  it('persists the drag order into the position column', () => {
    expect(blocks().definition.orderColumn).toBe('position');
    expect(blocks().definition.dehydrateState?.([{ id: 4 }, { id: 9 }])).toEqual([
      { id: 4, position: 0 },
      { id: 9, position: 1 },
    ]);
  });

  it('confirms before dropping a block', () => {
    const modified = blocks().definition.deleteActionModifier?.(RepeaterAction.make('delete'));

    expect(modified?.definition.confirmation).toEqual({
      description: 'The block is removed from the post when you save.',
    });
  });

  it('offers a clear-body action only on blocks that have one', () => {
    const [clear] = blocks().definition.extraItemActions;

    expect(clear.resolveLabel({}, 0)).toBe('Clear body');
    expect(clear.isVisible({ body: 'text' }, 0)).toBe(true);
    expect(clear.isVisible({ body: '' }, 0)).toBe(false);
  });

  it('empties the body without disturbing the rest of the block', () => {
    const [clear] = blocks().definition.extraItemActions;
    let written: unknown;

    void clear.definition.handler?.({
      item: { id: 3, kind: 'quote', body: 'text' },
      index: 0,
      items: [],
      set: (value) => (written = value),
      replace: () => undefined,
      remove: () => undefined,
      field: {} as never,
    });

    expect(written).toEqual({ id: 3, kind: 'quote', body: '' });
  });

  it('titles an item by its heading, then its kind', () => {
    const label = blocks().definition.itemLabelResolver;

    expect(label?.({ heading: 'Why it matters', kind: 'quote' }, 0)).toBe('Why it matters');
    expect(label?.({ heading: '', kind: 'quote' }, 0)).toBe('quote');
    expect(label?.({}, 0)).toBe('');
  });

  it('carries the three fields post_blocks has columns for', () => {
    expect(collectFields(blocks().definition.schema).map((field) => field.name)).toEqual([
      'kind',
      'heading',
      'body',
    ]);
  });
});
