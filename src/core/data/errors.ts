import axios from 'axios';
import type { FieldValues, UseFormSetError, Path } from 'react-hook-form';
import { notify } from '@/core/ui/notify';
import type { NormalizedError } from './types';

interface LaravelValidationBody {
  message?: string;
  errors?: Record<string, string[] | string>;
}

export function normalizeError(error: unknown): NormalizedError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const body = (error.response?.data ?? {}) as LaravelValidationBody;

    const errors: Record<string, string[]> = {};
    for (const [field, messages] of Object.entries(body.errors ?? {})) {
      errors[field] = Array.isArray(messages) ? messages : [String(messages)];
    }

    return {
      status,
      // `||`, not `??`: an empty message is as useless to the user as a missing
      // one, and it would otherwise surface as a blank toast.
      message: body.message || error.message || 'Request failed.',
      errors,
      isValidation: status === 422 && Object.keys(errors).length > 0,
    };
  }

  if (error instanceof Error) {
    return { status: 0, message: error.message, errors: {}, isValidation: false };
  }

  return { status: 0, message: 'Something went wrong.', errors: {}, isValidation: false };
}

/**
 * Maps a 422 payload onto the form so messages land on the field that caused them;
 * everything else surfaces as a toast. Returns true when the error was consumed.
 */
export function applyServerErrors<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
): boolean {
  const normalized = normalizeError(error);

  if (normalized.isValidation) {
    for (const [field, messages] of Object.entries(normalized.errors)) {
      setError(field as Path<TValues>, { type: 'server', message: messages[0] });
    }
    notify.error('Please fix the highlighted fields.', normalized.message);
    return true;
  }

  notify.error(normalized.message);
  return false;
}
