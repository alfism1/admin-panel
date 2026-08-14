import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '@/core/forms/fields/Checkbox';
import { Textarea } from '@/core/forms/fields/Textarea';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Toggle } from '@/core/forms/fields/Toggle';
import { SchemaForm } from '@/core/forms/SchemaForm';
import type { FormComponent } from '@/core/forms/types';
import { renderWithProviders } from '../../helpers/render';

/**
 * Controls are driven through `SchemaForm` rather than mounted bare: they read
 * their value from React Hook Form, so a standalone render would only prove the
 * markup, not the wiring.
 */
function renderControl(schema: FormComponent[], record: Record<string, unknown> | null = null) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  renderWithProviders(
    <SchemaForm
      schema={schema}
      operation={record ? 'edit' : 'create'}
      record={record}
      onSubmit={onSubmit}
    />,
  );

  return { onSubmit };
}

describe('TextInputControl', () => {
  it('renders the configured input type', () => {
    renderControl([TextInput.make('email').email()]);
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  });

  it('renders a password field with no visible text', () => {
    renderControl([TextInput.make('password').password()]);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('reveals and re-hides a revealable password', async () => {
    renderControl([TextInput.make('password').password().revealable()]);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('offers no reveal toggle on a plain password field', () => {
    renderControl([TextInput.make('password').password()]);
    expect(screen.queryByRole('button', { name: 'Show password' })).not.toBeInTheDocument();
  });

  it('renders a numeric input with its step', () => {
    renderControl([TextInput.make('price').numeric(0.5)]);

    const input = screen.getByLabelText('Price');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '0.5');
  });

  it('renders a prefix and a suffix', () => {
    renderControl([TextInput.make('price').prefix('$').suffix('USD')]);

    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('applies a digit mask as the user types', async () => {
    renderControl([TextInput.make('card').mask('9999-9999')]);

    const input = screen.getByLabelText('Card');
    await userEvent.type(input, '12345678');

    expect(input).toHaveValue('1234-5678');
  });

  it('drops characters the mask does not accept', async () => {
    renderControl([TextInput.make('card').mask('9999')]);

    const input = screen.getByLabelText('Card');
    await userEvent.type(input, 'ab12cd34');

    expect(input).toHaveValue('1234');
  });

  it('renders a disabled input as disabled', () => {
    renderControl([TextInput.make('name').disabled()]);
    expect(screen.getByLabelText('Name')).toBeDisabled();
  });

  it('renders a readOnly input as read-only but still focusable', () => {
    renderControl([TextInput.make('name').readOnly()]);

    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('readonly');
    expect(input).not.toBeDisabled();
  });

  it('shows an empty string rather than "null" for a null value', () => {
    renderControl([TextInput.make('name')], { id: 1, name: null });
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });
});

describe('TextareaControl', () => {
  it('renders a textarea with the configured rows', () => {
    renderControl([Textarea.make('bio').rows(5)]);
    expect(screen.getByLabelText('Bio')).toHaveAttribute('rows', '5');
  });

  it('enforces maxLength on the element itself', () => {
    renderControl([Textarea.make('bio').maxLength(20)]);
    expect(screen.getByLabelText('Bio')).toHaveAttribute('maxlength', '20');
  });

  it('omits the counter when no max length is set', () => {
    renderControl([Textarea.make('bio')]);
    expect(screen.queryByText(/\/\d+$/)).not.toBeInTheDocument();
  });

  it('accepts typed input', async () => {
    renderControl([Textarea.make('bio')]);

    await userEvent.type(screen.getByLabelText('Bio'), 'Hello there');

    expect(screen.getByLabelText('Bio')).toHaveValue('Hello there');
  });
});

describe('CheckboxControl', () => {
  it('renders an unchecked checkbox by default', () => {
    renderControl([Checkbox.make('is_active')]);
    expect(screen.getByRole('checkbox', { name: 'Is Active' })).not.toBeChecked();
  });

  it('toggles on click', async () => {
    renderControl([Checkbox.make('is_active')]);

    const checkbox = screen.getByRole('checkbox', { name: 'Is Active' });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('submits the boolean value', async () => {
    const { onSubmit } = renderControl([Checkbox.make('is_active')]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Is Active' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ is_active: true }));
  });

  it('is disabled when the field is disabled', () => {
    renderControl([Checkbox.make('is_active').disabled()]);
    expect(screen.getByRole('checkbox', { name: 'Is Active' })).toBeDisabled();
  });

  it('is disabled when the field is read-only', () => {
    renderControl([Checkbox.make('is_active').readOnly()]);
    expect(screen.getByRole('checkbox', { name: 'Is Active' })).toBeDisabled();
  });
});

describe('ToggleControl', () => {
  it('renders a switch', () => {
    renderControl([Toggle.make('notify')]);
    expect(screen.getByRole('switch', { name: 'Notify' })).toBeInTheDocument();
  });

  it('toggles on click', async () => {
    renderControl([Toggle.make('notify')]);

    const toggle = screen.getByRole('switch', { name: 'Notify' });
    await userEvent.click(toggle);

    expect(toggle).toBeChecked();
  });

  it('reflects a record value', () => {
    renderControl([Toggle.make('notify')], { id: 1, notify: true });
    expect(screen.getByRole('switch', { name: 'Notify' })).toBeChecked();
  });
});
