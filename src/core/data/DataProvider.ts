import { restDataProvider } from './restDataProvider';
import type { DataProvider } from './types';

export type { DataProvider } from './types';

let activeProvider: DataProvider = restDataProvider;

/** Swap the global provider once at boot (see `main.tsx`) to change the backend contract. */
export function setDataProvider(provider: DataProvider): void {
  activeProvider = provider;
}

export function getDataProvider(override?: DataProvider): DataProvider {
  return override ?? activeProvider;
}
