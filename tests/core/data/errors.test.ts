import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { applyServerErrors, normalizeError } from '@/core/data/errors';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const { notify } = await import('@/core/ui/notify');

function axiosError(status: number, data: unknown, message = 'Request failed'): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = {
    data,
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
  } as AxiosResponse;

  return new AxiosError(message, String(status), config as never, null, response);
}

describe('normalizeError', () => {
  it('maps a Laravel 422 payload', () => {
    const error = axiosError(422, {
      message: 'The given data was invalid.',
      errors: { email: ['This email address is already registered.'] },
    });

    expect(normalizeError(error)).toEqual({
      status: 422,
      message: 'The given data was invalid.',
      errors: { email: ['This email address is already registered.'] },
      isValidation: true,
    });
  });

  it('wraps a bare string message into an array', () => {
    const normalized = normalizeError(axiosError(422, { errors: { email: 'Already taken' } }));
    expect(normalized.errors).toEqual({ email: ['Already taken'] });
  });

  it('is not a validation error when 422 carries no field errors', () => {
    expect(normalizeError(axiosError(422, { message: 'Nope' })).isValidation).toBe(false);
  });

  it('is not a validation error for a non-422 status carrying field errors', () => {
    const normalized = normalizeError(axiosError(400, { errors: { email: ['x'] } }));
    expect(normalized.isValidation).toBe(false);
    expect(normalized.status).toBe(400);
  });

  it('falls back to the axios message when the body has none', () => {
    expect(normalizeError(axiosError(500, {}, 'Network Error')).message).toBe('Network Error');
  });

  it('reports status 0 for a request that never got a response', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK', {
      headers: new AxiosHeaders(),
    } as never);
    const normalized = normalizeError(error);

    expect(normalized.status).toBe(0);
    expect(normalized.message).toBe('Network Error');
  });

  it('handles a plain Error', () => {
    expect(normalizeError(new Error('Boom'))).toEqual({
      status: 0,
      message: 'Boom',
      errors: {},
      isValidation: false,
    });
  });

  it('handles a thrown non-Error', () => {
    expect(normalizeError('just a string')).toEqual({
      status: 0,
      message: 'Something went wrong.',
      errors: {},
      isValidation: false,
    });
  });

  it('tolerates a null response body', () => {
    expect(() => normalizeError(axiosError(500, null))).not.toThrow();
  });
});

describe('applyServerErrors', () => {
  it('maps each 422 field onto the form and reports that it consumed the error', () => {
    const setError = vi.fn();
    const error = axiosError(422, {
      message: 'The given data was invalid.',
      errors: { email: ['Already taken'], name: ['Too short'] },
    });

    expect(applyServerErrors(error, setError)).toBe(true);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Already taken' });
    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'Too short' });
  });

  it('uses only the first message per field', () => {
    const setError = vi.fn();
    applyServerErrors(axiosError(422, { errors: { email: ['First', 'Second'] } }), setError);

    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'First' });
  });

  it('toasts a non-validation error and leaves the form alone', () => {
    const setError = vi.fn();

    expect(applyServerErrors(axiosError(500, { message: 'Server exploded' }), setError)).toBe(
      false,
    );
    expect(setError).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('Server exploded');
  });

  it('toasts a summary alongside the field errors', () => {
    applyServerErrors(axiosError(422, { errors: { email: ['x'] } }), vi.fn());
    expect(notify.error).toHaveBeenCalledWith(
      'Please fix the highlighted fields.',
      expect.any(String),
    );
  });
});

describe('a response with no message anywhere', () => {
  it('falls back to a generic message rather than an empty toast', () => {
    expect(normalizeError(axiosError(500, {}, '')).message).toBe('Request failed.');
  });

  it('skips an empty body message in favour of the axios one', () => {
    expect(normalizeError(axiosError(500, { message: '' }, 'Network Error')).message).toBe(
      'Network Error',
    );
  });
});
