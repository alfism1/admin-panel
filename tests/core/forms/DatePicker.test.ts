import { describe, expect, it } from 'vitest';
import { DatePicker } from '@/core/forms/fields/DatePicker';
import { makeFieldContext } from '../../helpers/context';

const ctx = makeFieldContext();

describe('DatePicker shape', () => {
  it('is a date field storing ISO 8601 by default', () => {
    const field = DatePicker.make('published_at');
    expect(field.valueType).toBe('date');
    expect(field.definition.storeFormat).toBeUndefined();
  });

  it('time() turns on the time part', () => {
    expect(DatePicker.make('at').time().definition.withTime).toBe(true);
  });

  it('seconds() implies time()', () => {
    const field = DatePicker.make('at').seconds();
    expect(field.definition.withSeconds).toBe(true);
    expect(field.definition.withTime).toBe(true);
  });

  it('seconds() on a time-only picker does not add a calendar', () => {
    const field = DatePicker.make('at').timeOnly().seconds();
    expect(field.definition.withSeconds).toBe(true);
    expect(field.definition.withTime).toBe(false);
  });

  it('timeOnly() clears the datetime flag', () => {
    const field = DatePicker.make('at').time().timeOnly();
    expect(field.definition.timeOnly).toBe(true);
    expect(field.definition.withTime).toBe(false);
  });

  it('seconds(false) leaves the time part as it was', () => {
    const field = DatePicker.make('at').time().seconds(false);
    expect(field.definition.withSeconds).toBe(false);
    expect(field.definition.withTime).toBe(true);
  });

  it('timeOnly(false) leaves the time part as it was', () => {
    const field = DatePicker.make('at').time().timeOnly().timeOnly(false);
    expect(field.definition.timeOnly).toBe(false);
    expect(field.definition.withTime).toBe(false);
  });

  it('stores calendar and format options', () => {
    const field = DatePicker.make('at')
      .format('yyyy-MM-dd')
      .displayFormat('PPP')
      .minutesStep(15)
      .weekStartsOn(1)
      .native()
      .closeOnDateSelection();

    expect(field.definition).toMatchObject({
      storeFormat: 'yyyy-MM-dd',
      displayFormat: 'PPP',
      minutesStep: 15,
      weekStartsOn: 1,
      useNative: true,
      closeOnSelect: true,
    });
  });
});

describe('DatePicker.default', () => {
  it('serialises a Date into the stored format', () => {
    const field = DatePicker.make('at')
      .format('yyyy-MM-dd')
      .default(new Date(2024, 2, 1));
    expect(field.definition.defaultValue).toBe('2024-03-01');
  });

  it('serialises an ISO string through the stored format', () => {
    const field = DatePicker.make('at').format('yyyy-MM-dd').default('2024-03-01T09:00:00Z');
    expect(field.definition.defaultValue).toBe('2024-03-01');
  });

  it('stores ISO 8601 when no format is configured', () => {
    const date = new Date(2024, 2, 1, 9, 0, 0);
    const field = DatePicker.make('at').default(date);
    expect(field.definition.defaultValue).toBe(date.toISOString());
  });

  it('stores null for a null default', () => {
    expect(DatePicker.make('at').default(null).definition.defaultValue).toBeNull();
  });

  it('defers a resolver until the context is known', () => {
    const field = DatePicker.make('at')
      .format('yyyy-MM-dd')
      .default(() => new Date(2024, 0, 15));
    const resolve = field.definition.defaultValue as (context: unknown) => unknown;

    expect(typeof field.definition.defaultValue).toBe('function');
    expect(resolve(ctx)).toBe('2024-01-15');
  });
});

describe('DatePicker bounds resolution', () => {
  it('resolves static min and max dates', () => {
    const field = DatePicker.make('at').minDate('2024-01-01').maxDate('2024-12-31');
    expect(field.resolveMinDate(ctx)?.getFullYear()).toBe(2024);
    expect(field.resolveMaxDate(ctx)?.getMonth()).toBe(11);
  });

  it('returns null when no bound is configured', () => {
    const field = DatePicker.make('at');
    expect(field.resolveMinDate(ctx)).toBeNull();
    expect(field.resolveMaxDate(ctx)).toBeNull();
  });

  it('resolves a bound from other form values', () => {
    const field = DatePicker.make('ends_at').minDate((context) => context.get('starts_at'));
    const resolved = field.resolveMinDate(
      makeFieldContext({ values: { starts_at: '2024-06-01' } }),
    );

    expect(resolved?.getMonth()).toBe(5);
  });

  it('drops unparseable entries from disabledDates', () => {
    const field = DatePicker.make('at').disabledDates(['2024-01-01', 'nonsense']);
    expect(field.resolveDisabledDates(ctx)).toHaveLength(1);
  });
});

