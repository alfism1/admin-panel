import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { authStore } from '@/core/auth/authStore';

export const API_URL = import.meta.env.VITE_API_URL || '/api';
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
  /** Auth endpoints must never trigger the refresh flow, or 401 becomes a loop. */
  skipAuthRefresh?: boolean;
}

apiClient.interceptors.request.use((config) => {
  const token = authStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = authStore.getState();
  const response = await apiClient.post<{ accessToken: string; refreshToken?: string }>(
    '/auth/refresh',
    refreshToken ? { refreshToken } : {},
    { skipAuthRefresh: true } as RetriableConfig,
  );
  authStore.getState().setTokens(response.data.accessToken, response.data.refreshToken);
  return response.data.accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    if (error.response?.status !== 401 || !config || config._retried || config.skipAuthRefresh) {
      return Promise.reject(error);
    }

    config._retried = true;

    // A single in-flight refresh; every queued request awaits the same promise.
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });

    try {
      const token = await refreshPromise;
      config.headers.Authorization = `Bearer ${token}`;
      return await apiClient.request(config);
    } catch {
      authStore.getState().clear();
      const redirect = `${window.location.pathname}${window.location.search}`;
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`);
      }
      return Promise.reject(error);
    }
  },
);
