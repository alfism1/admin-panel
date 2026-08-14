import { describe, expect, it } from 'vitest';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Grid } from '@/core/forms/layouts/Grid';
import { makeFieldContext } from '../../helpers/context';

describe('builder immutability', () => {
  it('returns a new instance from every mutator', () => {
    const base = TextInput.make('name');
    const labelled = base.label('Full name');

    expect(labelled).not.toBe(base);
    expect(base.definition.label).toBeUndefined();
    expect(labelled.definition.label).toBe('Full name');
  });

  it('keeps the subclass prototype across a mutation', () => {
    const field = TextInput.make('name').label('Name').required();
    expect(field).toBeInstanceOf(TextInput);
    expect(field.definition.inputType).toBe('text');
  });

  it('lets one base builder be reused by two resources without cross-talk', () => {
    const shared = TextInput.make('title');
    const a = shared.required().maxLength(50);
    const b = shared.disabled();

    expect(a.definition.validation).toEqual({ required: true, maxLength: 50 });
    expect(b.definition.validation).toEqual({});
    expect(shared.definition.validation).toEqual({});
  });

  it('applies chained mutations cumulatively', () => {
    const field = TextInput.make('name').label('Name').placeholder('Ada').autofocus();
    expect(field.definition).toMatchObject({
      label: 'Name',
      placeholder: 'Ada',
      autofocus: true,
    });
  });
});

describe('visibility gates', () => {
  it('is visible by default', () => {
    expect(TextInput.make('name').isVisible(makeFieldContext())).toBe(true);
  });

  it('hidden() hides it', () => {
    expect(TextInput.make('name').hidden().isVisible(makeFieldContext())).toBe(false);
  });

  it('hidden(false) leaves it visible', () => {
    expect(TextInput.make('name').hidden(false).isVisible(makeFieldContext())).toBe(true);
  });

  it('visible(false) hides it', () => {
    expect(TextInput.make('name').visible(false).isVisible(makeFieldContext())).toBe(false);
  });

  it('resolves a hidden() predicate against form values', () => {
    const field = TextInput.make('name').hidden((ctx) => ctx.get('type') === 'system');

    expect(field.isVisible(makeFieldContext({ values: { type: 'system' } }))).toBe(false);
    expect(field.isVisible(makeFieldContext({ values: { type: 'user' } }))).toBe(true);
  });

  it('hiddenOn hides only on the listed operation', () => {
    const field = TextInput.make('password').hiddenOn('edit');

    expect(field.isVisible(makeFieldContext({ operation: 'edit' }))).toBe(false);
    expect(field.isVisible(makeFieldContext({ operation: 'create' }))).toBe(true);
  });

  it('hiddenOn accepts a list', () => {
    const field = TextInput.make('password').hiddenOn(['edit', 'view']);

    expect(field.isVisible(makeFieldContext({ operation: 'edit' }))).toBe(false);
    expect(field.isVisible(makeFieldContext({ operation: 'view' }))).toBe(false);
    expect(field.isVisible(makeFieldContext({ operation: 'create' }))).toBe(true);
  });

  it('visibleOn shows only on the listed operations', () => {
    const field = TextInput.make('slug').visibleOn(['create']);

    expect(field.isVisible(makeFieldContext({ operation: 'create' }))).toBe(true);
    expect(field.isVisible(makeFieldContext({ operation: 'edit' }))).toBe(false);
  });

  it('hiddenOn wins over visibleOn for the same operation', () => {
    const field = TextInput.make('slug').visibleOn('edit').hiddenOn('edit');
    expect(field.isVisible(makeFieldContext({ operation: 'edit' }))).toBe(false);
  });
});

describe('authorization gate', () => {
  it('allows an ungated component', () => {
    expect(TextInput.make('name').isAuthorized(makeFieldContext())).toBe(true);
  });

  it('checks a permission string', () => {
    const field = TextInput.make('salary').authorize('salary.view');

    expect(field.isAuthorized(makeFieldContext({ permissions: ['salary.view'] }))).toBe(true);
    expect(field.isAuthorized(makeFieldContext({ permissions: ['user.view'] }))).toBe(false);
  });

  it('accepts a predicate', () => {
    const field = TextInput.make('salary').authorize((ctx) => ctx.user?.name === 'Ada Lovelace');

    expect(field.isAuthorized(makeFieldContext())).toBe(true);
    expect(field.isAuthorized(makeFieldContext({ user: null }))).toBe(false);
  });
});

describe('isActive', () => {
  it('requires both gates to pass', () => {
    const permissions = ['salary.view'];

    expect(TextInput.make('a').isActive(makeFieldContext({ permissions }))).toBe(true);
    expect(TextInput.make('a').hidden().isActive(makeFieldContext({ permissions }))).toBe(false);
    expect(
      TextInput.make('a').authorize('other.view').isActive(makeFieldContext({ permissions })),
    ).toBe(false);
  });
});

describe('columnSpan', () => {
  it('stores a numeric span', () => {
    expect(TextInput.make('a').columnSpan(2).definition.columnSpan).toBe(2);
  });

  it('columnSpanFull is shorthand for "full"', () => {
    expect(TextInput.make('a').columnSpanFull().definition.columnSpan).toBe('full');
  });

  it('works on layouts too', () => {
    expect(Grid.make(3).columnSpanFull().definition.columnSpan).toBe('full');
  });
});
