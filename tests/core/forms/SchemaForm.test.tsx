import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '@/core/forms/fields/Checkbox';
import { Hidden } from '@/core/forms/fields/Hidden';
import { Textarea } from '@/core/forms/fields/Textarea';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Grid } from '@/core/forms/layouts/Grid';
import { Section } from '@/core/forms/layouts/Section';
import { SchemaForm, type SchemaFormProps } from '@/core/forms/SchemaForm';
import { makeUser } from '../../helpers/context';
import { renderWithProviders } from '../../helpers/render';

function renderForm(props: Partial<SchemaFormProps> = {}, options = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  const utils = renderWithProviders(
    <SchemaForm
      schema={props.schema ?? [TextInput.make('name')]}
      operation={props.operation ?? 'create'}
      onSubmit={props.onSubmit ?? onSubmit}
      {...props}
    />,
    options,
  );

  return { ...utils, onSubmit: props.onSubmit ?? onSubmit };
}

describe('rendering fields', () => {
  it('renders a labelled input per field', () => {
    renderForm({ schema: [TextInput.make('name'), TextInput.make('email')] });

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('uses an explicit label over the derived one', () => {
    renderForm({ schema: [TextInput.make('name').label('Full name')] });

    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('renders helper text and wires it to the input', () => {
    renderForm({ schema: [TextInput.make('name').helperText('As it appears on your ID')] });

    expect(screen.getByText('As it appears on your ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('As it appears on your ID');
  });

  it('marks a required field', () => {
    renderForm({ schema: [TextInput.make('name').required()] });

    // The required asterisk lives inside the label but is aria-hidden, so the
    // accessible name stays clean even though the label's text is "Name*".
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-required', 'true');
  });

  it('renders a placeholder', () => {
    renderForm({ schema: [TextInput.make('name').placeholder('Ada Lovelace')] });

    expect(screen.getByPlaceholderText('Ada Lovelace')).toBeInTheDocument();
  });

  it('hides the label when asked but keeps the control', () => {
    renderForm({ schema: [TextInput.make('name').hiddenLabel()] });

    expect(screen.queryByText('Name')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('does not render a hidden field', () => {
    renderForm({ schema: [TextInput.make('name'), TextInput.make('secret').hidden()] });

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Secret')).not.toBeInTheDocument();
  });

  it('does not render a field the user is not authorized for', () => {
    renderForm(
      { schema: [TextInput.make('name'), TextInput.make('salary').authorize('salary.edit')] },
      { user: makeUser({ permissions: ['user.view'] }) },
    );

    expect(screen.queryByLabelText('Salary')).not.toBeInTheDocument();
  });

  it('renders a Hidden field with no visible control', () => {
    renderForm({ schema: [Hidden.make('tenant_id')] });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders a skeleton instead of the form while loading', () => {
    renderForm({ schema: [TextInput.make('name')], loading: true });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
  });
});

describe('layouts', () => {
  it('renders a section heading around its fields', () => {
    renderForm({
      schema: [Section.make('Account details').schema([TextInput.make('name')])],
    });

    expect(screen.getByText('Account details')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('renders fields nested in a grid inside a section', () => {
    renderForm({
      schema: [
        Section.make('Profile').schema([
          Grid.make(2).schema([TextInput.make('city'), TextInput.make('zip')]),
        ]),
      ],
    });

    expect(screen.getByLabelText('City')).toBeInTheDocument();
    expect(screen.getByLabelText('Zip')).toBeInTheDocument();
  });

  it('does not render a hidden layout or its children', () => {
    renderForm({
      schema: [
        TextInput.make('name'),
        Section.make('Advanced')
          .hidden()
          .schema([TextInput.make('secret')]),
      ],
    });

    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Secret')).not.toBeInTheDocument();
  });
});

describe('default values', () => {
  it('starts a create form empty', () => {
    renderForm({ schema: [TextInput.make('name')] });

    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('applies a declared default', () => {
    renderForm({ schema: [TextInput.make('name').default('Ada')] });

    expect(screen.getByLabelText('Name')).toHaveValue('Ada');
  });

  it('populates from the record on edit', () => {
    renderForm({
      schema: [TextInput.make('name'), TextInput.make('email')],
      operation: 'edit',
      record: { id: 1, name: 'Ada', email: 'ada@example.com' },
    });

    expect(screen.getByLabelText('Name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
  });

  it('reads a nested record value', () => {
    renderForm({
      schema: [TextInput.make('profile.city')],
      operation: 'edit',
      record: { id: 1, profile: { city: 'Jakarta' } },
    });

    expect(screen.getByLabelText('City')).toHaveValue('Jakarta');
  });

  it('checks a boolean field from the record', () => {
    renderForm({
      schema: [Checkbox.make('is_active')],
      operation: 'edit',
      record: { id: 1, is_active: true },
    });

    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});

describe('submit actions', () => {
  it('labels the button "Create" on create and "Save changes" on edit', () => {
    const { unmount } = renderForm({ operation: 'create' });
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    unmount();

    renderForm({ operation: 'edit', record: { id: 1 } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('honours a custom submit label', () => {
    renderForm({ submitLabel: 'Publish' });
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('renders a cancel button only when a handler is given', async () => {
    const onCancel = vi.fn();
    const { unmount } = renderForm({ onCancel });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();

    renderForm({});
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('renders extra actions', () => {
    renderForm({ extraActions: <button type="button">Save and add another</button> });

    expect(screen.getByRole('button', { name: 'Save and add another' })).toBeInTheDocument();
  });

  it('hides the action bar when asked', () => {
    renderForm({ hideActions: true });

    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
  });

  it('hides the action bar on the view operation', () => {
    renderForm({ operation: 'view', record: { id: 1 } });

    expect(screen.queryByRole('button', { name: /Save|Create/ })).not.toBeInTheDocument();
  });

  it('disables every field on the view operation', () => {
    renderForm({
      schema: [TextInput.make('name')],
      operation: 'view',
      record: { id: 1, name: 'Ada' },
    });

    expect(screen.getByLabelText('Name')).toBeDisabled();
  });
});

describe('submitting', () => {
  it('passes the entered values to onSubmit', async () => {
    const { onSubmit } = renderForm({ schema: [TextInput.make('name')] });

    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada' }));
  });

  it('omits a dehydrated(false) field from the payload', async () => {
    const { onSubmit } = renderForm({
      schema: [TextInput.make('name'), TextInput.make('confirm').dehydrated(false)],
    });

    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada' }));
  });

  it('nests a dotted field name in the payload', async () => {
    const { onSubmit } = renderForm({ schema: [TextInput.make('profile.city')] });

    await userEvent.type(screen.getByLabelText('City'), 'Jakarta');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ profile: { city: 'Jakarta' } }));
  });

  it('blocks submission and shows the message when a required field is empty', async () => {
    const { onSubmit } = renderForm({ schema: [TextInput.make('name').required()] });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a field-level rule violation', async () => {
    const { onSubmit } = renderForm({ schema: [TextInput.make('email').email()] });

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Email must be a valid email address.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('marks the invalid input for assistive tech', async () => {
    renderForm({ schema: [TextInput.make('name').required()] });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('submits once the error is corrected', async () => {
    const { onSubmit } = renderForm({ schema: [TextInput.make('name').required()] });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('Name is required.');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada' }));
  });

  it('skips validation for a hidden required field', async () => {
    const { onSubmit } = renderForm({
      schema: [TextInput.make('name'), TextInput.make('secret').required().hidden()],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });
});

describe('server errors', () => {
  it('maps a 422 field error onto the input', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      Object.assign(new Error('Validation failed'), {
        isAxiosError: true,
        response: {
          status: 422,
          data: { message: 'Invalid.', errors: { name: ['This name is taken.'] } },
        },
      }),
    );

    renderForm({ schema: [TextInput.make('name')], onSubmit });

    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('This name is taken.')).toBeInTheDocument();
  });

  it('does not blank the form when the request fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network down'));

    renderForm({ schema: [TextInput.make('name')], onSubmit });

    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.getByLabelText('Name')).toHaveValue('Ada');
  });
});

describe('reactivity', () => {
  it('re-evaluates a conditional field as its dependency changes', async () => {
    renderForm({
      schema: [
        TextInput.make('status'),
        TextInput.make('reason').visible((ctx) => ctx.get('status') === 'rejected'),
      ],
    });

    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Status'), 'rejected');

    expect(await screen.findByLabelText('Reason')).toBeInTheDocument();
  });

  it('calls afterStateUpdated with the old and new value', async () => {
    const afterStateUpdated = vi.fn();
    renderForm({ schema: [TextInput.make('name').afterStateUpdated(afterStateUpdated)] });

    await userEvent.type(screen.getByLabelText('Name'), 'A');

    await waitFor(() => expect(afterStateUpdated).toHaveBeenCalled());
    expect(afterStateUpdated.mock.calls[0][0]).toMatchObject({ state: 'A', oldState: '' });
  });
});

describe('textarea field', () => {
  it('renders with the configured row count', () => {
    renderForm({ schema: [Textarea.make('bio').rows(6)] });

    expect(screen.getByLabelText('Bio')).toHaveAttribute('rows', '6');
  });

  it('shows a character counter when a max length is set', async () => {
    renderForm({ schema: [Textarea.make('bio').maxLength(100)] });

    expect(screen.getByText('0/100')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Bio'), 'Hello');
    expect(screen.getByText('5/100')).toBeInTheDocument();
  });
});
