import { describe, expect, it, vi } from 'vitest';
import { cn, debounce, getPath, isPlainObject, setPath, uniqueId } from '@/lib/utils';

describe('cn', () => {
  it('joins conditional class values', () => {
    const off = false as boolean;
    expect(cn('a', off && 'b', ['c', null], { d: true, e: false })).toBe('a c d');
  });

  it('lets the last conflicting tailwind utility win', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});

describe('getPath', () => {
  const record = { user: { role: { name: 'Admin' } }, count: 0, flag: false };

  it('reads a nested path', () => {
    expect(getPath(record, 'user.role.name')).toBe('Admin');
  });

  it('reads a top-level path', () => {
    expect(getPath(record, 'count')).toBe(0);
  });

  it('returns undefined instead of throwing on a broken link', () => {
    expect(getPath(record, 'user.missing.deeper')).toBeUndefined();
  });

  it('returns undefined for null and undefined sources', () => {
    expect(getPath(null, 'a.b')).toBeUndefined();
    expect(getPath(undefined, 'a')).toBeUndefined();
  });

  it('does not treat a primitive as traversable', () => {
    expect(getPath({ a: 'text' }, 'a.length')).toBeUndefined();
  });

  it('preserves falsy leaf values', () => {
    expect(getPath(record, 'flag')).toBe(false);
  });
});

describe('setPath', () => {
  it('writes a top-level key without mutating the source', () => {
    const source = { a: 1 };
    const next = setPath(source, 'b', 2);
    expect(next).toEqual({ a: 1, b: 2 });
    expect(source).toEqual({ a: 1 });
  });

  it('creates intermediate objects', () => {
    expect(setPath({}, 'a.b.c', 7)).toEqual({ a: { b: { c: 7 } } });
  });

  it('merges into an existing branch instead of replacing it', () => {
    expect(setPath({ a: { keep: 1 } }, 'a.add', 2)).toEqual({ a: { keep: 1, add: 2 } });
  });

  it('replaces a primitive sitting where an object is needed', () => {
    expect(setPath({ a: 'text' as unknown }, 'a.b', 1)).toEqual({ a: { b: 1 } });
  });

  it('leaves the nested source object untouched', () => {
    const source = { a: { b: 1 } };
    const next = setPath(source, 'a.b', 2);
    expect(source.a.b).toBe(1);
    expect(next.a).not.toBe(source.a);
  });
});

describe('isPlainObject', () => {
  it.each([
    [{}, true],
    [{ a: 1 }, true],
    [[], false],
    [null, false],
    [undefined, false],
    ['text', false],
    [42, false],
  ])('classifies %o as %s', (value, expected) => {
    expect(isPlainObject(value)).toBe(expected);
  });
});

describe('uniqueId', () => {
  it('uses the default prefix', () => {
    expect(uniqueId()).toMatch(/^id-[a-z0-9]+$/);
  });

  it('honours a custom prefix and does not repeat', () => {
    const first = uniqueId('field');
    const second = uniqueId('field');
    expect(first).toMatch(/^field-/);
    expect(first).not.toBe(second);
  });
});

describe('debounce', () => {
  it('runs once with the final arguments after the wait elapses', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced('a');
    debounced('b');
    debounced('c');
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledExactlyOnceWith('c');
  });

  it('cancel prevents a pending call', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced('a');
    debounced.cancel();
    vi.advanceTimersByTime(500);

    expect(spy).not.toHaveBeenCalled();
  });

  it('allows a second call after the first has fired', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 50);

    debounced(1);
    vi.advanceTimersByTime(50);
    debounced(2);
    vi.advanceTimersByTime(50);

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
