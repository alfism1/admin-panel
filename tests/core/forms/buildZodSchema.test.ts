import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Field } from '@/core/forms/Field';
import { buildZodSchema, resetUniqueCache } from '@/core/forms/buildZodSchema';
import { Checkbox } from '@/core/forms/fields/Checkbox';
import { DatePicker } from '@/core/forms/fields/DatePicker';
import { Select } from '@/core/forms/fields/Select';
import { TextInput } from '@/core/forms/fields/TextInput';
import type { FormValues } from '@/core/forms/types';
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import type { DataProvider } from '@/core/data/types';
import { makeFieldContext, type ContextOverrides } from '../../helpers/context';

/** Returns `{ 'path.to.field': ['message', …] }` for everything the schema rejected. */
async function validate(
  fields: Field[],
  values: FormValues,
  overrides: Omit<ContextOverrides, 'values' | 'ownName'> = {},
): Promise<Record<string, string[]>> {
  const schema = buildZodSchema({
    fields,
    makeContext: (formValues, field) =>
      makeFieldContext({ ...overrides, values: formValues, ownName: field.name }),
  });

  const result = await schema.safeParseAsync(values);
  if (result.success) return {};

  const issues: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    (issues[key] ??= []).push(issue.message);
  }
  return issues;
}

describe('required', () => {
  const fields = [TextInput.make('name').required()];

  it.each([undefined, null, ''])('rejects %o', async (value) => {
    expect(await validate(fields, { name: value })).toEqual({ name: ['Name is required.'] });
  });

  it('rejects an empty array', async () => {
    const multi = [Select.make('tags').multiple().required()];
    expect(await validate(multi, { tags: [] })).toEqual({ tags: ['Tags is required.'] });
  });

  it('accepts a filled value', async () => {
    expect(await validate(fields, { name: 'Ada' })).toEqual({});
  });

  it('accepts false for a required boolean — false is a real answer', async () => {
    expect(await validate([Checkbox.make('agreed').required()], { agreed: false })).toEqual({});
  });

  it('uses the resolved label in the message', async () => {
    const labelled = [TextInput.make('name').label('Full name').required()];
    expect(await validate(labelled, {})).toEqual({ name: ['Full name is required.'] });
  });

  it('reports only the required error, not the type error too', async () => {
    const strict = [TextInput.make('name').required().minLength(5)];
    expect(await validate(strict, { name: '' })).toEqual({ name: ['Name is required.'] });
  });

  it('skips every other rule when an optional field is blank', async () => {
    expect(await validate([TextInput.make('email').email()], { email: '' })).toEqual({});
  });

  it('honours a conditional required rule', async () => {
    const conditional = [
      Select.make('status'),
      TextInput.make('reason').required((ctx) => ctx.get('status') === 'rejected'),
    ];

    expect(await validate(conditional, { status: 'rejected', reason: '' })).toEqual({
      reason: ['Reason is required.'],
    });
    expect(await validate(conditional, { status: 'approved', reason: '' })).toEqual({});
  });
});

describe('string rules', () => {
  it('enforces minLength', async () => {
    const issues = await validate([TextInput.make('name').minLength(3)], { name: 'ab' });
    expect(issues.name).toEqual(['Name must be at least 3 characters.']);
  });

  it('enforces maxLength', async () => {
    const issues = await validate([TextInput.make('name').maxLength(3)], { name: 'abcd' });
    expect(issues.name).toEqual(['Name may not be longer than 3 characters.']);
  });

  it('enforces email', async () => {
    const fields = [TextInput.make('email').email()];
    expect((await validate(fields, { email: 'nope' })).email).toEqual([
      'Email must be a valid email address.',
    ]);
    expect(await validate(fields, { email: 'ada@example.com' })).toEqual({});
  });

  it('enforces url', async () => {
    const fields = [TextInput.make('site').url()];
    expect((await validate(fields, { site: 'nope' })).site).toEqual(['Site must be a valid URL.']);
    expect(await validate(fields, { site: 'https://example.com' })).toEqual({});
  });

  it('enforces a regex with a custom message', async () => {
    const fields = [TextInput.make('slug').regex(/^[a-z-]+$/, 'Lowercase and dashes only.')];
    expect((await validate(fields, { slug: 'Not A Slug' })).slug).toEqual([
      'Lowercase and dashes only.',
    ]);
  });

  it('falls back to a generic message when the regex has none', async () => {
    const fields = [TextInput.make('slug').regex(/^[a-z]+$/)];
    expect((await validate(fields, { slug: '123' })).slug).toEqual(['Slug has an invalid format.']);
  });

  it('rejects a non-string for a string field', async () => {
    const issues = await validate([TextInput.make('name')], { name: 42 });
    expect(issues.name).toEqual(['Name must be text.']);
  });

  it('reports several string violations at once', async () => {
    const fields = [
      TextInput.make('name')
        .minLength(10)
        .regex(/^[a-z]+$/),
    ];
    expect((await validate(fields, { name: 'AB' })).name).toHaveLength(2);
  });
});

