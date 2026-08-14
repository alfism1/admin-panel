import { describe, expect, it } from 'vitest';
import type { Field } from '@/core/forms/Field';
import { buildDefaultValues, collectFields, dehydrateValues } from '@/core/forms/formState';
import { Checkbox } from '@/core/forms/fields/Checkbox';
import { DatePicker } from '@/core/forms/fields/DatePicker';
import { FileUpload } from '@/core/forms/fields/FileUpload';
import { Hidden } from '@/core/forms/fields/Hidden';
import { Select } from '@/core/forms/fields/Select';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Grid } from '@/core/forms/layouts/Grid';
import { Section } from '@/core/forms/layouts/Section';
import { Tab, Tabs } from '@/core/forms/layouts/Tabs';
import type { FormValues } from '@/core/forms/types';
import { makeFieldContext, type ContextOverrides } from '../../helpers/context';

const context =
  (overrides: Omit<ContextOverrides, 'values' | 'ownName'> = {}) =>
  (values: FormValues, field: Field) =>
    makeFieldContext({ ...overrides, values, ownName: field.name });

describe('collectFields', () => {
  it('returns a flat list unchanged', () => {
    const fields = [TextInput.make('a'), TextInput.make('b')];
    expect(collectFields(fields).map((field) => field.name)).toEqual(['a', 'b']);
  });

  it('flattens a layout away', () => {
    const schema = [
      TextInput.make('a'),
      Grid.make(2).schema([TextInput.make('b'), TextInput.make('c')]),
    ];
    expect(collectFields(schema).map((field) => field.name)).toEqual(['a', 'b', 'c']);
  });

  it('walks nested layouts depth-first', () => {
    const schema = [
      Section.make('Profile').schema([
        TextInput.make('a'),
        Grid.make(2).schema([TextInput.make('b')]),
      ]),
      TextInput.make('c'),
    ];
    expect(collectFields(schema).map((field) => field.name)).toEqual(['a', 'b', 'c']);
  });

  it('reaches fields inside tabs', () => {
    const schema = [
      Tabs.make('main').tabs([
        Tab.make('One').schema([TextInput.make('a')]),
        Tab.make('Two').schema([TextInput.make('b')]),
      ]),
    ];
    expect(collectFields(schema).map((field) => field.name)).toEqual(['a', 'b']);
  });

  it('returns an empty list for an empty schema', () => {
    expect(collectFields([])).toEqual([]);
  });

  it('returns an empty list for an empty layout', () => {
    expect(collectFields([Grid.make(2)])).toEqual([]);
  });
});

describe('buildDefaultValues on create', () => {
  it('uses a type-appropriate empty value per field', () => {
    const fields = [
      TextInput.make('name'),
      Checkbox.make('active'),
      DatePicker.make('at'),
      FileUpload.make('cover'),
      Select.make('role'),
    ];

    expect(buildDefaultValues(fields, null, context())).toEqual({
      name: '',
      active: false,
      at: null,
      cover: null,
      role: null,
    });
  });

  it('prefers a declared default', () => {
    const fields = [TextInput.make('name').default('Ada'), Checkbox.make('active').default(true)];
    expect(buildDefaultValues(fields, null, context())).toEqual({ name: 'Ada', active: true });
  });

  it('resolves a default function against the context', () => {
    const fields = [TextInput.make('author').default((ctx) => String(ctx.user?.name))];
    expect(buildDefaultValues(fields, null, context())).toEqual({ author: 'Ada Lovelace' });
  });

  it('nests values by dot path', () => {
    const fields = [TextInput.make('profile.city').default('Jakarta')];
    expect(buildDefaultValues(fields, null, context())).toEqual({ profile: { city: 'Jakarta' } });
  });

  it('merges sibling nested fields into one branch', () => {
    const fields = [
      TextInput.make('profile.city').default('Jakarta'),
      TextInput.make('profile.zip').default('12345'),
    ];
    expect(buildDefaultValues(fields, null, context())).toEqual({
      profile: { city: 'Jakarta', zip: '12345' },
    });
  });
});

