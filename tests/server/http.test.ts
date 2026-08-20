import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '../../server/http';
import { withServerEnv } from './helpers/env';
import { makeRequest, makeResponse, type Captured, type RequestInit } from './helpers/http';

type HttpModule = typeof import('../../server/http');

const BASE = { API_ORIGIN: 'http://localhost:5173', TRUST_PROXY: '', SLOW_REQUEST_MS: '1000' };

async function loadHttp(vars: Record<string, string> = {}): Promise<HttpModule> {
  return withServerEnv({ ...BASE, ...vars }, () => import('../../server/http'));
}

/** Builds a router with one handler per route, then drives a real request through it. */
async function serve(
  http: HttpModule,
  routes: (router: InstanceType<HttpModule['Router']>) => void,
  init: RequestInit = {},
): Promise<Captured> {
  const router = new http.Router();
  routes(router);

  const { response, captured } = makeResponse();
  await http.createRequestListener(router)(makeRequest(init), response);
  return captured();
}

beforeEach(() => {
  // `log` writes a line per request; the assertions are on the response.
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('Router.match', () => {
  it('captures named parameters', async () => {
    const { Router } = await loadHttp();
    const router = new Router();
    router.get('/:resource/:id', () => null);

    expect(router.match('GET', '/posts/42')).toMatchObject({
      params: { resource: 'posts', id: '42' },
    });
  });

  it('decodes a percent-encoded parameter', async () => {
    const { Router } = await loadHttp();
    const router = new Router();
    router.get('/:resource/:id', () => null);

    expect(router.match('GET', '/posts/a%2Fb')?.params.id).toBe('a/b');
  });

  it('does not let a parameter swallow a slash', async () => {
    const { Router } = await loadHttp();
    const router = new Router();
    router.get('/:resource', () => null);

    expect(router.match('GET', '/posts/42')).toBeNull();
  });

  it('matches on method as well as path', async () => {
    const { Router } = await loadHttp();
    const router = new Router();
    router.get('/posts', () => null);

    expect(router.match('POST', '/posts')).toBeNull();
  });

  it('returns the first route registered, so specific ones may precede generic', async () => {
    const { Router } = await loadHttp();
    const router = new Router();
    router.get('/permissions', () => 'specific');
    router.get('/:resource', () => 'generic');

    expect(router.match('GET', '/permissions')?.handler({} as Context)).toBe('specific');
    expect(router.match('GET', '/posts')?.handler({} as Context)).toBe('generic');
  });

  it('carries the success status a route was registered with', async () => {
    const { Router } = await loadHttp();
    const router = new Router();
    router.post('/posts', () => null, 201);
    router.patch('/posts/:id', () => null);

    expect(router.match('POST', '/posts')?.status).toBe(201);
    expect(router.match('PATCH', '/posts/1')?.status).toBe(200);
  });
});

describe('request handling', () => {
  it('strips the /api prefix and any trailing slash', async () => {
    const http = await loadHttp();
    const seen: string[] = [];

    for (const url of ['/api/posts', '/posts/', '/api/posts///']) {
      await serve(http, (router) => router.get('/posts', (ctx) => seen.push(ctx.path)), { url });
    }

    expect(seen).toEqual(['/posts', '/posts', '/posts']);
  });

  it('treats a bare slash as the root route', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => ({ ok: true })), {
      url: '/api/',
    });

    expect(result.json).toEqual({ ok: true });
  });

  it('answers 404 for an unmatched path', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/posts', () => null), {
      url: '/nope',
    });

    expect(result.status).toBe(404);
    expect(result.json).toMatchObject({ message: expect.stringContaining('No route') });
  });

  it('exposes the query string, not merely the path', async () => {
    const http = await loadHttp();
    let query = '';
    await serve(
      http,
      (router) =>
        router.get('/posts', (ctx) => {
          query = ctx.query.get('search') ?? '';
        }),
      { url: '/posts?search=hello' },
    );

    expect(query).toBe('hello');
  });

  it('answers the registered success status', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.post('/posts', () => ({ id: 1 }), 201), {
      method: 'POST',
      url: '/posts',
      body: {},
    });

    expect(result.status).toBe(201);
  });
});

describe('request bodies', () => {
  it('parses JSON on the methods that carry one', async () => {
    const http = await loadHttp();

    for (const method of ['POST', 'PATCH', 'PUT']) {
      let body: unknown;
      await serve(http, (router) => router.add(method, '/posts', (ctx) => (body = ctx.body)), {
        method,
        url: '/posts',
        body: { title: 'Hi' },
      });
      expect(body).toEqual({ title: 'Hi' });
    }
  });

  it('does not read a body on GET or DELETE', async () => {
    const http = await loadHttp();
    let body: unknown;

    await serve(http, (router) => router.delete('/posts/:id', (ctx) => (body = ctx.body)), {
      method: 'DELETE',
      url: '/posts/1',
      body: { title: 'ignored' },
    });

    expect(body).toEqual({});
  });

  it('treats an empty body as an empty object', async () => {
    const http = await loadHttp();
    let body: unknown;

    await serve(http, (router) => router.post('/posts', (ctx) => (body = ctx.body)), {
      method: 'POST',
      url: '/posts',
    });

    expect(body).toEqual({});
  });

  it('answers 400 for a body that is not JSON', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.post('/posts', () => null), {
      method: 'POST',
      url: '/posts',
      body: '{not json',
    });

    expect(result.status).toBe(400);
    expect(result.json).toMatchObject({ message: 'Request body is not valid JSON.' });
  });

  it('answers 413 rather than buffering an unbounded body', async () => {
    // The cap is enforced while reading, so an attacker cannot spend the
    // server's memory before it decides to refuse.
    const http = await loadHttp();
    const result = await serve(http, (router) => router.post('/posts', () => null), {
      method: 'POST',
      url: '/posts',
      body: 'x'.repeat(2_000_001),
    });

    expect(result.status).toBe(413);
  });
});

