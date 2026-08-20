import { HttpError } from './db/types';

/**
 * Where the counters live.
 *
 * The default keeps them in process memory, which protects one instance from a
 * burst but means N replicas allow N times the configured budget. Implement
 * this against Redis (`INCR` + `PEXPIRE`, or a Lua script for exactness) and
 * pass it to `createRateLimiter` to get one shared budget, without this file
 * taking a dependency on any particular backend.
 */
export interface RateLimitStore {
  /**
   * Counts one hit against `key` inside a `windowMs` window, returning the
   * running count and when the window ends. Implementations must create the
   * window on first hit and let it expire on its own.
   */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}

export interface RateLimiter {
  /** Records one hit against `key`, throwing 429 once the window is exhausted. */
  hit: (key: string) => Promise<void>;
  /** Forgets a key — called after a success so a good login clears the count. */
  reset: (key: string) => Promise<void>;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  message?: string;
  store?: RateLimitStore;
}

export interface MemoryStoreOptions {
  /**
   * Upper bound on tracked keys. An attacker rotating source addresses would
   * otherwise grow this map without limit, turning a throttle into a leak.
   */
  maxKeys?: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/** Fixed-window counters in process memory. The default store. */
export function createMemoryStore({ maxKeys = 10_000 }: MemoryStoreOptions = {}): RateLimitStore {
  const windows = new Map<string, Window>();

  // Swept on write rather than on a timer: an interval would hold the event
  // loop open and keep the process from exiting on SIGTERM.
  const sweep = (now: number): void => {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  };

  return {
    increment(key: string, windowMs: number) {
      const now = Date.now();
      const existing = windows.get(key);

      if (!existing || existing.resetAt <= now) {
        if (windows.size >= maxKeys) sweep(now);
        // Still full of live windows: drop the oldest rather than grow.
        if (windows.size >= maxKeys) {
          const oldest = windows.keys().next();
          if (!oldest.done) windows.delete(oldest.value);
        }
        const fresh = { count: 1, resetAt: now + windowMs };
        windows.set(key, fresh);
        return Promise.resolve({ ...fresh });
      }

      existing.count += 1;
      return Promise.resolve({ count: existing.count, resetAt: existing.resetAt });
    },

    reset(key: string) {
      windows.delete(key);
      return Promise.resolve();
    },
  };
}

export function createRateLimiter({
  limit,
  windowMs,
  message = 'Too many requests. Please try again later.',
  store = createMemoryStore(),
}: RateLimitOptions): RateLimiter {
  return {
    async hit(key: string): Promise<void> {
      const { count, resetAt } = await store.increment(key, windowMs);
      if (count > limit) {
        throw new HttpError(
          429,
          message,
          undefined,
          Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
        );
      }
    },

    reset(key: string): Promise<void> {
      return store.reset(key);
    },
  };
}