describe('buildDefaultValues on edit', () => {
  const record = { id: 1, name: 'Ada', active: true, profile: { city: 'London' } };

  it('prefers the record value over the declared default', () => {
    const fields = [TextInput.make('name').default('Fallback')];
    expect(buildDefaultValues(fields, record, context())).toEqual({ name: 'Ada' });
  });

  it('reads a nested record value', () => {
    const fields = [TextInput.make('profile.city')];
    expect(buildDefaultValues(fields, record, context())).toEqual({ profile: { city: 'London' } });
  });

  it('falls back to the default when the record omits the key', () => {
    const fields = [TextInput.make('nickname').default('none')];
    expect(buildDefaultValues(fields, record, context())).toEqual({ nickname: 'none' });
  });

  it('keeps a falsy record value rather than treating it as missing', () => {
    const fields = [Checkbox.make('active').default(true)];
    expect(buildDefaultValues(fields, { active: false }, context())).toEqual({ active: false });
  });

  it('keeps an explicit null from the record', () => {
    const fields = [TextInput.make('bio').default('x')];
    expect(buildDefaultValues(fields, { bio: null }, context())).toEqual({ bio: null });
  });

  it('only emits keys the schema declares', () => {
    const fields = [TextInput.make('name')];
    expect(buildDefaultValues(fields, record, context())).toEqual({ name: 'Ada' });
  });
});

describe('formatStateUsing', () => {
  it('transforms the value on the way into the form', () => {
    const fields = [
      TextInput.make('name').formatStateUsing((state) => String(state).toUpperCase()),
    ];
    expect(buildDefaultValues(fields, { name: 'ada' }, context())).toEqual({ name: 'ADA' });
  });

  it('also runs over an empty default', () => {
    const fields = [TextInput.make('tags').formatStateUsing(() => [])];
    expect(buildDefaultValues(fields, null, context())).toEqual({ tags: [] });
  });
});

describe('dehydrateValues', () => {
  it('passes active fields through', () => {
    const fields = [TextInput.make('name'), Checkbox.make('active')];
    const values = { name: 'Ada', active: true };
    expect(dehydrateValues(fields, values, context())).toEqual(values);
  });

  it('drops keys the schema does not declare', () => {
    const fields = [TextInput.make('name')];
    expect(dehydrateValues(fields, { name: 'Ada', stray: 'x' }, context())).toEqual({
      name: 'Ada',
    });
  });

  it('drops a hidden field, so it never reaches the API', () => {
    const fields = [TextInput.make('name'), TextInput.make('secret').hidden()];
    expect(dehydrateValues(fields, { name: 'Ada', secret: 'x' }, context())).toEqual({
      name: 'Ada',
    });
  });

  it('drops a field the user is not authorized for', () => {
    const fields = [TextInput.make('name'), TextInput.make('salary').authorize('salary.edit')];
    const values = { name: 'Ada', salary: 100 };

    expect(dehydrateValues(fields, values, context({ permissions: ['user.view'] }))).toEqual({
      name: 'Ada',
    });
  });

  it('keeps a field whose permission the user holds', () => {
    const fields = [TextInput.make('salary').authorize('salary.edit')];
    const values = { salary: 100 };

    expect(dehydrateValues(fields, values, context({ permissions: ['salary.edit'] }))).toEqual(
      values,
    );
  });

  it('drops a dehydrated(false) field', () => {
    const fields = [TextInput.make('name'), TextInput.make('confirm').dehydrated(false)];
    expect(dehydrateValues(fields, { name: 'Ada', confirm: 'x' }, context())).toEqual({
      name: 'Ada',
    });
  });

  it('honours a conditional dehydration rule', () => {
    const fields = [TextInput.make('password').dehydrated((state) => state !== '')];

    expect(dehydrateValues(fields, { password: '' }, context())).toEqual({});
    expect(dehydrateValues(fields, { password: 'secret' }, context())).toEqual({
      password: 'secret',
    });
  });

  it('applies dehydrateStateUsing on the way out', () => {
    const fields = [TextInput.make('name').dehydrateStateUsing((state) => String(state).trim())];
    expect(dehydrateValues(fields, { name: '  Ada  ' }, context())).toEqual({ name: 'Ada' });
  });

  it('nests the payload by dot path', () => {
    const fields = [TextInput.make('profile.city')];
    const values = { profile: { city: 'Jakarta', ignored: 'x' } };

    expect(dehydrateValues(fields, values, context())).toEqual({ profile: { city: 'Jakarta' } });
  });

  it('includes a Hidden field, which exists to be submitted', () => {
    const fields = [Hidden.make('tenant_id')];
    expect(dehydrateValues(fields, { tenant_id: 7 }, context())).toEqual({ tenant_id: 7 });
  });

  it('drops a field hidden only on the current operation', () => {
    const fields = [TextInput.make('password').hiddenOn('edit')];
    const values = { password: 'secret' };

    expect(dehydrateValues(fields, values, context({ operation: 'edit' }))).toEqual({});
    expect(dehydrateValues(fields, values, context({ operation: 'create' }))).toEqual(values);
  });

  it('emits undefined rather than omitting a declared but unset key', () => {
    const fields = [TextInput.make('name')];
    expect(dehydrateValues(fields, {}, context())).toEqual({ name: undefined });
  });
});
