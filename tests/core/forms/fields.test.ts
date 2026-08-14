import { describe, expect, it } from 'vitest';
import { Checkbox } from '@/core/forms/fields/Checkbox';
import { Hidden } from '@/core/forms/fields/Hidden';
import { Select, normalizeOptions } from '@/core/forms/fields/Select';
import { Textarea } from '@/core/forms/fields/Textarea';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Toggle } from '@/core/forms/fields/Toggle';
import { makeFieldContext } from '../../helpers/context';

describe('TextInput', () => {
  it('starts as a text input with no validation', () => {
    const field = TextInput.make('name');
    expect(field.name).toBe('name');
    expect(field.valueType).toBe('string');
    expect(field.definition.inputType).toBe('text');
    expect(field.definition.validation).toEqual({});
  });

  it('password() switches the input type', () => {
    expect(TextInput.make('password').password().definition.inputType).toBe('password');
  });

  it('email() sets both the input type and the validation rule', () => {
    const field = TextInput.make('email').email();
    expect(field.definition.inputType).toBe('email');
    expect(field.definition.validation.email).toBe(true);
  });

  it('url() sets both the input type and the validation rule', () => {
    const field = TextInput.make('site').url();
    expect(field.definition.inputType).toBe('url');
    expect(field.definition.validation.url).toBe(true);
  });

  it('numeric() records the step alongside the rule', () => {
    const field = TextInput.make('price').numeric(0.5);
    expect(field.definition.inputType).toBe('number');
    expect(field.definition.step).toBe(0.5);
    expect(field.definition.validation.numeric).toBe(true);
  });

  it('tel() only changes the input type', () => {
    const field = TextInput.make('phone').tel();
    expect(field.definition.inputType).toBe('tel');
    expect(field.definition.validation).toEqual({});
  });

  it('carries revealable, mask, prefix and suffix', () => {
    const field = TextInput.make('code').revealable().mask('9999-9999').prefix('#').suffix('!');
    expect(field.definition).toMatchObject({
      revealable: true,
      mask: '9999-9999',
      prefix: '#',
      suffix: '!',
    });
  });

  it('uses a stacked layout', () => {
    expect(TextInput.make('name').layoutMode).toBe('stacked');
  });
});

describe('Textarea', () => {
  it('defaults to three rows', () => {
    const field = Textarea.make('bio');
    expect(field.valueType).toBe('string');
    expect(field.definition.rows).toBe(3);
  });

  it('accepts a row count and autosize', () => {
    const field = Textarea.make('bio').rows(8).autosize();
    expect(field.definition.rows).toBe(8);
    expect(field.definition.autosize).toBe(true);
  });
});

describe('Select', () => {
  it('has an unknown value type, since options may be numbers or strings', () => {
    expect(Select.make('role').valueType).toBe('unknown');
  });

  it('stores options, multiple, searchable, preload and native', () => {
    const field = Select.make('role')
      .options({ admin: 'Admin' })
      .multiple()
      .searchable()
      .preload()
      .native();

    expect(field.definition).toMatchObject({
      options: { admin: 'Admin' },
      multiple: true,
      searchable: true,
      preload: true,
      native: true,
    });
  });

  it('stores a relationship config', () => {
    const field = Select.make('role_id').relationship({ resource: 'roles', titleKey: 'name' });
    expect(field.definition.relationship).toEqual({ resource: 'roles', titleKey: 'name' });
  });

  it('accepts a resolver for options', () => {
    const field = Select.make('city').options((ctx): Record<string, string> =>
      ctx.get('country') === 'id' ? { jkt: 'Jakarta' } : { nyc: 'New York' },
    );
    const resolve = field.definition.options as (ctx: unknown) => unknown;

    expect(resolve(makeFieldContext({ values: { country: 'id' } }))).toEqual({ jkt: 'Jakarta' });
  });
});

describe('normalizeOptions', () => {
  it('turns a record into value/label pairs', () => {
    expect(normalizeOptions({ draft: 'Draft', published: 'Published' })).toEqual([
      { value: 'draft', label: 'Draft' },
      { value: 'published', label: 'Published' },
    ]);
  });

  it('passes an array through untouched', () => {
    const options = [{ value: 1, label: 'One', description: 'first' }];
    expect(normalizeOptions(options)).toBe(options);
  });

  it('returns an empty list for undefined', () => {
    expect(normalizeOptions(undefined)).toEqual([]);
  });

  it('returns an empty list for an empty record', () => {
    expect(normalizeOptions({})).toEqual([]);
  });
});

describe('Checkbox', () => {
  it('is a boolean field defaulting to false', () => {
    const field = Checkbox.make('is_active');
    expect(field.valueType).toBe('boolean');
    expect(field.definition.defaultValue).toBe(false);
  });

  it('lays the label out inline by default, and stacked when asked', () => {
    expect(Checkbox.make('is_active').layoutMode).toBe('inline');
    expect(Checkbox.make('is_active').inline(false).layoutMode).toBe('stacked');
  });

  it('stores on and off tones', () => {
    const field = Checkbox.make('is_active').onColor('success').offColor('danger');
    expect(field.definition.onTone).toBe('success');
    expect(field.definition.offTone).toBe('danger');
  });
});

