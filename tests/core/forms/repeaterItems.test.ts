import { describe, expect, it, vi } from 'vitest';
import { Field, type FieldConfig } from '@/core/forms/Field';
import { Checkbox } from '@/core/forms/fields/Checkbox';
import { FileUpload } from '@/core/forms/fields/FileUpload';
import { TextInput } from '@/core/forms/fields/TextInput';
import { blankItemValue, issuesForItem, resolveFlag } from '@/core/forms/fields/repeaterItems';
import type { FieldControl, FormValues, ValueType } from '@/core/forms/types';
import { resolveScoped, scopeContext } from '@/core/forms/useFieldContext';
import { makeFieldContext } from '../../helpers/context';

/** There is no built-in numeric field, so one is subclassed the way an app would. */
class NumberField extends Field<number, FieldConfig> {
  readonly valueType: ValueType = 'number';

  static make(name: string): NumberField {
    return new NumberField({ name, validation: {} });
  }

  get control(): FieldControl {
    return (() => null) as unknown as FieldControl;
  }
}

const ctxWith = (values: FormValues) => makeFieldContext({ values });

function issues(schema: Parameters<typeof issuesForItem>[0], values: FormValues, index = 0) {
  return issuesForItem(schema, undefined, 'lines', ctxWith(values), index).map(
    (issue) => issue.message,
  );
}

describe('resolveScoped', () => {
  it('prefixes a relative path', () => {
    expect(resolveScoped('lines.1', 'sku')).toBe('lines.1.sku');
  });

  it('climbs to the array with one ../ and to the root with two', () => {
    expect(resolveScoped('lines.1', '../0.sku')).toBe('lines.0.sku');
    expect(resolveScoped('lines.1', '../../mode')).toBe('mode');
  });

  it('leaves a path alone when there is no scope', () => {
    expect(resolveScoped(undefined, 'mode')).toBe('mode');
    expect(resolveScoped('', '../mode')).toBe('mode');
  });
});

describe('scopeContext', () => {
  const base = () => ctxWith({ mode: 'business', lines: [{ sku: 'A' }, { sku: 'B' }] });

  it('reads a sibling from the same item', () => {
    expect(scopeContext(base(), 'lines.1').get('sku')).toBe('B');
  });

  it('climbs back out with ../', () => {
    expect(scopeContext(base(), 'lines.1').get('../../mode')).toBe('business');
  });

  it('writes back through the same scope', () => {
    const set = vi.fn();
    scopeContext(makeFieldContext({ set }), 'lines.1').set('sku', 'C');

    expect(set).toHaveBeenCalledWith('lines.1.sku', 'C');
  });
});

describe('resolveFlag', () => {
  it('falls back when nothing is configured', () => {
    expect(resolveFlag(undefined, makeFieldContext(), true)).toBe(true);
  });

  it('resolves a function against the context', () => {
    expect(
      resolveFlag((c) => c.get('mode') === 'business', ctxWith({ mode: 'business' }), false),
    ).toBe(true);
  });
});

describe('blankItemValue', () => {
  it('builds an object from the child defaults', () => {
    expect(
      blankItemValue(
        [TextInput.make('sku').default('A'), TextInput.make('note')],
        undefined,
        makeFieldContext(),
      ),
    ).toEqual({ sku: 'A', note: '' });
  });

  it('builds a scalar for a simple repeater', () => {
    expect(blankItemValue([], TextInput.make('email'), makeFieldContext())).toBe('');
  });
});

describe('issuesForItem: presence', () => {
  it('reports a required child that is blank', () => {
    expect(issues([TextInput.make('sku').required()], { lines: [{ sku: '' }] })).toEqual([
      'SKU is required.',
    ]);
  });

  it('skips rules for a blank optional child', () => {
    expect(issues([TextInput.make('sku').minLength(3)], { lines: [{ sku: '' }] })).toEqual([]);
  });

  it('skips a child that is hidden in this item', () => {
    const schema = [
      TextInput.make('vat')
        .required()
        .visible((c) => c.get('kind') === 'company'),
    ];

    expect(issues(schema, { lines: [{ kind: 'person' }] })).toEqual([]);
    expect(issues(schema, { lines: [{ kind: 'company' }] })).toEqual(['Vat is required.']);
  });

  it('treats a missing item as empty rather than throwing', () => {
    expect(issues([TextInput.make('sku').required()], { lines: [] }, 4)).toEqual([
      'SKU is required.',
    ]);
  });
});