describe('the client address', () => {
  const forwarded = { 'x-forwarded-for': '203.0.113.9, 70.41.3.18' };

  it('is the socket address by default', async () => {
    const { clientIp } = await loadHttp();
    expect(clientIp(makeRequest({ remoteAddress: '10.0.0.1' }))).toBe('10.0.0.1');
  });

  it('ignores X-Forwarded-For unless TRUST_PROXY says otherwise', async () => {
    // This is the whole reason the flag exists: honouring the header by
    // default lets any caller pick its own rate-limit bucket, and every
    // per-address limit in the API becomes decorative.
    const { clientIp } = await loadHttp({ TRUST_PROXY: 'false' });
    expect(clientIp(makeRequest({ headers: forwarded, remoteAddress: '10.0.0.1' }))).toBe(
      '10.0.0.1',
    );
  });

  it('reads the first hop of X-Forwarded-For when trusted', async () => {
    const { clientIp } = await loadHttp({ TRUST_PROXY: 'true' });
    expect(clientIp(makeRequest({ headers: forwarded, remoteAddress: '10.0.0.1' }))).toBe(
      '203.0.113.9',
    );
  });

  it('handles the header arriving more than once', async () => {
    const { clientIp } = await loadHttp({ TRUST_PROXY: 'true' });
    const request = makeRequest({
      headers: { 'x-forwarded-for': ['203.0.113.9', '198.51.100.1'] },
      remoteAddress: '10.0.0.1',
    });

    expect(clientIp(request)).toBe('203.0.113.9');
  });

  it('falls back to the socket when a trusted header is absent or blank', async () => {
    const { clientIp } = await loadHttp({ TRUST_PROXY: 'true' });

    expect(clientIp(makeRequest({ remoteAddress: '10.0.0.1' }))).toBe('10.0.0.1');
    expect(
      clientIp(makeRequest({ headers: { 'x-forwarded-for': '  ' }, remoteAddress: '10.0.0.1' })),
    ).toBe('10.0.0.1');
  });

  it('reports unknown rather than undefined for a socket with no address', async () => {
    const { clientIp } = await loadHttp();
    expect(clientIp(makeRequest({ remoteAddress: undefined }))).toBe('unknown');
  });

  it('reaches the handler as ctx.ip', async () => {
    const http = await loadHttp({ TRUST_PROXY: 'true' });
    let ip = '';

    await serve(http, (router) => router.get('/posts', (ctx) => (ip = ctx.ip)), {
      url: '/posts',
      headers: forwarded,
      remoteAddress: '10.0.0.1',
    });

    expect(ip).toBe('203.0.113.9');
  });
});

describe('CORS', () => {
  it('echoes a matching origin and allows credentials', async () => {
    // Credentials are sent, so the origin has to be echoed rather than `*`.
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => null), {
      headers: { origin: 'http://localhost:5173' },
    });

    expect(result.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(result.headers['access-control-allow-credentials']).toBe('true');
    expect(result.headers.vary).toContain('Origin');
  });

  it('echoes any origin outside production, to keep local tooling working', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => null), {
      headers: { origin: 'http://somewhere.else' },
    });

    expect(result.headers['access-control-allow-origin']).toBe('http://somewhere.else');
  });

  it('refuses a foreign origin in production', async () => {
    const http = await loadHttp({ NODE_ENV: 'production' });
    const result = await serve(http, (router) => router.get('/', () => null), {
      headers: { origin: 'http://somewhere.else' },
    });

    expect(result.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('answers a preflight without reaching a handler', async () => {
    const http = await loadHttp();
    const handler = vi.fn();
    const result = await serve(http, (router) => router.get('/', handler), { method: 'OPTIONS' });

    expect(result.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
    expect(result.headers['access-control-allow-methods']).toContain('DELETE');
    expect(result.headers['access-control-allow-headers']).toContain('Authorization');
  });
});

describe('security headers', () => {
  it('are set on every response', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => null));

    expect(result.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'cross-origin-resource-policy': 'same-site',
    });
  });

  it('are set on an error response too', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/posts', () => null), {
      url: '/nope',
    });

    expect(result.headers['x-content-type-options']).toBe('nosniff');
  });

  it('add HSTS only in production, where there is TLS to pin', async () => {
    const dev = await loadHttp();
    expect((await serve(dev, (r) => r.get('/', () => null))).headers).not.toHaveProperty(
      'strict-transport-security',
    );

    const prod = await loadHttp({ NODE_ENV: 'production' });
    expect((await serve(prod, (r) => r.get('/', () => null))).headers).toMatchObject({
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
    });
  });
});

