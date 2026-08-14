import {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/data/apiClient';
import { authStore } from '@/core/auth/authStore';

/**
 * The interceptor chain is what is under test, so requests are intercepted at
 * the adapter — the lowest layer axios owns — rather than by mocking the client.
 * Everything above it (request interceptor, 401 handling, retry) runs for real.
 */
interface Call {
  url: string;
  method: string;
  authorization: string | undefined;
  config: InternalAxiosRequestConfig;
}

const calls: Call[] = [];
let handler: (call: Call) => { status: number; data?: unknown };

function ok(data: unknown = {}) {
  return { status: 200, data };
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return {
    data,
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
    request: null,
  };
}

const adapter: AxiosAdapter = async (config) => {
  const call: Call = {
    url: config.url ?? '',
    method: (config.method ?? 'get').toLowerCase(),
    authorization: config.headers?.Authorization as string | undefined,
    config,
  };
  calls.push(call);

  const result = handler(call);
  const response = respond(config, result.status, result.data ?? {});

  if (result.status >= 400) {
    const { AxiosError } = await import('axios');
    throw new AxiosError(
      `Request failed with status ${result.status}`,
      String(result.status),
      config,
      null,
      response,
    );
  }
  return response;
};

const originalAdapter = apiClient.defaults.adapter;
const originalLocation = window.location;

/**
 * jsdom 26 makes `window.location` non-configurable, so `vi.spyOn(…, 'assign')`
 * throws. Swapping the whole object is the only way to observe the redirect —
 * and a real `assign()` would only log "Not implemented: navigation" anyway.
 */
const location = { pathname: '/', search: '', assign: vi.fn() };

beforeEach(() => {
  calls.length = 0;
  handler = () => ok();
  apiClient.defaults.adapter = adapter;

  authStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    status: 'idle',
  });

  location.pathname = '/';
  location.search = '';
  location.assign.mockClear();
  Object.defineProperty(window, 'location', { configurable: true, value: location });
});

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  vi.restoreAllMocks();
});

describe('request interceptor', () => {
  it('sends no Authorization header when there is no token', async () => {
    await apiClient.get('/users');

    expect(calls[0].authorization).toBeUndefined();
  });

  it('attaches the access token as a bearer', async () => {
    authStore.getState().setTokens('token-1');

    await apiClient.get('/users');

    expect(calls[0].authorization).toBe('Bearer token-1');
  });

  it('reads the token per request, not once at module load', async () => {
    authStore.getState().setTokens('token-1');
    await apiClient.get('/users');

    authStore.getState().setTokens('token-2');
    await apiClient.get('/users');

    expect(calls[0].authorization).toBe('Bearer token-1');
    expect(calls[1].authorization).toBe('Bearer token-2');
  });
});

describe('successful responses', () => {
  it('passes the response through untouched', async () => {
    handler = () => ok({ data: [{ id: 1 }] });

    const response = await apiClient.get('/users');

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ data: [{ id: 1 }] });
  });

  it('does not attempt a refresh on a non-401 error', async () => {
    handler = () => ({ status: 500, data: { message: 'Boom' } });

    await expect(apiClient.get('/users')).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(calls).toHaveLength(1);
  });

  it('does not attempt a refresh on a 403', async () => {
    handler = () => ({ status: 403, data: {} });

    await expect(apiClient.get('/users')).rejects.toBeDefined();
    expect(calls.map((call) => call.url)).toEqual(['/users']);
  });
});

