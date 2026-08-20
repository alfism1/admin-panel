import { vi } from 'vitest';

/**
 * `server/env.ts` reads `process.env` once, at module load, and `dotenv` fills
 * the gaps from whatever `.env` the developer happens to have. So a test that
 * cares about a variable has to set it *and* re-import the graph — including
 * the variables it wants absent, or a stray line in someone's `.env` decides
 * the assertion instead of the test.
 *
 * Pass `''` for "unset": `optional()` treats an empty value as missing, and a
 * key that is present at all stops dotenv overwriting it.
 */
export async function withServerEnv<T>(
  vars: Record<string, string>,
  load: () => Promise<T>,
): Promise<T> {
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  vi.resetModules();
  return load();
}