/**
 * The rules come from `compileFieldValidator`, the same function
 * `buildZodSchema` uses, so these messages are the ones a top-level field would
 * produce — that is the point of sharing it.
 */
describe('issuesForItem: shared rule compiler', () => {
  const value = (sku: string) => ({ lines: [{ sku }] });

  it('enforces minLength', () => {
    expect(issues([TextInput.make('sku').minLength(3)], value('AB'))).toEqual([
      'SKU must be at least 3 characters.',
    ]);
  });

  it('enforces maxLength', () => {
    expect(issues([TextInput.make('sku').maxLength(2)], value('ABC'))).toEqual([
      'SKU may not be longer than 2 characters.',
    ]);
  });

  it('enforces email', () => {
    expect(issues([TextInput.make('sku').email()], value('nope'))).toEqual([
      'SKU must be a valid email address.',
    ]);
    expect(issues([TextInput.make('sku').email()], value('a@b.co'))).toEqual([]);
  });

  it('enforces url', () => {
    expect(issues([TextInput.make('sku').url()], value('nope'))).toEqual([
      'SKU must be a valid URL.',
    ]);
    expect(issues([TextInput.make('sku').url()], value('https://example.com'))).toEqual([]);
  });

  it('enforces a regex, with and without a custom message', () => {
    expect(issues([TextInput.make('sku').regex(/^\d+$/)], value('AB'))).toEqual([
      'SKU has an invalid format.',
    ]);
    expect(issues([TextInput.make('sku').regex(/^\d+$/, 'Digits only.')], value('AB'))).toEqual([
      'Digits only.',
    ]);
  });

  it('enforces numeric', () => {
    expect(issues([TextInput.make('sku').numeric()], value('AB'))).toEqual([
      'SKU must be numeric.',
    ]);
    expect(issues([TextInput.make('sku').numeric()], value('12'))).toEqual([]);
  });

  it('enforces numeric bounds', () => {
    const schema = [NumberField.make('qty').min(2).max(4)];

    expect(issues(schema, { lines: [{ qty: 1 }] })).toEqual([
      'Number must be greater than or equal to 2',
    ]);
    expect(issues(schema, { lines: [{ qty: 9 }] })).toEqual([
      'Number must be less than or equal to 4',
    ]);
    expect(issues(schema, { lines: [{ qty: 3 }] })).toEqual([]);
  });

  it('rejects a value that is not a number', () => {
    expect(issues([NumberField.make('qty')], { lines: [{ qty: 'abc' }] })).toEqual([
      'Qty must be a number.',
    ]);
  });

  it('applies no primitive rules to a boolean', () => {
    expect(issues([Checkbox.make('agreed').maxLength(1)], { lines: [{ agreed: true }] })).toEqual(
      [],
    );
  });
});

describe('issuesForItem: field-owned rules', () => {
  it("delegates to the child field's own validate()", () => {
    expect(
      issues([FileUpload.make('doc').maxFiles(1)], { lines: [{ doc: ['a.png', 'b.png'] }] }),
    ).toEqual(['Doc accepts at most 1 file.']);
  });

  it('runs a custom rule against the rest of the item', () => {
    const schema = [
      TextInput.make('sku').rule((v, item) =>
        item.note === v ? 'SKU and note must differ.' : true,
      ),
    ];

    expect(issues(schema, { lines: [{ sku: 'A', note: 'A' }] })).toEqual([
      'SKU and note must differ.',
    ]);
    expect(issues(schema, { lines: [{ sku: 'A', note: 'B' }] })).toEqual([]);
  });
});

describe('issuesForItem: simple repeaters', () => {
  const run = (field: TextInput, values: FormValues, index = 0) =>
    issuesForItem([], field, 'emails', ctxWith(values), index).map((issue) => issue.message);

  it('validates the scalar in place', () => {
    expect(run(TextInput.make('email').email(), { emails: ['nope'] })).toEqual([
      'Email must be a valid email address.',
    ]);
  });

  it('skips a hidden child', () => {
    expect(run(TextInput.make('email').email().hidden(), { emails: ['nope'] })).toEqual([]);
  });

  it('names the issue after the child field', () => {
    expect(
      issuesForItem([], TextInput.make('email').required(), 'emails', ctxWith({ emails: [''] }), 0),
    ).toEqual([{ name: 'email', message: 'Email is required.' }]);
  });
});