describe('numeric fields', () => {
  const fields = [TextInput.make('age').numeric()];

  it('accepts a numeric string', async () => {
    expect(await validate(fields, { age: '42' })).toEqual({});
  });

  it('rejects a non-numeric string', async () => {
    expect((await validate(fields, { age: 'abc' })).age).toEqual(['Age must be numeric.']);
  });

  it('accepts a negative and a decimal', async () => {
    expect(await validate(fields, { age: '-3.5' })).toEqual({});
  });
});

describe('date fields', () => {
  it('delegates bounds to the field, not the primitive check', async () => {
    const fields = [DatePicker.make('at').minDate('2024-06-01')];

    expect(await validate(fields, { at: '2024-06-02' })).toEqual({});
    expect((await validate(fields, { at: '2024-05-01' })).at).toEqual([
      'At must be on or after 01 Jun 2024.',
    ]);
  });

  it('rejects a non-string date value at the primitive layer', async () => {
    const issues = await validate([DatePicker.make('at')], { at: 20240601 });
    expect(issues.at).toEqual(['At must be a date.']);
  });
});

describe('boolean fields', () => {
  it('accepts true and false', async () => {
    const fields = [Checkbox.make('active')];
    expect(await validate(fields, { active: true })).toEqual({});
    expect(await validate(fields, { active: false })).toEqual({});
  });

  it('rejects a non-boolean', async () => {
    const issues = await validate([Checkbox.make('active')], { active: 'yes' });
    expect(issues.active).toEqual(['Active must be true or false.']);
  });
});

describe('confirmed', () => {
  const fields = [TextInput.make('password').confirmed()];

  it('passes when the confirmation matches', async () => {
    const values = { password: 'secret', password_confirmation: 'secret' };
    expect(await validate(fields, values)).toEqual({});
  });

  it('reports the mismatch on the confirmation field', async () => {
    const values = { password: 'secret', password_confirmation: 'other' };
    expect(await validate(fields, values)).toEqual({
      password_confirmation: ['Password confirmation does not match.'],
    });
  });

  it('reports a missing confirmation', async () => {
    expect(await validate(fields, { password: 'secret' })).toEqual({
      password_confirmation: ['Password confirmation does not match.'],
    });
  });
});

describe('custom rules', () => {
  it('reports a failing rule with its own message', async () => {
    const fields = [
      TextInput.make('name').rule((value) => (value === 'admin' ? 'Reserved name.' : true)),
    ];

    expect((await validate(fields, { name: 'admin' })).name).toEqual(['Reserved name.']);
    expect(await validate(fields, { name: 'ada' })).toEqual({});
  });

  it('passes every form value to the rule', async () => {
    const spy = vi.fn().mockReturnValue(true as const);
    await validate([TextInput.make('name').rule(spy)], { name: 'ada', other: 1 });

    expect(spy).toHaveBeenCalledWith('ada', { name: 'ada', other: 1 });
  });

  it('runs every rule, not just the first failure', async () => {
    const fields = [
      TextInput.make('name')
        .rule(() => 'first')
        .rule(() => 'second'),
    ];

    expect((await validate(fields, { name: 'x' })).name).toEqual(['first', 'second']);
  });
});

describe('inactive fields', () => {
  it('skips a hidden field entirely', async () => {
    const fields = [TextInput.make('name').required().hidden()];
    expect(await validate(fields, {})).toEqual({});
  });

  it('skips a field the user is not authorized for', async () => {
    const fields = [TextInput.make('salary').required().authorize('salary.edit')];
    expect(await validate(fields, {}, { permissions: ['user.view'] })).toEqual({});
  });

  it('validates a field hidden on another operation', async () => {
    const fields = [TextInput.make('password').required().hiddenOn('edit')];

    expect(await validate(fields, {}, { operation: 'edit' })).toEqual({});
    expect(await validate(fields, {}, { operation: 'create' })).toEqual({
      password: ['Password is required.'],
    });
  });
});

describe('nested field names', () => {
  it('reports the issue at the nested path', async () => {
    const fields = [TextInput.make('profile.city').required()];
    expect(await validate(fields, { profile: {} })).toEqual({
      'profile.city': ['City is required.'],
    });
  });

  it('reads the value from the nested path', async () => {
    const fields = [TextInput.make('profile.city').required()];
    expect(await validate(fields, { profile: { city: 'Jakarta' } })).toEqual({});
  });
});

