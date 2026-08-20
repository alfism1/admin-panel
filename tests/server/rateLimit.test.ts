import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../server/db/types';
import { createMemoryStore, createRateLimiter, type RateLimitStore } from '../../server/rateLimit';

const START = new Date('2026-08-20T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createMemoryStore', () => {
  it('opens a window on the first hit', async () => {
    const store = createMemoryStore();
    expect(await store.increment('ip:1', 60_000)).toEqual({
      count: 1,
      resetAt: START.getTime() + 60_000,
    });
  });

  it('counts subsequent hits without moving the window', async () => {
    // A sliding reset would let a caller hold the window open forever by
    // hitting it just under the limit.
    const store = createMemoryStore();
    await store.increment('ip:1', 60_000);
    vi.advanceTimersByTime(30_000);

    expect(await store.increment('ip:1', 60_000)).toEqual({
      count: 2,
      resetAt: START.getTime() + 60_000,
    });
  });

  it('keys are independent', async () => {
    const store = createMemoryStore();
    await store.increment('ip:1', 60_000);
    await store.increment('ip:1', 60_000);

    expect(await store.increment('ip:2', 60_000)).toMatchObject({ count: 1 });
  });

  it('starts a fresh window once the old one has elapsed', async () => {
    const store = createMemoryStore();
    await store.increment('ip:1', 60_000);
    vi.advanceTimersByTime(60_000);

    expect(await store.increment('ip:1', 60_000)).toEqual({
      count: 1,
      resetAt: START.getTime() + 120_000,
    });
  });

  it('returns a copy, so a caller cannot edit the stored window', async () => {
    const store = createMemoryStore();
    const first = await store.increment('ip:1', 60_000);
    first.count = 999;

    expect(await store.increment('ip:1', 60_000)).toMatchObject({ count: 2 });
  });

  it('forgets a key on reset', async () => {
    const store = createMemoryStore();
    await store.increment('ip:1', 60_000);
    await store.reset('ip:1');

    expect(await store.increment('ip:1', 60_000)).toMatchObject({ count: 1 });
  });

  it('resetting an unknown key is not an error', async () => {
    const store = createMemoryStore();
    await expect(store.reset('never-seen')).resolves.toBeUndefined();
  });

  it('sweeps expired windows once it reaches maxKeys', async () => {
    // Without this the map is a memory leak keyed by attacker-chosen strings.
    const store = createMemoryStore({ maxKeys: 3 });
    await store.increment('a', 1_000);
    await store.increment('b', 1_000);
    await store.increment('c', 1_000);

    vi.advanceTimersByTime(1_000);
    await store.increment('d', 60_000);

    // a, b and c expired and were swept, so each is a fresh window again.
    expect(await store.increment('a', 60_000)).toMatchObject({ count: 1 });
    expect(await store.increment('d', 60_000)).toMatchObject({ count: 2 });
  });

  it('evicts the oldest key when every window is still live', async () => {
    const store = createMemoryStore({ maxKeys: 2 });
    await store.increment('a', 60_000);
    await store.increment('a', 60_000);
    await store.increment('b', 60_000);

    // `c` does not fit, so `a` — inserted first — is dropped.
    await store.increment('c', 60_000);

    // `b` first: it survived, and counting `a` again is itself an insert that
    // would evict `b` in turn.
    expect(await store.increment('b', 60_000)).toMatchObject({ count: 2 });
    expect(await store.increment('a', 60_000)).toMatchObject({ count: 1 });
  });

  it('never grows past maxKeys, however many keys arrive', async () => {
    const store = createMemoryStore({ maxKeys: 5 });
    for (let i = 0; i < 200; i += 1) await store.increment(`ip:${i}`, 60_000);

    // The 5 most recent are still counted; everything older was evicted.
    expect(await store.increment('ip:199', 60_000)).toMatchObject({ count: 2 });
    expect(await store.increment('ip:0', 60_000)).toMatchObject({ count: 1 });
  });
});

