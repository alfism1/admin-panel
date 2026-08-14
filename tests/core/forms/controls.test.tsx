import { fireEvent, screen } from '@testing-library/react';
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

  it('applies a letter mask', async () => {
    renderControl([TextInput.make('code').mask('aa-99')]);

    const input = screen.getByLabelText('Code');
    await userEvent.type(input, 'ab12');

    expect(input).toHaveValue('ab-12');
  });

  it('stops a letter mask once the letters run out', async () => {
    renderControl([TextInput.make('code').mask('aaa')]);

    const input = screen.getByLabelText('Code');
    await userEvent.type(input, 'ab');

    expect(input).toHaveValue('ab');
  });

  it('stops at a letter slot when only digits are left', () => {
    renderControl([TextInput.make('code').mask('a-a')]);

    const input = screen.getByLabelText('Code');
    fireEvent.change(input, { target: { value: 'a1' } });

    expect(input).toHaveValue('a-');
  });

  it('stops at a digit slot when only letters are left', () => {
    renderControl([TextInput.make('code').mask('9-9')]);

    const input = screen.getByLabelText('Code');
    fireEvent.change(input, { target: { value: '1a' } });

    expect(input).toHaveValue('1-');
  });

  it('pulls the next matching character out of order', () => {
    renderControl([TextInput.make('code').mask('a9')]);

    // Pasted in one go: typing would re-mask after every keystroke and drop the
    // leading digit before the letter ever arrived.
    const input = screen.getByLabelText('Code');
    fireEvent.change(input, { target: { value: '1a' } });

    expect(input).toHaveValue('a1');
  });

  it('carries a step through to a numeric input', () => {
    renderControl([TextInput.make('price').numeric(0.5)]);

    const input = screen.getByLabelText('Price');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '0.5');
  });

  it('renders an arbitrary html input type', () => {
    renderControl([TextInput.make('query').type('search')]);

    expect(screen.getByLabelText('Query')).toHaveAttribute('type', 'search');
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

  it('counts characters against the max length', async () => {
    renderControl([Textarea.make('bio').maxLength(20)]);

    expect(screen.getByText('0/20')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Bio'), 'Hello');

    expect(screen.getByText('5/20')).toBeInTheDocument();
  });

  it('counts a null value as empty', () => {
    renderControl([Textarea.make('bio').maxLength(20)], { id: 1, bio: null });

    expect(screen.getByLabelText('Bio')).toHaveValue('');
    expect(screen.getByText('0/20')).toBeInTheDocument();
  });

  it('grows to fit its content when autosized', async () => {
    renderControl([Textarea.make('bio').autosize()]);

    const textarea = screen.getByLabelText('Bio') as HTMLTextAreaElement;
    expect(textarea).toHaveStyle({ resize: 'none', overflow: 'hidden' });
    // jsdom reports a scrollHeight of 0, so the effect can only be observed by
    // the height it writes back onto the element.
    expect(textarea.style.height).toBe('0px');

    await userEvent.type(textarea, 'Hello');
    expect(textarea.style.height).toBe('0px');
  });

  it('leaves the height alone when not autosized', () => {
    renderControl([Textarea.make('bio')]);

    const textarea = screen.getByLabelText('Bio') as HTMLTextAreaElement;
    expect(textarea.style.height).toBe('');
    expect(textarea.style.resize).toBe('');
  });

  it('is disabled when the field is disabled', () => {
    renderControl([Textarea.make('bio').disabled()]);
    expect(screen.getByLabelText('Bio')).toBeDisabled();
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

  it('applies the configured checked tone', () => {
    renderControl([Checkbox.make('is_active').onColor('danger')]);

    expect(screen.getByRole('checkbox', { name: 'Is Active' })).toHaveClass(
      'data-[state=checked]:bg-destructive',
    );
  });

  it('carries no tone class by default', () => {
    renderControl([Checkbox.make('is_active')]);

    expect(screen.getByRole('checkbox', { name: 'Is Active' }).className).not.toMatch(
      /bg-(success|warning|destructive|muted-foreground)/,
    );
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

  it('applies the on and off tones', () => {
    renderControl([Toggle.make('notify').onColor('success').offColor('danger')]);

    const toggle = screen.getByRole('switch', { name: 'Notify' });
    expect(toggle).toHaveClass('data-[state=checked]:bg-success');
    expect(toggle).toHaveClass('data-[state=unchecked]:bg-destructive/40');
    // The border half of the checked tone is stripped: a switch has no border.
    expect(toggle.className).not.toMatch(/border-success/);
  });

  it('carries no tone classes by default', () => {
    renderControl([Toggle.make('notify')]);

    expect(screen.getByRole('switch', { name: 'Notify' }).className).not.toMatch(
      /bg-(success|warning|destructive)/,
    );
  });

  it('is disabled when the field is read-only', () => {
    renderControl([Toggle.make('notify').readOnly()]);
    expect(screen.getByRole('switch', { name: 'Notify' })).toBeDisabled();
  });
});