describe('Toggle', () => {
  it('is a boolean field defaulting to false', () => {
    const field = Toggle.make('is_active');
    expect(field.valueType).toBe('boolean');
    expect(field.definition.defaultValue).toBe(false);
  });

  it('lays the label out inline by default, and stacked when asked', () => {
    expect(Toggle.make('is_active').layoutMode).toBe('inline');
    expect(Toggle.make('is_active').inline(false).layoutMode).toBe('stacked');
  });

  it('renders a different control from Checkbox', () => {
    expect(Toggle.make('a').control).not.toBe(Checkbox.make('a').control);
  });
});

describe('Hidden', () => {
  it('renders nothing and takes no layout', () => {
    const field = Hidden.make('tenant_id');
    expect(field.layoutMode).toBe('bare');
    expect(typeof field.control).toBe('function');
  });

  it('still carries a value through the form', () => {
    expect(Hidden.make('tenant_id').default(7).definition.defaultValue).toBe(7);
  });
});

describe('field identity and state resolution', () => {
  it('falls back to a labelized name', () => {
    expect(TextInput.make('first_name').resolveLabel(makeFieldContext())).toBe('First Name');
  });

  it('prefers an explicit label', () => {
    expect(TextInput.make('first_name').label('Given name').resolveLabel(makeFieldContext())).toBe(
      'Given name',
    );
  });

  it('resolves a label function', () => {
    const field = TextInput.make('name').label((ctx) =>
      ctx.operation === 'create' ? 'New name' : 'Name',
    );

    expect(field.resolveLabel(makeFieldContext({ operation: 'create' }))).toBe('New name');
    expect(field.resolveLabel(makeFieldContext({ operation: 'edit' }))).toBe('Name');
  });

  it('is not required unless asked', () => {
    expect(TextInput.make('name').isRequired(makeFieldContext())).toBe(false);
  });

  it('resolves a conditional required rule', () => {
    const field = TextInput.make('reason').required((ctx) => ctx.get('status') === 'rejected');

    expect(field.isRequired(makeFieldContext({ values: { status: 'rejected' } }))).toBe(true);
    expect(field.isRequired(makeFieldContext({ values: { status: 'approved' } }))).toBe(false);
  });

  it('is always disabled on the view operation', () => {
    expect(TextInput.make('name').isDisabled(makeFieldContext({ operation: 'view' }))).toBe(true);
  });

  it('disabledOn disables for the listed operation only', () => {
    const field = TextInput.make('email').disabledOn('edit');

    expect(field.isDisabled(makeFieldContext({ operation: 'edit' }))).toBe(true);
    expect(field.isDisabled(makeFieldContext({ operation: 'create' }))).toBe(false);
  });

  it('resolves a conditional disabled rule', () => {
    const field = TextInput.make('name').disabled((ctx) => ctx.get('locked') === true);

    expect(field.isDisabled(makeFieldContext({ values: { locked: true } }))).toBe(true);
    expect(field.isDisabled(makeFieldContext({ values: { locked: false } }))).toBe(false);
  });

  it('tracks readOnly separately from disabled', () => {
    const field = TextInput.make('name').readOnly();
    expect(field.isReadOnly(makeFieldContext())).toBe(true);
    expect(field.isDisabled(makeFieldContext())).toBe(false);
  });
});

describe('validation builders', () => {
  it('accumulates rules rather than replacing them', () => {
    const field = TextInput.make('name').required().minLength(2).maxLength(50);
    expect(field.definition.validation).toEqual({ required: true, minLength: 2, maxLength: 50 });
  });

  it('stores numeric bounds', () => {
    const field = TextInput.make('age').min(18).max(99);
    expect(field.definition.validation).toMatchObject({ min: 18, max: 99 });
  });

  it('stores a regex with its message', () => {
    const field = TextInput.make('slug').regex(/^[a-z-]+$/, 'Lowercase and dashes only.');
    expect(field.definition.validation.regex).toEqual({
      pattern: /^[a-z-]+$/,
      message: 'Lowercase and dashes only.',
    });
  });

  it('appends custom rules in order', () => {
    const first = () => true as const;
    const second = () => 'nope';
    const field = TextInput.make('name').rule(first).rule(second);

    expect(field.definition.validation.rules).toEqual([first, second]);
  });

  it('stores nullable, confirmed and unique', () => {
    const field = TextInput.make('email')
      .nullable()
      .confirmed()
      .unique({ resource: 'users', ignoreRecord: true });

    expect(field.definition.validation).toMatchObject({
      nullable: true,
      confirmed: true,
      unique: { resource: 'users', ignoreRecord: true },
    });
  });
});

describe('dehydration', () => {
  it('dehydrates by default', () => {
    expect(TextInput.make('name').shouldDehydrate('anything')).toBe(true);
  });

  it('dehydrated(false) drops the field from the payload', () => {
    expect(TextInput.make('name').dehydrated(false).shouldDehydrate('x')).toBe(false);
  });

  it('accepts a predicate over the current state', () => {
    const field = TextInput.make('password').dehydrated((state) => state !== '');

    expect(field.shouldDehydrate('secret')).toBe(true);
    expect(field.shouldDehydrate('')).toBe(false);
  });
});

describe('escape hatches', () => {
  it('customComponent replaces the control', () => {
    const Custom = () => null;
    expect(TextInput.make('name').customComponent(Custom).definition.custom).toBe(Custom);
  });

  it('base validate() adds no issues of its own', () => {
    expect(TextInput.make('name').validate('x', makeFieldContext(), 'Name')).toEqual([]);
  });
});