describe('createRateLimiter', () => {
  it('allows exactly `limit` hits', async () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    await expect(limiter.hit('ip:1')).resolves.toBeUndefined();
    await expect(limiter.hit('ip:1')).resolves.toBeUndefined();
    await expect(limiter.hit('ip:1')).resolves.toBeUndefined();
    await expect(limiter.hit('ip:1')).rejects.toBeInstanceOf(HttpError);
  });

  it('throws 429 with a default message', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    await limiter.hit('ip:1');

    await expect(limiter.hit('ip:1')).rejects.toMatchObject({
      status: 429,
      message: 'Too many requests. Please try again later.',
    });
  });

  it('uses a custom message when given one', async () => {
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      message: 'Too many sign-in attempts. Please try again later.',
    });
    await limiter.hit('user:ada@example.com');

    await expect(limiter.hit('user:ada@example.com')).rejects.toMatchObject({
      message: 'Too many sign-in attempts. Please try again later.',
    });
  });

  it('reports the seconds left in the window as Retry-After', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    await limiter.hit('ip:1');
    vi.advanceTimersByTime(20_000);

    await expect(limiter.hit('ip:1')).rejects.toMatchObject({ retryAfter: 40 });
  });

  it('rounds a partial second up', async () => {
    // Rounding down would tell a caller to retry while still throttled, and a
    // well-behaved client would then be refused a second time.
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    await limiter.hit('ip:1');
    vi.advanceTimersByTime(30_500);

    await expect(limiter.hit('ip:1')).rejects.toMatchObject({ retryAfter: 30 });
  });

  it('never asks the caller to retry in zero seconds', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 100 });
    await limiter.hit('ip:1');
    vi.advanceTimersByTime(99);

    await expect(limiter.hit('ip:1')).rejects.toMatchObject({ retryAfter: 1 });
  });

  it('lets the budget recover when the window rolls over', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    await limiter.hit('ip:1');
    await expect(limiter.hit('ip:1')).rejects.toMatchObject({ status: 429 });

    vi.advanceTimersByTime(60_000);
    await expect(limiter.hit('ip:1')).resolves.toBeUndefined();
  });

  it('clears the count on reset, so a good login is not still throttled', async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    await limiter.hit('user:ada@example.com');
    await limiter.hit('user:ada@example.com');
    await limiter.reset('user:ada@example.com');

    await expect(limiter.hit('user:ada@example.com')).resolves.toBeUndefined();
    await expect(limiter.hit('user:ada@example.com')).resolves.toBeUndefined();
  });

  it('throttles each key separately', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    await limiter.hit('ip:1');

    await expect(limiter.hit('ip:2')).resolves.toBeUndefined();
    await expect(limiter.hit('ip:1')).rejects.toMatchObject({ status: 429 });
  });

  it('drives an injected store instead of process memory', async () => {
    // The Redis seam. If this stops being the only way counters are reached,
    // a multi-replica deployment silently gets N times its configured budget.
    const increment = vi.fn().mockResolvedValue({ count: 5, resetAt: Date.now() + 10_000 });
    const reset = vi.fn().mockResolvedValue(undefined);
    const store: RateLimitStore = { increment, reset };

    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, store });
    await limiter.hit('ip:1');
    await limiter.reset('ip:1');

    expect(increment).toHaveBeenCalledWith('ip:1', 60_000);
    expect(reset).toHaveBeenCalledWith('ip:1');
  });

  it('honours a 429 decided by an injected store', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 11, resetAt: Date.now() + 5_000 }),
      reset: vi.fn(),
    };

    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, store });
    await expect(limiter.hit('ip:1')).rejects.toMatchObject({ status: 429, retryAfter: 5 });
  });

  it('gives every limiter its own default store', async () => {
    // Sharing one would make the login budget and the API budget the same
    // counter, so a burst of reads would lock a user out of signing in.
    const login = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const api = createRateLimiter({ limit: 1, windowMs: 60_000 });

    await login.hit('ip:1');
    await expect(api.hit('ip:1')).resolves.toBeUndefined();
  });
});
