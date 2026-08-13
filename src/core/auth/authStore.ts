import { create } from 'zustand';
import type { AuthStatus, AuthUser } from './types';

const REFRESH_KEY = 'admin.refresh_token';

interface AuthState {
  /** Access token lives in memory only — never localStorage. */
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  setTokens: (accessToken: string, refreshToken?: string) => void;
  setUser: (user: AuthUser | null) => void;
  setStatus: (status: AuthStatus) => void;
  clear: () => void;
}

export const authStore = create<AuthState>((set) => ({
  accessToken: null,
  // TODO: move to httpOnly cookie once the backend sets one; localStorage is the fallback.
  refreshToken: localStorage.getItem(REFRESH_KEY),
  user: null,
  status: 'idle',

  setTokens: (accessToken, refreshToken) => {
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    set((state) => ({ accessToken, refreshToken: refreshToken ?? state.refreshToken }));
  },

  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),

  clear: () => {
    localStorage.removeItem(REFRESH_KEY);
    set({ accessToken: null, refreshToken: null, user: null, status: 'unauthenticated' });
  },
}));