describe('DatePicker.isDateDisabled', () => {
  const field = DatePicker.make('at').disabledDates(['2024-01-01']);

  it('matches on the calendar day, ignoring the time', () => {
    expect(field.isDateDisabled(new Date(2024, 0, 1, 23, 59), ctx)).toBe(true);
  });

  it('leaves other days enabled', () => {
    expect(field.isDateDisabled(new Date(2024, 0, 2), ctx)).toBe(false);
  });
});

describe('DatePicker.validate', () => {
  it('accepts a value inside the bounds', () => {
    const field = DatePicker.make('at').minDate('2024-01-01').maxDate('2024-12-31');
    expect(field.validate('2024-06-15', ctx, 'Date')).toEqual([]);
  });

  it('rejects an unparseable value', () => {
    expect(DatePicker.make('at').validate('nonsense', ctx, 'Date')).toEqual([
      'Date must be a valid date.',
    ]);
  });

  it('reports a value before the minimum', () => {
    const field = DatePicker.make('at').minDate('2024-06-01');
    expect(field.validate('2024-05-31', ctx, 'Date')).toEqual([
      'Date must be on or after 01 Jun 2024.',
    ]);
  });

  it('reports a value after the maximum', () => {
    const field = DatePicker.make('at').maxDate('2024-06-01');
    expect(field.validate('2024-06-02', ctx, 'Date')).toEqual([
      'Date must be on or before 01 Jun 2024.',
    ]);
  });

  it('reports both bounds independently, not as one merged message', () => {
    const field = DatePicker.make('at').minDate('2024-06-01').maxDate('2024-06-30');
    expect(field.validate('2024-07-15', ctx, 'Date')).toHaveLength(1);
  });

  it('compares at day granularity, so maxDate(today) still allows today', () => {
    const now = new Date();
    const field = DatePicker.make('at').maxDate(now);
    expect(field.validate(now.toISOString(), ctx, 'Date')).toEqual([]);
  });

  it('compares at instant granularity once time is enabled', () => {
    const field = DatePicker.make('at')
      .time()
      .maxDate(new Date(2024, 5, 1, 12, 0));
    expect(field.validate(new Date(2024, 5, 1, 13, 0).toISOString(), ctx, 'Date')).toHaveLength(1);
  });

  it('compares time-only values by minute of day', () => {
    const field = DatePicker.make('at')
      .timeOnly()
      .minDate(new Date(2024, 0, 1, 9, 0))
      .maxDate(new Date(2024, 0, 1, 17, 0));

    expect(field.validate('12:30', ctx, 'Time')).toEqual([]);
    expect(field.validate('08:00', ctx, 'Time')).toEqual(['Time must be on or after 09:00.']);
    expect(field.validate('18:00', ctx, 'Time')).toEqual(['Time must be on or before 17:00.']);
  });

  it('ignores the calendar day of a time-only bound', () => {
    const field = DatePicker.make('at')
      .timeOnly()
      .minDate(new Date(1999, 11, 31, 9, 0));
    expect(field.validate('10:00', ctx, 'Time')).toEqual([]);
  });

  it('enforces a bound written in the field’s own store format', () => {
    const field = DatePicker.make('at').timeOnly().minDate('09:00');

    expect(field.resolveMinDate(ctx)).not.toBeNull();
    expect(field.validate('08:00', ctx, 'Time')).toEqual(['Time must be on or after 09:00.']);
    expect(field.validate('10:00', ctx, 'Time')).toEqual([]);
  });

  it('enforces a maximum written in the field’s own store format', () => {
    const field = DatePicker.make('at').format('yyyy-MM-dd').maxDate('2024-06-30');

    expect(field.validate('2024-07-01', ctx, 'Date')).toEqual([
      'Date must be on or before 30 Jun 2024.',
    ]);
    expect(field.validate('2024-06-01', ctx, 'Date')).toEqual([]);
  });

  it('still reads an ISO bound on a field with a narrower store format', () => {
    const field = DatePicker.make('at').format('yyyy-MM-dd').minDate('2024-01-01T00:00:00.000Z');

    expect(field.resolveMinDate(ctx)).not.toBeNull();
    expect(field.validate('2023-12-31', ctx, 'Date')).toHaveLength(1);
  });

  it('reports a disabled day', () => {
    const field = DatePicker.make('at').disabledDates(['2024-06-15']);
    expect(field.validate('2024-06-15', ctx, 'Date')).toEqual(['15 Jun 2024 is not available.']);
  });

  it('does not apply disabled days to a time-only picker', () => {
    const field = DatePicker.make('at').timeOnly().disabledDates(['2024-06-15']);
    expect(field.validate('10:00', ctx, 'Time')).toEqual([]);
  });
});
