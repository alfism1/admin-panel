import { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios';

/**
 * `post_blocks` fixtures for `VITE_USE_MOCK=true`.
 *
 * The core mock backend only knows the three tables its own seed creates, and
 * it is a closed layer — so the demo's child table is served by wrapping the
 * adapter instead of editing it. Seam 2 is swappable by design; this is the
 * same trick `main.tsx` already plays to install the mock in the first place.
 */

const STORAGE_KEY = 'admin.mock-post-blocks.v1';
const RESOURCE = 'post_blocks';

type Row = Record<string, unknown>;

function seed(): Row[] {
  const now = new Date().toISOString();
  return Array.from({ length: 12 }, (_unused, index) => index + 1).flatMap((postId) => [
    {
      id: postId * 2 - 1,
      post_id: postId,
      kind: 'paragraph',
      heading: 'Why it matters',
      body: 'Declaring the shape once keeps the form, the table and the API in step.',
      position: 0,
      created_at: now,
      updated_at: now,
    },
    {
      id: postId * 2,
      post_id: postId,
      kind: 'quote',
      heading: '',
      body: 'Convention where it helps, configuration where it counts.',
      position: 1,
      created_at: now,
      updated_at: now,
    },
  ]);
}

function read(): Row[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Row[];
  } catch {
    // Corrupt payload: fall through to a fresh seed rather than dying at boot.
  }
  const rows = seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  return rows;
}

function write(rows: Row[]): Row[] {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  return rows;
}

function matches(row: Row, field: string, raw: string): boolean {
  return raw
    .split(',')
    .filter(Boolean)
    .some((candidate) => String(row[field]) === candidate);
}

function list(params: Record<string, string>): Row {
  let rows = read();

  for (const [key, value] of Object.entries(params)) {
    const filter = /^filter\[(.+)\]$/.exec(key);
    if (filter && value !== '') rows = rows.filter((row) => matches(row, filter[1], value));
  }

  const sort = params.sort ?? '';
  if (sort) {
    const field = sort.replace(/^-/, '');
    const direction = sort.startsWith('-') ? -1 : 1;
    rows = [...rows].sort((a, b) => (Number(a[field]) - Number(b[field])) * direction);
  }

  const page = Number(params.page) || 1;
  const perPage = Number(params.per_page) || 25;

  return {
    data: rows.slice((page - 1) * perPage, page * perPage),
    meta: {
      total: rows.length,
      page,
      per_page: perPage,
      last_page: Math.max(1, Math.ceil(rows.length / perPage)),
    },
  };
}

function nextId(rows: Row[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

function route(
  method: string,
  segments: string[],
  params: Record<string, string>,
  body: Row,
): { status: number; payload: Row } {
  const rows = read();

  if (method === 'get' && segments.length === 1) {
    return { status: 200, payload: list(params) };
  }

  if (method === 'post' && segments.length === 1) {
    const now = new Date().toISOString();
    const created: Row = { ...body, id: nextId(rows), created_at: now, updated_at: now };
    write([...rows, created]);
    return { status: 201, payload: { data: created } };
  }

  if ((method === 'patch' || method === 'put') && segments.length === 2) {
    const id = segments[1];
    const existing = rows.find((row) => String(row.id) === id);
    if (!existing) return { status: 404, payload: { message: 'Record not found.' } };

    const updated = { ...existing, ...body, updated_at: new Date().toISOString() };
    write(rows.map((row) => (String(row.id) === id ? updated : row)));
    return { status: 200, payload: { data: updated } };
  }

  if (method === 'delete' && segments.length === 2) {
    write(rows.filter((row) => String(row.id) !== segments[1]));
    return { status: 200, payload: { success: true } };
  }

  if (method === 'post' && segments[1] === 'bulk-delete') {
    const ids = new Set(((body.ids as unknown[]) ?? []).map(String));
    write(rows.filter((row) => !ids.has(String(row.id))));
    return { status: 200, payload: { success: true, deleted: ids.size } };
  }

  return {
    status: 404,
    payload: { message: `No mock route for ${method.toUpperCase()} /${segments.join('/')}` },
  };
}

function respond(
  config: Parameters<AxiosAdapter>[0],
  status: number,
  data: Row,
): AxiosResponse<Row> {
  return {
    data,
    status,
    statusText: status === 201 ? 'Created' : 'OK',
    headers: new AxiosHeaders(),
    config,
    request: null,
  };
}

function parseBody(data: unknown): Row {
  if (typeof data !== 'string') return (data as Row) ?? {};
  try {
    return JSON.parse(data) as Row;
  } catch {
    return {};
  }
}

/** Handles `/post_blocks*` and hands everything else to the adapter it wraps. */
export function withMockPostBlocks(base: AxiosAdapter): AxiosAdapter {
  return async (config) => {
    const segments = (config.url ?? '').replace(/^\/+/, '').split('/').filter(Boolean);
    if (segments[0] !== RESOURCE) return base(config);

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      (config.params ?? {}) as Record<string, string | number>,
    )) {
      params[key] = String(value);
    }

    const { status, payload } = route(
      (config.method ?? 'get').toLowerCase(),
      segments,
      params,
      parseBody(config.data),
    );

    const response = respond(config, status, payload);
    if (status >= 400) {
      throw new AxiosError(String(payload.message), String(status), config, null, response);
    }
    return response;
  };
}
