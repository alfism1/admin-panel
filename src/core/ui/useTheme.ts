import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'admin.theme';

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStored(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function apply(theme: Theme): 'light' | 'dark' {
  const resolved = theme === 'system' ? systemTheme() : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  return resolved;
}

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const initialTheme = readStored();

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  resolvedTheme: apply(initialTheme),
  setTheme: (theme) => {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
    set({ theme, resolvedTheme: apply(theme) });
  },
  toggleTheme: () => get().setTheme(get().resolvedTheme === 'dark' ? 'light' : 'dark'),
}));

// Follow the OS while the user has not made an explicit choice.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useTheme.getState().theme === 'system') {
    useTheme.setState({ resolvedTheme: apply('system') });
  }
});
