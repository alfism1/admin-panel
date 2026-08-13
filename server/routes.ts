import type { Auth } from './auth';
import { permissionsFor } from './db/introspect';
import { HttpError, type DatabaseAdapter, type ListParams, type Row } from './db/types';
import { params, Router, type Context } from './http';

/** Turns `?page=&per_page=&sort=-created_at&search=&filter[x]=` into ListParams. */
function readListParams(query: URLSearchParams): ListParams {
  const sortParam = query.get('sort') ?? '';
  const filters: Record<string, string> = {};

  for (const [key, value] of query.entries()) {
    const match = /^filter\[(.+)\]$/.exec(key);
    if (match) filters[match[1]] = value;
  }

  return {
    page: Number(query.get('page')) || 1,
    perPage: Number(query.get('per_page')) || 25,
    search: query.get('search') ?? undefined,
    sort: sortParam
      ? {
          column: sortParam.replace(/^-/, ''),
          direction: sortParam.startsWith('-') ? 'desc' : 'asc',
        }
      : undefined,
    filters,
  };
}

function requireAuth(auth: Auth, ctx: Context) {
  return auth.me(ctx.headers.authorization);
}

export function createRouter(db: DatabaseAdapter, auth: Auth): Router {
  const router = new Router();

  // ------------------------------------------------------------------ health

  router.get('/', () => ({
    status: 'ok',
    dialect: db.dialect,
    resources: db.resources().map((schema) => schema.name),
  }));

  router.get('/_schema', async (ctx) => {
    await requireAuth(auth, ctx);
    return { data: db.resources() };
  });

  // -------------------------------------------------------------------- auth

  router.post('/auth/login', (ctx) =>
    auth.login(String(ctx.body.email ?? ''), String(ctx.body.password ?? '')),
  );

  router.get('/auth/me', (ctx) => auth.me(ctx.headers.authorization));

  router.post('/auth/refresh', (ctx) => auth.refresh(ctx.body.refreshToken as string | undefined));

  router.post('/auth/logout', () => ({ success: true }));

  // ------------------------------------------------------------------ meta

  router.get('/permissions', async (ctx) => {
    await requireAuth(auth, ctx);
    return { data: permissionsFor(db.resources()) };
  });

  router.get('/dashboard/stats', async (ctx) => {
    await requireAuth(auth, ctx);
    const names = db.resources().map((schema) => schema.name);

    const safeCount = async (resource: string, where?: Row) => {
      if (!names.includes(resource)) return 0;
      try {
        return await db.count(resource, where);
      } catch {
        return 0;
      }
    };

    return {
      data: {
        users: await safeCount('users'),
        activeUsers: await safeCount('users', { is_active: true }),
        posts: await safeCount('posts'),
        published: await safeCount('posts', { status: 'published' }),
        roles: await safeCount('roles'),
        views: 0,
        tables: names.length,
      },
    };
  });

  // ------------------------------------------------------------------- CRUD

  router.post('/:resource/bulk-delete', async (ctx) => {
    await requireAuth(auth, ctx);
    const { resource } = params(ctx);
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map(String) : [];
    return { success: true, deleted: await db.removeMany(resource, ids) };
  });

  router.get('/:resource', async (ctx) => {
    await requireAuth(auth, ctx);
    const { resource } = params(ctx);
    const listParams = readListParams(ctx.query);
    const { rows, total } = await db.list(resource, listParams);

    return {
      data: rows,
      meta: {
        total,
        page: listParams.page,
        per_page: listParams.perPage,
        last_page: Math.max(1, Math.ceil(total / listParams.perPage)),
      },
    };
  });

  router.get('/:resource/:id', async (ctx) => {
    await requireAuth(auth, ctx);
    const { resource, id } = params(ctx);
    const row = await db.find(resource, id);
    if (!row) throw new HttpError(404, 'Record not found.');
    return { data: row };
  });

  router.post(
    '/:resource',
    async (ctx) => {
      await requireAuth(auth, ctx);
      const { resource } = params(ctx);
      return { data: await db.insert(resource, await auth.hashPasswordIn(resource, ctx.body)) };
    },
    201,
  );

  const applyUpdate = async (ctx: Context) => {
    await requireAuth(auth, ctx);
    const { resource, id } = params(ctx);
    return { data: await db.update(resource, id, await auth.hashPasswordIn(resource, ctx.body)) };
  };

  router.patch('/:resource/:id', applyUpdate);
  router.put('/:resource/:id', applyUpdate);

  router.delete('/:resource/:id', async (ctx) => {
    await requireAuth(auth, ctx);
    const { resource, id } = params(ctx);
    await db.remove(resource, id);
    return { success: true };
  });

  return router;
}