describe('unique', () => {
  const provider = {
    getList: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    getMany: vi.fn(),
  } satisfies DataProvider;

  beforeEach(() => {
    resetUniqueCache();
    provider.getList.mockReset();
    setDataProvider(provider);
  });

  afterEach(() => {
    setDataProvider(restDataProvider);
  });

  const listResult = (rows: FormValues[]) => ({
    data: rows,
    meta: { total: rows.length, page: 1, perPage: 5, lastPage: 1 },
  });

  it('passes when no row holds the value', async () => {
    provider.getList.mockResolvedValue(listResult([]));
    const fields = [TextInput.make('email').unique({ resource: 'users' })];

    expect(await validate(fields, { email: 'new@example.com' })).toEqual({});
    expect(provider.getList).toHaveBeenCalledWith('users', {
      page: 1,
      perPage: 5,
      filters: { email: 'new@example.com' },
    });
  });

  it('reports a conflict', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 2, email: 'taken@example.com' }]));
    const fields = [TextInput.make('email').unique({ resource: 'users' })];

    expect((await validate(fields, { email: 'taken@example.com' })).email).toEqual([
      'This email is already taken.',
    ]);
  });

  it('ignores the record being edited when asked', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 7, email: 'mine@example.com' }]));
    const fields = [TextInput.make('email').unique({ resource: 'users', ignoreRecord: true })];

    const issues = await validate(
      fields,
      { email: 'mine@example.com' },
      { record: { id: 7 }, operation: 'edit' },
    );
    expect(issues).toEqual({});
  });

  it('still reports a conflict with a different record while ignoring its own', async () => {
    provider.getList.mockResolvedValue(listResult([{ id: 9, email: 'mine@example.com' }]));
    const fields = [TextInput.make('email').unique({ resource: 'users', ignoreRecord: true })];

    const issues = await validate(
      fields,
      { email: 'mine@example.com' },
      { record: { id: 7 }, operation: 'edit' },
    );
    expect(issues.email).toHaveLength(1);
  });

  it('ignores a returned row that does not actually hold the value', async () => {
    // A backend that ignores the filter would otherwise turn every save into a
    // false "already taken".
    provider.getList.mockResolvedValue(listResult([{ id: 2 }, { id: 3, email: null }]));
    const fields = [TextInput.make('email').unique({ resource: 'users' })];

    expect(await validate(fields, { email: 'new@example.com' })).toEqual({});
  });

  it('queries the configured column instead of the field name', async () => {
    provider.getList.mockResolvedValue(listResult([]));
    const fields = [TextInput.make('login').unique({ resource: 'users', column: 'email' })];

    await validate(fields, { login: 'ada@example.com' });

    expect(provider.getList).toHaveBeenCalledWith('users', {
      page: 1,
      perPage: 5,
      filters: { email: 'ada@example.com' },
    });
  });

  it('memoises the lookup so keystrokes do not re-query', async () => {
    provider.getList.mockResolvedValue(listResult([]));
    const fields = [TextInput.make('email').unique({ resource: 'users' })];

    await validate(fields, { email: 'a@example.com' });
    await validate(fields, { email: 'a@example.com' });

    expect(provider.getList).toHaveBeenCalledTimes(1);
  });

  it('resetUniqueCache forces the next lookup to hit the provider again', async () => {
    provider.getList.mockResolvedValue(listResult([]));
    const fields = [TextInput.make('email').unique({ resource: 'users' })];

    await validate(fields, { email: 'a@example.com' });
    resetUniqueCache();
    await validate(fields, { email: 'a@example.com' });

    expect(provider.getList).toHaveBeenCalledTimes(2);
  });
});

describe('whole-schema behaviour', () => {
  it('collects issues from every field in one pass', async () => {
    const fields = [
      TextInput.make('name').required(),
      TextInput.make('email').required().email(),
      TextInput.make('age').numeric(),
    ];

    const issues = await validate(fields, { name: '', email: 'nope', age: 'abc' });
    expect(Object.keys(issues).sort()).toEqual(['age', 'email', 'name']);
  });

  it('accepts a fully valid payload', async () => {
    const fields = [TextInput.make('name').required(), TextInput.make('email').email()];
    expect(await validate(fields, { name: 'Ada', email: 'ada@example.com' })).toEqual({});
  });

  it('accepts an empty schema', async () => {
    expect(await validate([], { anything: 1 })).toEqual({});
  });
});
