import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Field, type FieldConfig } from '@/core/forms/Field';
import { buildDefaultValues, collectFields } from '@/core/forms/formState';
import { SchemaForm } from '@/core/forms/SchemaForm';
import { Textarea } from '@/core/forms/fields/Textarea';
import type { FieldControl, FieldRenderProps, FormComponent, ValueType } from '@/core/forms/types';
import { makeFieldContext } from '../../helpers/context';
import { renderWithProviders } from '../../helpers/render';

/**
 * `valueType` drives the Zod primitive and the empty value a field falls back
 * to. Two of the seven types have no built-in field, so they are exercised the
 * way an application would reach them: by subclassing `Field`.
 */
function PlainControl({ state, value, onChange, onBlur }: FieldRenderProps) {
  return (
    <input
      id={state.id}
      value={value === null || value === undefined ? '' : String(value)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
}

class TypedField extends Field<unknown, FieldConfig> {
  readonly valueType: ValueType;

  private constructor(config: FieldConfig, valueType: ValueType) {
    super(config);
    this.valueType = valueType;
  }

  static of(name: string, valueType: ValueType): TypedField {
    return new TypedField({ name, validation: {} }, valueType);
  }

  get control(): FieldControl {
    return PlainControl as FieldControl;
  }
}

function renderForm(schema: FormComponent[]) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(<SchemaForm schema={schema} operation="create" onSubmit={onSubmit} />);
  return { onSubmit };
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Create' }));

describe('empty values by type', () => {
  const defaultsFor = (valueType: ValueType) => {
    const fields = collectFields([TypedField.of('value', valueType)]);
    return buildDefaultValues(fields, null, (values) => makeFieldContext({ values }));
  };

  it.each([
    ['boolean', false],
    ['array', []],
    ['number', null],
    ['date', null],
    ['file', null],
    ['string', ''],
    ['unknown', null],
  ] as Array<[ValueType, unknown]>)('starts a %s field at %o', (valueType, expected) => {
    expect(defaultsFor(valueType)).toEqual({ value: expected });
  });

  it('prefers an explicit default over the empty value', () => {
    const fields = collectFields([TypedField.of('value', 'array').default(['a'])]);
    const values = buildDefaultValues(fields, null, (v) => makeFieldContext({ values: v }));

    expect(values).toEqual({ value: ['a'] });
  });
});

describe('number validation', () => {
  const numeric = (name: string) => TypedField.of(name, 'number');

  it('accepts a numeric string', async () => {
    const { onSubmit } = renderForm([numeric('quantity')]);

    await userEvent.type(screen.getByLabelText('Quantity'), '42');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ quantity: '42' }));
  });

  it('rejects a value that is not a number', async () => {
    renderForm([numeric('quantity')]);

    await userEvent.type(screen.getByLabelText('Quantity'), 'abc');
    await submit();

    expect(await screen.findByText('Quantity must be a number.')).toBeInTheDocument();
  });

  it('enforces a minimum', async () => {
    renderForm([numeric('quantity').min(10)]);

    await userEvent.type(screen.getByLabelText('Quantity'), '3');
    await submit();

    expect(await screen.findByText(/greater than or equal to 10/i)).toBeInTheDocument();
  });

  it('enforces a maximum', async () => {
    renderForm([numeric('quantity').max(5)]);

    await userEvent.type(screen.getByLabelText('Quantity'), '9');
    await submit();

    expect(await screen.findByText(/less than or equal to 5/i)).toBeInTheDocument();
  });

  it('accepts a value inside both bounds', async () => {
    const { onSubmit } = renderForm([numeric('quantity').min(1).max(5)]);

    await userEvent.type(screen.getByLabelText('Quantity'), '3');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ quantity: '3' }));
  });
});

describe('base validation rules on a non-text field', () => {
  it('applies email() from the base builder', async () => {
    renderForm([Textarea.make('contact').email()]);

    await userEvent.type(screen.getByLabelText('Contact'), 'nope');
    await submit();

    expect(await screen.findByText('Contact must be a valid email address.')).toBeInTheDocument();
  });

  it('applies url() from the base builder', async () => {
    renderForm([Textarea.make('site').url()]);

    await userEvent.type(screen.getByLabelText('Site'), 'nope');
    await submit();

    expect(await screen.findByText('Site must be a valid URL.')).toBeInTheDocument();
  });

  it('applies numeric() from the base builder', async () => {
    renderForm([Textarea.make('code').numeric()]);

    await userEvent.type(screen.getByLabelText('Code'), 'abc');
    await submit();

    expect(await screen.findByText('Code must be numeric.')).toBeInTheDocument();
  });

  it('records the rules on the definition', () => {
    const field = Textarea.make('x').email().url().numeric();

    expect(field.definition.validation).toMatchObject({ email: true, url: true, numeric: true });
  });
});

describe('disabledOn', () => {
  it('accepts a single operation', () => {
    const field = TypedField.of('value', 'string').disabledOn('edit');

    expect(field.definition.disabledOn).toEqual(['edit']);
    expect(field.isDisabled(makeFieldContext({ operation: 'edit' }))).toBe(true);
    expect(field.isDisabled(makeFieldContext({ operation: 'create' }))).toBe(false);
  });

  it('accepts a list of operations', () => {
    const field = TypedField.of('value', 'string').disabledOn(['create', 'edit']);

    expect(field.definition.disabledOn).toEqual(['create', 'edit']);
    expect(field.isDisabled(makeFieldContext({ operation: 'create' }))).toBe(true);
  });
});
