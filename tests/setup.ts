import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// `useTheme` reads matchMedia at module scope, so this has to land before any
// import of the app graph — setup files run first, which is why it lives here.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

class MockObserver {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
  takeRecords = () => [];
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
}

globalThis.ResizeObserver ??= MockObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= MockObserver as unknown as typeof IntersectionObserver;

// jsdom implements neither, and Radix's dismissable layers call both.
Element.prototype.scrollIntoView ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

URL.createObjectURL ??= () => 'blob:mock';
URL.revokeObjectURL ??= () => undefined;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
