import { Readable } from 'node:stream';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RequestInit {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  /** A string is sent verbatim; anything else is JSON-encoded. */
  body?: unknown;
  remoteAddress?: string | undefined;
}

export function makeRequest(init: RequestInit = {}): IncomingMessage {
  const { method = 'GET', url = '/', headers = {}, body } = init;
  const payload =
    body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];

  // Not a default parameter: a test that passes `remoteAddress: undefined` is
  // asking for a socket with no address, which a default would quietly undo.
  const remoteAddress = 'remoteAddress' in init ? init.remoteAddress : '127.0.0.1';

  const request = Readable.from(payload) as unknown as IncomingMessage;
  Object.assign(request, {
    method,
    url,
    headers: { host: 'localhost', ...headers },
    socket: { remoteAddress },
  });

  return request;
}

export interface Captured {
  status: number;
  headers: Record<string, string>;
  /** The response body, decompressed and JSON-parsed. */
  json: unknown;
  raw: Buffer;
}

export function makeResponse(): { response: ServerResponse; captured: () => Captured } {
  const headers: Record<string, string> = {};
  let status = 0;
  let raw = Buffer.alloc(0);

  const response = {
    setHeader(key: string, value: string | number) {
      headers[key.toLowerCase()] = String(value);
    },
    writeHead(code: number, more?: Record<string, string>) {
      status = code;
      for (const [key, value] of Object.entries(more ?? {})) headers[key.toLowerCase()] = value;
      return response;
    },
    end(body?: Buffer) {
      if (body) raw = body;
    },
  } as unknown as ServerResponse;

  return {
    response,
    captured: () => {
      const encoding = headers['content-encoding'];
      const decoded =
        encoding === 'br' ? brotliDecompressSync(raw) : encoding === 'gzip' ? gunzipSync(raw) : raw;
      const text = decoded.toString('utf8');

      return {
        status,
        headers,
        raw,
        json: text === '' ? undefined : (JSON.parse(text) as unknown),
      };
    },
  };
}
