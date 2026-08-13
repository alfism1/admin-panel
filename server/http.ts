import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from './env';
import { HttpError } from './db/types';

export interface Context {
  method: string;
  path: string;
  segments: string[];
  query: URLSearchParams;
  body: Record<string, unknown>;
  headers: IncomingMessage['headers'];
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

function send(response: ServerResponse, status: number, payload: unknown): void {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(body);
}

function log(method: string, path: string, status: number, startedAt: number): void {
  if (env.isProduction) return;
  const duration = Math.round(performance.now() - startedAt);
  console.log(`  ${String(status).padEnd(3)} ${method.padEnd(6)} ${path}  ${duration}ms`);
}

export function createRequestListener(router: Router) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response);

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
      };

      const result = await matched.handler({ ...ctx, ...{ params: matched.params } } as Context);
      log(ctx.method, url.pathname + url.search, matched.status, startedAt);
      send(response, matched.status, result);
    } catch (error) {
      if (error instanceof HttpError) {
        log(request.method ?? 'GET', url.pathname, error.status, startedAt);
        send(response, error.status, {
          message: error.message,
          ...(error.errors ? { errors: error.errors } : {}),
        });
        return;
      }

      const message = error instanceof Error ? error.message : 'Internal server error.';
      console.error('[api]', error);
      send(response, 500, { message: env.isProduction ? 'Internal server error.' : message });
    }
  };
}

export function params(ctx: Context): Record<string, string> {
  return (ctx as Context & { params?: Record<string, string> }).params ?? {};
}
