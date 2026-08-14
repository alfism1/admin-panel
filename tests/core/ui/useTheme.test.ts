import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ThemeModule = typeof import('@/core/ui/useTheme');

const listeners = new Set<() => void>();
let prefersDark = false;

const realMatchMedia = window.matchMedia;

/**
 * `useTheme` reads `localStorage` and `matchMedia` at module scope, so each
 * scenario has to start from a fresh module with the environment already set.
 */
async function loadTheme(): Promise<ThemeModule> {
  vi.resetModules();
  return import('@/core/ui/useTheme');
}

beforeEach(() => {
  listeners.clear();
  prefersDark = false;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return prefersDark;
    },
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: (_type: string, handler: () => void) => listeners.add(handler),
    removeEventListener: (_type: string, handler: () => void) => listeners.delete(handler),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  document.documentElement.classList.remove('dark');
});

describe('initial theme', () => {
  it('follows the system when nothing is stored', async () => {
    const { useTheme } = await loadTheme();

    expect(useTheme.getState().theme).toBe('system');
    expect(useTheme.getState().resolvedTheme).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('resolves to dark when the system prefers it', async () => {
    prefersDark = true;
    const { useTheme } = await loadTheme();

    expect(useTheme.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it.each(['light', 'dark'] as const)('restores a stored %s choice', async (stored) => {
    localStorage.setItem('admin.theme', stored);
    const { useTheme } = await loadTheme();

    expect(useTheme.getState().theme).toBe(stored);
    expect(useTheme.getState().resolvedTheme).toBe(stored);
  });

  it('ignores a stored value it does not recognise', async () => {
    localStorage.setItem('admin.theme', 'neon');
    const { useTheme } = await loadTheme();

    expect(useTheme.getState().theme).toBe('system');
  });
});

describe('setTheme', () => {
  it('persists an explicit choice', async () => {
    const { useTheme } = await loadTheme();

    useTheme.getState().setTheme('dark');

    expect(localStorage.getItem('admin.theme')).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('clears the stored choice when going back to system', async () => {
    localStorage.setItem('admin.theme', 'dark');
    const { useTheme } = await loadTheme();

    useTheme.getState().setTheme('system');

    expect(localStorage.getItem('admin.theme')).toBeNull();
    expect(useTheme.getState().resolvedTheme).toBe('light');
  });
});

describe('toggleTheme', () => {
  it('goes from light to dark', async () => {
    const { useTheme } = await loadTheme();

    useTheme.getState().toggleTheme();

    expect(useTheme.getState().theme).toBe('dark');
  });

  it('goes from dark back to light', async () => {
    localStorage.setItem('admin.theme', 'dark');
    const { useTheme } = await loadTheme();

    useTheme.getState().toggleTheme();

    expect(useTheme.getState().theme).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

describe('following the operating system', () => {
  it('re-resolves when the preference flips and nothing was chosen', async () => {
    const { useTheme } = await loadTheme();
    expect(useTheme.getState().resolvedTheme).toBe('light');

    prefersDark = true;
    listeners.forEach((handler) => handler());

    expect(useTheme.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('leaves an explicit choice alone', async () => {
    localStorage.setItem('admin.theme', 'light');
    const { useTheme } = await loadTheme();

    prefersDark = true;
    listeners.forEach((handler) => handler());

    expect(useTheme.getState().resolvedTheme).toBe('light');
  });
});