describe('401 refresh and retry', () => {
  it('refreshes, then replays the original request with the new token', async () => {
    authStore.getState().setTokens('stale', 'refresh-1');

    handler = (call) => {
      if (call.url === '/auth/refresh') return ok({ accessToken: 'fresh' });
      if (call.url === '/users' && calls.filter((c) => c.url === '/users').length === 1) {
        return { status: 401, data: {} };
      }
      return ok({ data: 'ok' });
    };

    const response = await apiClient.get('/users');

    expect(calls.map((call) => call.url)).toEqual(['/users', '/auth/refresh', '/users']);
    expect(calls[2].authorization).toBe('Bearer fresh');
    expect(response.data).toEqual({ data: 'ok' });
  });

  it('sends the stored refresh token in the refresh body', async () => {
    authStore.getState().setTokens('stale', 'refresh-1');

    let refreshBody: unknown;
    handler = (call) => {
      if (call.url === '/auth/refresh') {
        refreshBody = JSON.parse(String(call.config.data));
        return ok({ accessToken: 'fresh' });
      }
      return calls.filter((c) => c.url === '/users').length === 1
        ? { status: 401, data: {} }
        : ok();
    };

    await apiClient.get('/users');

    expect(refreshBody).toEqual({ refreshToken: 'refresh-1' });
  });

  it('sends an empty body when there is no refresh token', async () => {
    let refreshBody: unknown;
    handler = (call) => {
      if (call.url === '/auth/refresh') {
        refreshBody = JSON.parse(String(call.config.data));
        return ok({ accessToken: 'fresh' });
      }
      return calls.filter((c) => c.url === '/users').length === 1
        ? { status: 401, data: {} }
        : ok();
    };

    await apiClient.get('/users');

    expect(refreshBody).toEqual({});
  });

  it('stores the rotated tokens', async () => {
    authStore.getState().setTokens('stale', 'refresh-1');

    handler = (call) => {
      if (call.url === '/auth/refresh') {
        return ok({ accessToken: 'fresh', refreshToken: 'refresh-2' });
      }
      return calls.filter((c) => c.url === '/users').length === 1
        ? { status: 401, data: {} }
        : ok();
    };

    await apiClient.get('/users');

    expect(authStore.getState().accessToken).toBe('fresh');
    expect(authStore.getState().refreshToken).toBe('refresh-2');
  });

  it('retries a request only once, so a still-401 response does not loop', async () => {
    handler = (call) => {
      if (call.url === '/auth/refresh') return ok({ accessToken: 'fresh' });
      return { status: 401, data: {} };
    };

    await expect(apiClient.get('/users')).rejects.toBeDefined();

    expect(calls.filter((call) => call.url === '/users')).toHaveLength(2);
    expect(calls.filter((call) => call.url === '/auth/refresh')).toHaveLength(1);
  });

  it('preserves the method and body of the replayed request', async () => {
    handler = (call) => {
      if (call.url === '/auth/refresh') return ok({ accessToken: 'fresh' });
      return calls.filter((c) => c.url === '/users').length === 1
        ? { status: 401, data: {} }
        : ok();
    };

    await apiClient.post('/users', { name: 'Ada' });

    const replay = calls.filter((call) => call.url === '/users')[1];
    expect(replay.method).toBe('post');
    expect(JSON.parse(String(replay.config.data))).toEqual({ name: 'Ada' });
  });
});

describe('single-flight refresh', () => {
  it('refreshes once for several requests that 401 together', async () => {
    const seen = new Map<string, number>();

    handler = (call) => {
      if (call.url === '/auth/refresh') return ok({ accessToken: 'fresh' });
      const count = (seen.get(call.url) ?? 0) + 1;
      seen.set(call.url, count);
      return count === 1 ? { status: 401, data: {} } : ok({ url: call.url });
    };

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);

    expect(calls.filter((call) => call.url === '/auth/refresh')).toHaveLength(1);
  });

  it('replays every queued request with the same fresh token', async () => {
    const seen = new Map<string, number>();

    handler = (call) => {
      if (call.url === '/auth/refresh') return ok({ accessToken: 'fresh' });
      const count = (seen.get(call.url) ?? 0) + 1;
      seen.set(call.url, count);
      return count === 1 ? { status: 401, data: {} } : ok();
    };

    await Promise.all([apiClient.get('/a'), apiClient.get('/b')]);

    const replays = calls.filter((call) => ['/a', '/b'].includes(call.url) && call.authorization);
    expect(replays).toHaveLength(2);
    expect(replays.every((call) => call.authorization === 'Bearer fresh')).toBe(true);
  });

  it('allows a new refresh after the previous one settled', async () => {
    let refreshes = 0;
    const seen = new Map<string, number>();

    handler = (call) => {
      if (call.url === '/auth/refresh') {
        refreshes += 1;
        return ok({ accessToken: `fresh-${refreshes}` });
      }
      const count = (seen.get(call.url) ?? 0) + 1;
      seen.set(call.url, count);
      return count === 1 ? { status: 401, data: {} } : ok();
    };

    await apiClient.get('/a');
    await apiClient.get('/b');

    expect(refreshes).toBe(2);
  });
});

