import { brotliCompress, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from './env';
import { HttpError } from './db/types';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

export interface Context {
  method: string;
  path: string;
  segments: string[];
  query: URLSearchParams;
  body: Record<string, unknown>;
  headers: IncomingMessage['headers'];
  /** Caller address, used to key rate limits. */
  ip: string;
}

type Handler = (ctx: Context) => Promise<unknown> | unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  /** Success status; only resource creation answers 201. */
  status: number;
}

const MAX_BODY_BYTES = 2_000_000;

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler, status = 200): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      `^${path.replace(/:([A-Za-z_]+)/g, (_match, key: string) => {
        keys.push(key);
        return '([^/]+)';
      })}$`,
    );
    this.routes.push({ method, pattern, keys, handler, status });
    return this;
  }

  get = (path: string, handler: Handler) => this.add('GET', path, handler);
  post = (path: string, handler: Handler, status = 200) => this.add('POST', path, handler, status);
  patch = (path: string, handler: Handler) => this.add('PATCH', path, handler);
  put = (path: string, handler: Handler) => this.add('PUT', path, handler);
  delete = (path: string, handler: Handler) => this.add('DELETE', path, handler);

  match(
    method: string,
    path: string,
  ): { handler: Handler; params: Record<string, string>; status: number } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const found = route.pattern.exec(path);
      if (!found) continue;

      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(found[index + 1]);
      });
      return { handler: route.handler, params, status: route.status };
    }
    return null;
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large.');
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  // Credentials are sent, so the origin must be echoed rather than `*`.
  if (origin && (origin === env.origin || !env.isProduction)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  response.setHeader('Vary', 'Origin');
}

/** Below this, framing and CPU cost more than the bytes saved. */
const MIN_COMPRESS_BYTES = 1024;

function securityHeaders(response: ServerResponse): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  // This API only ever answers JSON, so nothing it returns should be treated
  // as a document with privileges.
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // Only meaningful over TLS, and actively unhelpful on a local http listener.
  if (env.isProduction) {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

async function send(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  payload: unknown,
  retryAfter?: number,
): Promise<void> {
  const json = payload === undefined ? '' : JSON.stringify(payload);
  const raw = Buffer.from(json, 'utf8');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (retryAfter !== undefined) headers['Retry-After'] = String(retryAfter);

  const accepted = String(request.headers['accept-encoding'] ?? '');
  let body = raw;

  if (raw.length >= MIN_COMPRESS_BYTES) {
    // A list page is mostly repeated JSON keys, so this is a large win: the
    // 80 kB default page compresses to a few kB.
    if (/\bbr\b/.test(accepted)) {
      body = await brotliAsync(raw);
      headers['Content-Encoding'] = 'br';
    } else if (/\bgzip\b/.test(accepted)) {
      body = await gzipAsync(raw);
      headers['Content-Encoding'] = 'gzip';
    }
  }

  headers['Content-Length'] = String(body.length);
  if (headers['Content-Encoding']) headers['Vary'] = 'Origin, Accept-Encoding';

  response.writeHead(status, headers);
  response.end(body);
}

function log(method: string, path: string, status: number, startedAt: number): void {
  const duration = Math.round(performance.now() - startedAt);

  // Structured in production so a log shipper can index it, human-readable in
  // development. Previously production logged nothing at all, which left no way
  // to see latency or error rate from a running instance.
  if (env.isProduction) {
    if (status < 400 && duration < env.slowRequestMs) return;
    console.log(
      JSON.stringify({
        level: status >= 500 ? 'error' : 'warn',
        msg: status >= 400 ? 'request failed' : 'slow request',
        method,
        path,
        status,
        duration_ms: duration,
        time: new Date().toISOString(),
      }),
    );
    return;
  }

  console.log(`  ${String(status).padEnd(3)} ${method.padEnd(6)} ${path}  ${duration}ms`);
}

/** Client address, honouring `X-Forwarded-For` only when TRUST_PROXY says to. */
export function clientIp(request: IncomingMessage): string {
  if (env.trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

export function createRequestListener(router: Router) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response);
    securityHeaders(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    const startedAt = performance.now();
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';

    try {
      const matched = router.match(request.method ?? 'GET', path);
      if (!matched) throw new HttpError(404, `No route for ${request.method} ${path}`);

      const ctx: Context = {
        method: request.method ?? 'GET',
        path,
        segments: path.split('/').filter(Boolean),
        query: url.searchParams,
        body: ['POST', 'PATCH', 'PUT'].includes(request.method ?? '')
          ? await readBody(request)
          : {},
        headers: request.headers,
        ip: clientIp(request),
      };

      const result = await matched.handler({ ...ctx, ...{ params: matched.params } } as Context);
      log(ctx.method, url.pathname + url.search, matched.status, startedAt);
      await send(request, response, matched.status, result);
    } catch (error) {
      if (error instanceof HttpError) {
        log(request.method ?? 'GET', url.pathname, error.status, startedAt);
        await send(
          request,
          response,
          error.status,
          {
            message: error.message,
            ...(error.errors ? { errors: error.errors } : {}),
          },
          error.retryAfter,
        );
        return;
      }

      log(request.method ?? 'GET', url.pathname, 500, startedAt);
      const message = error instanceof Error ? error.message : 'Internal server error.';
      console.error('[api]', error);
      await send(request, response, 500, {
        message: env.isProduction ? 'Internal server error.' : message,
      });
    }
  };
}

export function params(ctx: Context): Record<string, string> {
  return (ctx as Context & { params?: Record<string, string> }).params ?? {};
}
