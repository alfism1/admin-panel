import { fireEvent } from '@testing-library/react';

/**
 * Fires a change event whose `target.value` is exactly `raw`.
 *
 * jsdom runs the value sanitisation algorithm for `<input type="date|time">`,
 * so assigning an unparseable string silently yields `''`. That makes the
 * NaN/`null` guards in the date control unreachable through `fireEvent.change`
 * even though a hand-rolled DOM (or a browser quirk) can still deliver one.
 * Overriding the instance descriptor for the length of one dispatch is the only
 * way to exercise them.
 */
export function fireRawChange(input: HTMLInputElement, raw: string): void {
  const own = Object.getOwnPropertyDescriptor(input, 'value');

  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => raw,
    set: () => undefined,
  });

  try {
    fireEvent.change(input);
  } finally {
    if (own) Object.defineProperty(input, 'value', own);
    else Reflect.deleteProperty(input, 'value');
  }
}