describe('errors', () => {
  it('reports the status and message of an HttpError', async () => {
    const http = await loadHttp();
    const { HttpError } = await import('../../server/db/types');
    const result = await serve(http, (router) =>
      router.get('/', () => {
        throw new HttpError(403, 'This action is unauthorized.');
      }),
    );

    expect(result.status).toBe(403);
    expect(result.json).toEqual({ message: 'This action is unauthorized.' });
  });

  it('includes field errors when there are any', async () => {
    const http = await loadHttp();
    const { HttpError } = await import('../../server/db/types');
    const result = await serve(http, (router) =>
      router.get('/', () => {
        throw new HttpError(422, 'The given data was invalid.', { email: ['Required.'] });
      }),
    );

    expect(result.json).toEqual({
      message: 'The given data was invalid.',
      errors: { email: ['Required.'] },
    });
  });

  it('sends Retry-After for a throttled request', async () => {
    const http = await loadHttp();
    const { HttpError } = await import('../../server/db/types');
    const result = await serve(http, (router) =>
      router.get('/', () => {
        throw new HttpError(429, 'Too many requests.', undefined, 42);
      }),
    );

    expect(result.status).toBe(429);
    expect(result.headers['retry-after']).toBe('42');
  });

  it('answers 500 for anything that is not an HttpError', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) =>
      router.get('/', () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      }),
    );

    expect(result.status).toBe(500);
  });

  it('shows the underlying message outside production', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) =>
      router.get('/', () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      }),
    );

    expect(result.json).toMatchObject({ message: 'connect ECONNREFUSED 10.0.0.5:5432' });
  });

  it('redacts it in production', async () => {
    // A driver error carries hostnames, ports and sometimes SQL; none of that
    // belongs in a response.
    const http = await loadHttp({ NODE_ENV: 'production' });
    const result = await serve(http, (router) =>
      router.get('/', () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      }),
    );

    expect(result.json).toEqual({ message: 'Internal server error.' });
  });

  it('still logs the real error for the operator', async () => {
    const http = await loadHttp({ NODE_ENV: 'production' });
    await serve(http, (router) =>
      router.get('/', () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      }),
    );

    expect(console.error).toHaveBeenCalledWith('[api]', expect.any(Error));
  });

  it('handles a thrown value that is not an Error', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) =>
      router.get('/', () => {
        throw 'a string';
      }),
    );

    expect(result.json).toMatchObject({ message: 'Internal server error.' });
  });
});

describe('compression', () => {
  const big = { rows: Array.from({ length: 200 }, (_unused, index) => ({ index, name: 'x' })) };

  it('prefers brotli when the client accepts it', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => big), {
      headers: { 'accept-encoding': 'gzip, deflate, br' },
    });

    expect(result.headers['content-encoding']).toBe('br');
    expect(result.json).toEqual(big);
  });

  it('falls back to gzip', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => big), {
      headers: { 'accept-encoding': 'gzip, deflate' },
    });

    expect(result.headers['content-encoding']).toBe('gzip');
    expect(result.json).toEqual(big);
  });

  it('sends plain bytes when nothing is accepted', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => big));

    expect(result.headers).not.toHaveProperty('content-encoding');
    expect(result.json).toEqual(big);
  });

  it('leaves a small payload alone, where framing costs more than it saves', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => ({ ok: true })), {
      headers: { 'accept-encoding': 'br' },
    });

    expect(result.headers).not.toHaveProperty('content-encoding');
  });

  it('varies on Accept-Encoding once it has compressed', async () => {
    // Without this a shared cache can hand a brotli body to a client that
    // never asked for one.
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => big), {
      headers: { 'accept-encoding': 'br' },
    });

    expect(result.headers.vary).toBe('Origin, Accept-Encoding');
  });

  it('sets a Content-Length matching what was actually sent', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => big), {
      headers: { 'accept-encoding': 'br' },
    });

    expect(Number(result.headers['content-length'])).toBe(result.raw.length);
  });

  it('always answers JSON', async () => {
    const http = await loadHttp();
    const result = await serve(http, (router) => router.get('/', () => ({ ok: true })));
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8');
  });
});

describe('params', () => {
  it('reads the matched parameters off the context', async () => {
    const http = await loadHttp();
    let seen: Record<string, string> = {};

    await serve(
      http,
      (router) =>
        router.get('/:resource/:id', (ctx) => {
          seen = http.params(ctx);
        }),
      { url: '/posts/42' },
    );

    expect(seen).toEqual({ resource: 'posts', id: '42' });
  });

  it('is an empty object on a route with no parameters', async () => {
    const http = await loadHttp();
    expect(http.params({} as Context)).toEqual({});
  });
});
