import { describe, expect, it } from 'vitest';
import {
  coerceDate,
  displayPattern,
  minutesOfDay,
  nativeInputPattern,
  nativeInputType,
  parseDateValue,
  serializeDate,
  storePattern,
} from '@/core/forms/fields/dateValue';

describe('storePattern', () => {
  it('is undefined for a plain date, meaning ISO 8601', () => {
    expect(storePattern({})).toBeUndefined();
    expect(storePattern({ withTime: true })).toBeUndefined();
  });

  it('prefers an explicit storeFormat', () => {
    expect(storePattern({ storeFormat: 'yyyy-MM-dd' })).toBe('yyyy-MM-dd');
  });

  it('uses a wall-clock pattern for time-only values', () => {
    expect(storePattern({ timeOnly: true })).toBe('HH:mm');
    expect(storePattern({ timeOnly: true, withSeconds: true })).toBe('HH:mm:ss');
  });

  it('lets storeFormat override the time-only default', () => {
    expect(storePattern({ timeOnly: true, storeFormat: 'HH.mm' })).toBe('HH.mm');
  });
});

describe('displayPattern', () => {
  it.each([
    [{}, 'dd MMM yyyy'],
    [{ withTime: true }, 'dd MMM yyyy HH:mm'],
    [{ withTime: true, withSeconds: true }, 'dd MMM yyyy HH:mm:ss'],
    [{ timeOnly: true }, 'HH:mm'],
    [{ timeOnly: true, withSeconds: true }, 'HH:mm:ss'],
    [{ displayFormat: 'PPP' }, 'PPP'],
  ])('resolves %o to %s', (config, expected) => {
    expect(displayPattern(config)).toBe(expected);
  });
});

describe('nativeInputType', () => {
  it.each([
    [{}, 'date'],
    [{ withTime: true }, 'datetime-local'],
    [{ timeOnly: true }, 'time'],
    [{ timeOnly: true, withTime: true }, 'time'],
  ])('maps %o to %s', (config, expected) => {
    expect(nativeInputType(config)).toBe(expected);
  });
});

describe('nativeInputPattern', () => {
  it.each([
    [{}, 'yyyy-MM-dd'],
    [{ withTime: true }, "yyyy-MM-dd'T'HH:mm"],
    [{ withTime: true, withSeconds: true }, "yyyy-MM-dd'T'HH:mm:ss"],
    [{ timeOnly: true }, 'HH:mm'],
    [{ timeOnly: true, withSeconds: true }, 'HH:mm:ss'],
  ])('maps %o to %s', (config, expected) => {
    expect(nativeInputPattern(config)).toBe(expected);
  });
});

describe('parseDateValue', () => {
  it('passes a valid Date through', () => {
    const date = new Date('2024-03-01T10:00:00Z');
    expect(parseDateValue(date)).toBe(date);
  });

  it('rejects an invalid Date', () => {
    expect(parseDateValue(new Date('nonsense'))).toBeNull();
  });

  it('reads an epoch number', () => {
    expect(parseDateValue(0)?.getTime()).toBe(0);
  });

  it('reads a full ISO string', () => {
    expect(parseDateValue('2024-03-01T10:30:00Z')?.toISOString()).toBe('2024-03-01T10:30:00.000Z');
  });

  it('reads a bare yyyy-MM-dd as local midnight, not UTC', () => {
    const parsed = parseDateValue('2024-03-01');
    expect(parsed?.getFullYear()).toBe(2024);
    expect(parsed?.getMonth()).toBe(2);
    expect(parsed?.getDate()).toBe(1);
    expect(parsed?.getHours()).toBe(0);
  });

  it('reads a value in its configured store pattern', () => {
    const parsed = parseDateValue('14:45', { timeOnly: true });
    expect(parsed?.getHours()).toBe(14);
    expect(parsed?.getMinutes()).toBe(45);
  });

  it('still reads a full ISO string for a field that now stores a narrower format', () => {
    const parsed = parseDateValue('2024-03-01T08:15:00Z', { storeFormat: 'yyyy-MM-dd' });
    expect(parsed).toBeInstanceOf(Date);
  });

  it.each([null, undefined, '', '   ', {}, true])('returns null for %o', (value) => {
    expect(parseDateValue(value)).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseDateValue('not a date')).toBeNull();
  });

  it('returns null for an epoch that is not a number', () => {
    expect(parseDateValue(Number.NaN)).toBeNull();
  });

  it('falls back to the Date constructor for a human-readable string', () => {
    // Neither the store pattern nor `parseISO` reads this, but `new Date` does.
    const parsed = parseDateValue('March 1, 2024 14:45:00');

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2024);
    expect(parsed?.getMonth()).toBe(2);
    expect(parsed?.getDate()).toBe(1);
  });
});

describe('serializeDate', () => {
  const date = new Date(2024, 2, 1, 14, 45, 30);

  it('emits ISO 8601 when no pattern is configured', () => {
    expect(serializeDate(date)).toBe(date.toISOString());
  });

  it('emits the configured store pattern', () => {
    expect(serializeDate(date, { storeFormat: 'yyyy-MM-dd' })).toBe('2024-03-01');
  });

  it('emits wall-clock time for a time-only field', () => {
    expect(serializeDate(date, { timeOnly: true })).toBe('14:45');
    expect(serializeDate(date, { timeOnly: true, withSeconds: true })).toBe('14:45:30');
  });

  it('round-trips through parseDateValue', () => {
    const config = { storeFormat: 'yyyy-MM-dd' };
    const stored = serializeDate(date, config);
    expect(serializeDate(parseDateValue(stored, config)!, config)).toBe(stored);
  });
});

describe('coerceDate', () => {
  it('returns null for null and undefined', () => {
    expect(coerceDate(null)).toBeNull();
    expect(coerceDate(undefined)).toBeNull();
  });

  it('accepts a Date, a string and an epoch', () => {
    expect(coerceDate(new Date(2024, 0, 1))).toBeInstanceOf(Date);
    expect(coerceDate('2024-01-01')).toBeInstanceOf(Date);
    expect(coerceDate(1700000000000)).toBeInstanceOf(Date);
  });

  it('reads a bound written in the field’s own store pattern', () => {
    const parsed = coerceDate('09:30', { timeOnly: true });

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getHours()).toBe(9);
    expect(parsed?.getMinutes()).toBe(30);
  });

  it('still returns null for a bound it cannot read at all', () => {
    expect(coerceDate('nonsense', { timeOnly: true })).toBeNull();
  });
});

describe('minutesOfDay', () => {
  it('counts minutes since midnight', () => {
    expect(minutesOfDay(new Date(2024, 0, 1, 0, 0))).toBe(0);
    expect(minutesOfDay(new Date(2024, 0, 1, 9, 30))).toBe(570);
    expect(minutesOfDay(new Date(2024, 0, 1, 23, 59))).toBe(1439);
  });

  it('ignores the calendar day', () => {
    expect(minutesOfDay(new Date(2024, 0, 1, 9, 30))).toBe(
      minutesOfDay(new Date(2030, 5, 20, 9, 30)),
    );
  });
});
