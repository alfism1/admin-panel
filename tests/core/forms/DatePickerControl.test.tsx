import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from '@/core/forms/fields/DatePicker';
import { SchemaForm } from '@/core/forms/SchemaForm';
import type { FormComponent, FormValues } from '@/core/forms/types';
import { renderWithProviders } from '../../helpers/render';

function renderField(schema: FormComponent[], record: FormValues | null = null) {
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

const submit = () => userEvent.click(screen.getByRole('button', { name: /Create|Save/ }));

describe('native input path', () => {
  it('renders a date input when native() is set', () => {
    renderField([DatePicker.make('published_at').native()]);

    expect(screen.getByLabelText('Published At')).toHaveAttribute('type', 'date');
  });

  it('renders a datetime-local input when time is enabled', () => {
    renderField([DatePicker.make('at').native().time()]);

    expect(screen.getByLabelText('At')).toHaveAttribute('type', 'datetime-local');
  });

  it('always uses a time input for a time-only picker, even without native()', () => {
    renderField([DatePicker.make('at').timeOnly()]);

    expect(screen.getByLabelText('At')).toHaveAttribute('type', 'time');
  });

  it('shows a stored value in the input pattern', () => {
    renderField([DatePicker.make('at').native().format('yyyy-MM-dd')], { at: '2024-03-01' });

    expect(screen.getByLabelText('At')).toHaveValue('2024-03-01');
  });

  it('shows a stored time-only value', () => {
    renderField([DatePicker.make('at').timeOnly()], { at: '14:45' });

    expect(screen.getByLabelText('At')).toHaveValue('14:45');
  });

  it('renders empty for a null value', () => {
    renderField([DatePicker.make('at').native()], { at: null });

    expect(screen.getByLabelText('At')).toHaveValue('');
  });

  it('applies min and max bounds to the input', () => {
    renderField([DatePicker.make('at').native().minDate('2024-01-01').maxDate('2024-12-31')]);

    const input = screen.getByLabelText('At');
    expect(input).toHaveAttribute('min', '2024-01-01');
    expect(input).toHaveAttribute('max', '2024-12-31');
  });

  it('sets a step of one second when seconds are enabled', () => {
    renderField([DatePicker.make('at').native().seconds()]);

    expect(screen.getByLabelText('At')).toHaveAttribute('step', '1');
  });

  it('converts a minutesStep into seconds', () => {
    renderField([DatePicker.make('at').native().time().minutesStep(15)]);

    expect(screen.getByLabelText('At')).toHaveAttribute('step', '900');
  });

  it('commits a typed date in the stored format', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').native().format('yyyy-MM-dd')]);

    await userEvent.type(screen.getByLabelText('At'), '2024-03-01');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-01' }));
  });

  it('reads a bare date as local midnight, not shifted a day by UTC', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').native().format('yyyy-MM-dd')]);

    await userEvent.type(screen.getByLabelText('At'), '2024-03-01');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-01' }));
  });

  it('commits null when the input is cleared', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').native().format('yyyy-MM-dd')], {
      at: '2024-03-01',
    });

    await userEvent.clear(screen.getByLabelText('At'));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: null }));
  });

  it('is disabled when the field is', () => {
    renderField([DatePicker.make('at').native().disabled()]);

    expect(screen.getByLabelText('At')).toBeDisabled();
  });
});

describe('calendar path', () => {
  // The trigger carries the field id, so the <label> supplies its accessible
  // name — the placeholder is its text content, not its name.
  const trigger = () => screen.getByRole('button', { name: 'At' });

  it('renders a trigger with the placeholder when empty', () => {
    renderField([DatePicker.make('at')]);

    expect(trigger()).toHaveTextContent('Pick a date');
  });

  it('uses a configured placeholder', () => {
    renderField([DatePicker.make('at').placeholder('Choose a day')]);

    expect(trigger()).toHaveTextContent('Choose a day');
  });

  it('shows the value in the display format', () => {
    renderField([DatePicker.make('at')], { at: '2024-03-01T00:00:00.000Z' });

    expect(trigger()).toHaveTextContent(/Mar 2024/);
  });

  it('honours a custom display format', () => {
    renderField([DatePicker.make('at').displayFormat('yyyy/MM/dd')], {
      at: new Date(2024, 2, 1).toISOString(),
    });

    expect(trigger()).toHaveTextContent('2024/03/01');
  });

  it('opens a calendar', async () => {
    renderField([DatePicker.make('at')]);

    await userEvent.click(trigger());

    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });

  it('offers a Today shortcut that commits the current day', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').format('yyyy-MM-dd')]);

    await userEvent.click(trigger());
    await userEvent.click(await screen.findByRole('button', { name: 'Today' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ at: format(new Date(), 'yyyy-MM-dd') }),
    );
  });

  it('labels the shortcut "Now" when time is enabled', async () => {
    renderField([DatePicker.make('at').time()]);

    await userEvent.click(trigger());

    expect(await screen.findByRole('button', { name: 'Now' })).toBeInTheDocument();
  });

  it('disables the Today shortcut when today is out of bounds', async () => {
    renderField([DatePicker.make('at').minDate('2099-01-01')]);

    await userEvent.click(trigger());

    expect(await screen.findByRole('button', { name: 'Today' })).toBeDisabled();
  });

  it('offers an inline clear button once a value is set', async () => {
    const { onSubmit } = renderField([DatePicker.make('at')], {
      at: new Date(2024, 2, 1).toISOString(),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Clear date' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: null }));
  });

  it('hides the clear button when empty', () => {
    renderField([DatePicker.make('at')]);

    expect(screen.queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument();
  });

  it('hides the clear button when disabled', () => {
    renderField([DatePicker.make('at').disabled()], { at: new Date().toISOString() });

    expect(screen.queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument();
  });

  it('offers a time input inside the calendar when time is enabled', async () => {
    renderField([DatePicker.make('at').time()]);

    await userEvent.click(trigger());

    expect(await screen.findByLabelText('Time')).toBeInTheDocument();
  });

  it('offers no time input for a date-only picker', async () => {
    renderField([DatePicker.make('at')]);

    await userEvent.click(trigger());
    await screen.findByRole('grid');

    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument();
  });

  it('shows a Clear shortcut in the calendar only when a value is set', async () => {
    renderField([DatePicker.make('at')], { at: new Date(2024, 2, 1).toISOString() });

    await userEvent.click(trigger());

    expect(await screen.findByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('is disabled when the field is', () => {
    renderField([DatePicker.make('at').disabled()]);

    expect(trigger()).toBeDisabled();
  });
});