describe('refresh failure', () => {
  beforeEach(() => {
    handler = (call) => {
      if (call.url === '/auth/refresh') return { status: 401, data: {} };
      return { status: 401, data: {} };
    };
  });

  it('clears the session', async () => {
    authStore.getState().setTokens('stale', 'refresh-1');
    authStore.getState().setStatus('authenticated');

    await expect(apiClient.get('/users')).rejects.toBeDefined();

    expect(authStore.getState().accessToken).toBeNull();
    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().status).toBe('unauthenticated');
  });

  it('redirects to login carrying the current path', async () => {
    location.pathname = '/users';
    location.search = '?page=2';

    await expect(apiClient.get('/users')).rejects.toBeDefined();

    expect(location.assign).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/users?page=2')}`,
    );
  });

  it('rejects with the original error, not the refresh error', async () => {
    await expect(apiClient.get('/users')).rejects.toMatchObject({
      config: expect.objectContaining({ url: '/users' }),
    });
  });

  it('does not redirect when already on the login page', async () => {
    location.pathname = '/login';

    await expect(apiClient.get('/users')).rejects.toBeDefined();

    expect(location.assign).not.toHaveBeenCalled();
  });

  it('does not loop when the refresh call itself 401s', async () => {
    await expect(apiClient.get('/users')).rejects.toBeDefined();

    expect(calls.filter((call) => call.url === '/auth/refresh')).toHaveLength(1);
  });
});

describe('skipAuthRefresh', () => {
  it('lets a 401 from login through without attempting a refresh', async () => {
    handler = () => ({ status: 401, data: { message: 'Bad credentials' } });

    await expect(
      apiClient.post('/auth/login', { email: 'a@b.c' }, { skipAuthRefresh: true } as never),
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(calls.map((call) => call.url)).toEqual(['/auth/login']);
  });

  it('does not clear the session on a failed login', async () => {
    authStore.getState().setTokens('token-1');
    handler = () => ({ status: 401, data: {} });

    await expect(
      apiClient.post('/auth/login', {}, { skipAuthRefresh: true } as never),
    ).rejects.toBeDefined();

    expect(authStore.getState().accessToken).toBe('token-1');
  });

  it('does not redirect on a failed login', async () => {
    handler = () => ({ status: 401, data: {} });

    await expect(
      apiClient.post('/auth/login', {}, { skipAuthRefresh: true } as never),
    ).rejects.toBeDefined();

    expect(location.assign).not.toHaveBeenCalled();
  });
});

describe('module configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads the base url from the environment', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/v1');
    vi.resetModules();

    const fresh = await import('@/core/data/apiClient');

    expect(fresh.API_URL).toBe('https://api.example.com/v1');
    expect(fresh.apiClient.defaults.baseURL).toBe('https://api.example.com/v1');
  });

  it('falls back to a relative /api when none is configured', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.resetModules();

    const fresh = await import('@/core/data/apiClient');

    expect(fresh.API_URL).toBe('/api');
  });

  it('turns the mock backend on only for the exact string "true"', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    vi.resetModules();
    expect((await import('@/core/data/apiClient')).USE_MOCK).toBe(true);

    vi.stubEnv('VITE_USE_MOCK', '1');
    vi.resetModules();
    expect((await import('@/core/data/apiClient')).USE_MOCK).toBe(false);
  });
});
