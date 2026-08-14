import { beforeEach, describe, expect, it } from 'vitest';
import { authStore } from '@/core/auth/authStore';
import { makeUser } from '../../helpers/context';

const REFRESH_KEY = 'admin.refresh_token';

describe('authStore', () => {
  beforeEach(() => {
    authStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      status: 'idle',
    });
  });

  it('starts empty', () => {
    const state = authStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.status).toBe('idle');
  });

  it('keeps the access token in memory only', () => {
    authStore.getState().setTokens('access-1');
    expect(authStore.getState().accessToken).toBe('access-1');
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('persists the refresh token', () => {
    authStore.getState().setTokens('access-1', 'refresh-1');
    expect(authStore.getState().refreshToken).toBe('refresh-1');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');
  });

  it('keeps the previous refresh token when a rotation omits one', () => {
    authStore.getState().setTokens('access-1', 'refresh-1');
    authStore.getState().setTokens('access-2');

    expect(authStore.getState().accessToken).toBe('access-2');
    expect(authStore.getState().refreshToken).toBe('refresh-1');
  });

  it('stores the user and status', () => {
    const user = makeUser();
    authStore.getState().setUser(user);
    authStore.getState().setStatus('authenticated');

    expect(authStore.getState().user).toEqual(user);
    expect(authStore.getState().status).toBe('authenticated');
  });

  it('clear wipes every token, the user, and the persisted refresh token', () => {
    authStore.getState().setTokens('access-1', 'refresh-1');
    authStore.getState().setUser(makeUser());
    authStore.getState().setStatus('authenticated');

    authStore.getState().clear();

    const state = authStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.status).toBe('unauthenticated');
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('notifies subscribers when the user changes', () => {
    const seen: Array<string | null> = [];
    const unsubscribe = authStore.subscribe((state) => seen.push(state.user?.name ?? null));

    authStore.getState().setUser(makeUser({ name: 'Grace' }));
    authStore.getState().setUser(null);
    unsubscribe();

    expect(seen).toEqual(['Grace', null]);
  });
});
