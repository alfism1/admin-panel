import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from '@/core/forms/fields/DatePicker';
import { SchemaForm } from '@/core/forms/SchemaForm';
import type { FormComponent, FormValues } from '@/core/forms/types';
import { fireRawChange } from '../../helpers/events';
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

  it('is disabled when the field is read-only', () => {
    renderField([DatePicker.make('at').native().readOnly()]);

    expect(screen.getByLabelText('At')).toBeDisabled();
  });

  it('commits null when the input reports a value it cannot parse', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').native().format('yyyy-MM-dd')], {
      at: '2024-03-01',
    });

    fireRawChange(screen.getByLabelText('At') as HTMLInputElement, 'not-a-date');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: null }));
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

  // ------------------------------------------------------------- day selection

  async function clickDay(dayOfMonth: string) {
    const grid = await screen.findByRole('grid');
    const label = within(grid).getByText(dayOfMonth);
    await userEvent.click(label.closest('button') ?? label);
  }

  it('commits the day that was clicked at midnight', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').format('yyyy-MM-dd')], {
      at: '2024-03-01',
    });

    await userEvent.click(trigger());
    await clickDay('15');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-15' }));
  });

  it('closes the calendar after a date-only pick', async () => {
    renderField([DatePicker.make('at').format('yyyy-MM-dd')], { at: '2024-03-01' });

    await userEvent.click(trigger());
    await clickDay('15');

    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument());
  });

  it('stays open after a pick when closeOnDateSelection is off', async () => {
    renderField([DatePicker.make('at').format('yyyy-MM-dd').closeOnDateSelection(false)], {
      at: '2024-03-01',
    });

    await userEvent.click(trigger());
    await clickDay('15');

    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('keeps the existing time when a day is picked on a datetime picker', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm")], {
      at: '2024-03-01T09:30',
    });

    await userEvent.click(trigger());
    await clickDay('15');
    // A datetime picker stays open so the time can still be adjusted.
    expect(screen.getByRole('grid')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-15T09:30' }));
  });

  it('uses the current time when a day is picked with no value yet', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm")]);

    await userEvent.click(trigger());
    await clickDay('15');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(String(onSubmit.mock.calls[0]?.[0].at)).toMatch(/^\d{4}-\d{2}-15T\d{2}:\d{2}$/);
  });

  it('commits null when the selected day is clicked again', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').format('yyyy-MM-dd')], {
      at: '2024-03-15',
    });

    await userEvent.click(trigger());
    await clickDay('15');
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: null }));
  });

  // ------------------------------------------------------------- time controls

  it('shows the value in the inline time input', async () => {
    renderField([DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm")], {
      at: '2024-03-01T09:30',
    });

    await userEvent.click(trigger());

    expect(await screen.findByLabelText('Time')).toHaveValue('09:30');
  });

  it('shows an empty time input when there is no value', async () => {
    renderField([DatePicker.make('at').time()]);

    await userEvent.click(trigger());

    expect(await screen.findByLabelText('Time')).toHaveValue('');
  });

  it('widens the time input to seconds when configured', async () => {
    renderField([DatePicker.make('at').seconds().format("yyyy-MM-dd'T'HH:mm:ss")], {
      at: '2024-03-01T09:30:15',
    });

    await userEvent.click(trigger());

    const input = await screen.findByLabelText('Time');
    expect(input).toHaveValue('09:30:15');
    expect(input).toHaveAttribute('step', '1');
  });

  it('applies a typed time to the selected day', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm")], {
      at: '2024-03-01T09:30',
    });

    await userEvent.click(trigger());
    // A time input is typed segment by segment, so a whole-value change is the
    // only way to land on an exact time.
    fireEvent.change(await screen.findByLabelText('Time'), { target: { value: '18:45' } });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-01T18:45' }));
  });

  it('applies a typed time down to the second', async () => {
    const { onSubmit } = renderField(
      [DatePicker.make('at').seconds().format("yyyy-MM-dd'T'HH:mm:ss")],
      { at: '2024-03-01T09:30:15' },
    );

    await userEvent.click(trigger());
    fireEvent.change(await screen.findByLabelText('Time'), { target: { value: '18:45:20' } });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-01T18:45:20' }));
  });

  it('keeps the seconds of the current value when a day is picked', async () => {
    const { onSubmit } = renderField(
      [DatePicker.make('at').seconds().format("yyyy-MM-dd'T'HH:mm:ss")],
      { at: '2024-03-01T09:30:15' },
    );

    await userEvent.click(trigger());
    await clickDay('20');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-20T09:30:15' }));
  });

  it('drops the seconds of the current value on a minute-precision picker', async () => {
    const { onSubmit } = renderField(
      [DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm:ss")],
      { at: '2024-03-01T09:30:15' },
    );

    await userEvent.click(trigger());
    await clickDay('20');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-20T09:30:00' }));
  });

  it('applies a typed time to today when nothing is selected yet', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm")]);

    await userEvent.click(trigger());
    fireEvent.change(await screen.findByLabelText('Time'), { target: { value: '18:45' } });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(String(onSubmit.mock.calls[0]?.[0].at)).toMatch(/T18:45$/);
  });

  it('ignores a cleared time rather than dropping the date', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm")], {
      at: '2024-03-01T09:30',
    });

    await userEvent.click(trigger());
    await userEvent.clear(await screen.findByLabelText('Time'));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: '2024-03-01T09:30' }));
  });

  it('commits null for a time it cannot parse instead of crashing', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm")], {
      at: '2024-03-01T09:30',
    });

    await userEvent.click(trigger());
    fireRawChange((await screen.findByLabelText('Time')) as HTMLInputElement, 'ab:cd');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: null }));
  });

  it('closes the calendar from the Done button', async () => {
    renderField([DatePicker.make('at').time()]);

    await userEvent.click(trigger());
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument());
  });

  it('marks the field touched only once the calendar closes', async () => {
    renderField([DatePicker.make('at').required()]);

    await userEvent.click(trigger());
    await screen.findByRole('grid');
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------- shortcuts

  it('commits the current date and time from the Now shortcut', async () => {
    const { onSubmit } = renderField([DatePicker.make('at').time().format("yyyy-MM-dd'T'HH:mm")]);

    await userEvent.click(trigger());
    await userEvent.click(await screen.findByRole('button', { name: 'Now' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ at: format(new Date(), "yyyy-MM-dd'T'HH:mm") }),
    );
  });

  it('clears the value from the Clear shortcut and closes', async () => {
    const { onSubmit } = renderField([DatePicker.make('at')], {
      at: new Date(2024, 2, 1).toISOString(),
    });

    await userEvent.click(trigger());
    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument());
    await submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ at: null }));
  });

  it('hides the Clear shortcut while empty', async () => {
    renderField([DatePicker.make('at')]);

    await userEvent.click(trigger());
    await screen.findByRole('grid');

    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('disables the Today shortcut when today is past the maximum', async () => {
    renderField([DatePicker.make('at').maxDate('2000-01-01')]);

    await userEvent.click(trigger());

    expect(await screen.findByRole('button', { name: 'Today' })).toBeDisabled();
  });

  it('disables the Today shortcut when today is explicitly blocked', async () => {
    renderField([DatePicker.make('at').disabledDates([new Date()])]);

    await userEvent.click(trigger());

    expect(await screen.findByRole('button', { name: 'Today' })).toBeDisabled();
  });

  it('bounds the calendar by both minDate and maxDate', async () => {
    renderField([DatePicker.make('at').minDate('2024-03-10').maxDate('2024-03-20')], {
      at: '2024-03-15T00:00:00.000Z',
    });

    await userEvent.click(trigger());
    const grid = await screen.findByRole('grid');

    const outOfRange = within(grid).getByText('5').closest('button');
    expect(outOfRange).toBeDisabled();
    const inRange = within(grid).getByText('12').closest('button');
    expect(inRange).not.toBeDisabled();
    const pastMax = within(grid).getByText('25').closest('button');
    expect(pastMax).toBeDisabled();
  });

  it('honours weekStartsOn', async () => {
    renderField([DatePicker.make('at').weekStartsOn(1)]);

    await userEvent.click(trigger());
    const grid = await screen.findByRole('grid');

    // The weekday row is `aria-hidden`, so it is unreachable by role.
    expect(grid.querySelector('th')).toHaveTextContent('Mo');
  });
});
