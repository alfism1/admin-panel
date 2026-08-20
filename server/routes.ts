import type { Auth, AuthUser } from './auth';
import { permissionsFor } from './db/introspect';
import { HttpError, type DatabaseAdapter, type ListParams, type Row } from './db/types';
import { env } from './env';
import { params, Router, type Context } from './http';
import { singularize } from './naming';
import { applyOwnership, assertOwned, ownershipFilter } from './ownership';
import { authorize, granted, type Ability } from './permissions';
import { createRateLimiter } from './rateLimit';

/** Turns `?page=&per_page=&sort=-created_at&search=&filter[x]=` into ListParams. */
function readListParams(query: URLSearchParams): ListParams {
  const sortParam = query.get('sort') ?? '';
  const filters: Record<string, string> = {};

  for (const [key, value] of query.entries()) {
    const match = /^filter\[(.+)\]$/.exec(key);
    if (match) filters[match[1]] = value;
  }

  const cursor = query.get('cursor');

  return {
    page: Number(query.get('page')) || 1,
    perPage: Number(query.get('per_page')) || 25,
    search: query.get('search') ?? undefined,
    ...(cursor ? { cursor } : {}),
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

  const loginLimiter = createRateLimiter({
    ...env.rateLimit.login,
    message: 'Too many sign-in attempts. Please try again later.',
  });
  const apiLimiter = createRateLimiter(env.rateLimit.api);

  const throttleLogin = async (ctx: Context, email: string): Promise<void> => {
    if (!env.rateLimit.enabled) return;
    // Keyed on both, so one attacker cannot lock out a real account by
    // hammering its address, and cannot dodge the limit by cycling addresses.
    await loginLimiter.hit(`ip:${ctx.ip}`);
    await loginLimiter.hit(`user:${email.toLowerCase()}`);
  };

  /**
   * Authenticate, then check the caller may perform `ability` on `resource`.
   * Both halves matter: before this, a valid token was enough to reach every
   * exposed table, and the client-side `<Can>` gate was the only thing hiding
   * the buttons.
   */
  const gate = async (ctx: Context, resource: string, ability: Ability): Promise<AuthUser> => {
    if (env.rateLimit.enabled) await apiLimiter.hit(`ip:${ctx.ip}`);
    const user = await requireAuth(auth, ctx);
    authorize(user, resource, ability);
    return user;
  };

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

  router.post('/auth/login', async (ctx) => {
    const email = String(ctx.body.email ?? '');
    await throttleLogin(ctx, email);

    const result = await auth.login(email, String(ctx.body.password ?? ''));

    // A correct password clears the budget, so a user who fat-fingered twice is
    // not still throttled once they get it right.
    await Promise.all([
      loginLimiter.reset(`ip:${ctx.ip}`),
      loginLimiter.reset(`user:${email.toLowerCase()}`),
    ]);
    return result;
  });

  router.get('/auth/me', (ctx) => auth.me(ctx.headers.authorization));

  router.post('/auth/refresh', async (ctx) => {
    // Refresh mints access tokens, so it needs its own budget or it becomes the
    // unthrottled way back in.
    if (env.rateLimit.enabled) await loginLimiter.hit(`refresh:${ctx.ip}`);
    return auth.refresh(ctx.body.refreshToken as string | undefined);
  });

  router.post('/auth/logout', () => ({ success: true }));

  // ------------------------------------------------------------------ meta

  router.get('/permissions', async (ctx) => {
    await requireAuth(auth, ctx);
    return { data: permissionsFor(db.resources()) };
  });

  router.get('/dashboard/stats', async (ctx) => {
    const user = await requireAuth(auth, ctx);
    const names = db.resources().map((schema) => schema.name);

    const safeCount = async (resource: string, where?: Row) => {
      // A dashboard tile must not report a count of something the caller is not
      // allowed to look at.
      if (!names.includes(resource)) return 0;
      if (!granted(user.permissions, `${singularize(resource)}.view`)) return 0;
      try {
        return await db.count(resource, where);
      } catch {
        return 0;
      }
    };

    // Independent counts, so they go out together instead of queueing.
    const [users, activeUsers, posts, published, roles] = await Promise.all([
      safeCount('users'),
      safeCount('users', { is_active: true }),
      safeCount('posts'),
      safeCount('posts', { status: 'published' }),
      safeCount('roles'),
    ]);

    return {
      data: { users, activeUsers, posts, published, roles, views: 0, tables: names.length },
    };
  });

  // ------------------------------------------------------------------- CRUD

  router.post('/:resource/bulk-delete', async (ctx) => {
    const { resource } = params(ctx);
    const user = await gate(ctx, resource, 'delete');
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map(String) : [];

    // Checked one by one rather than filtered in bulk: a caller must not be
    // able to learn which of a list of ids exist by comparing the deleted count.
    for (const id of ids) await assertOwned(db, user, resource, id, 'delete');

    return { success: true, deleted: await db.removeMany(resource, ids) };
  });

  router.get('/:resource', async (ctx) => {
    const { resource } = params(ctx);
    const user = await gate(ctx, resource, 'view');
    const listParams = readListParams(ctx.query);

    // Merged last so a caller cannot widen it with their own `filter[...]`.
    const scope = ownershipFilter(user, resource, 'view');
    if (scope) listParams.filters = { ...listParams.filters, ...scope };

    const { rows, total, approximate, nextCursor } = await db.list(resource, listParams);

    return {
      data: rows,
      meta: {
        total,
        page: listParams.page,
        per_page: listParams.perPage,
        last_page: Math.max(1, Math.ceil(total / listParams.perPage)),
        ...(approximate ? { approximate: true } : {}),
        // Follow this instead of `?page=N` to page past the point where the
        // offset itself is the expensive part.
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      },
    };
  });

  router.get('/:resource/:id', async (ctx) => {
    const { resource, id } = params(ctx);
    const user = await gate(ctx, resource, 'view');
    await assertOwned(db, user, resource, id, 'view');
    const row = await db.find(resource, id);
    if (!row) throw new HttpError(404, 'Record not found.');
    return { data: row };
  });

  router.post(
    '/:resource',
    async (ctx) => {
      const { resource } = params(ctx);
      const user = await gate(ctx, resource, 'create');
      const body = applyOwnership(user, resource, ctx.body, 'create');
      return { data: await db.insert(resource, await auth.hashPasswordIn(resource, body)) };
    },
    201,
  );

  const applyUpdate = async (ctx: Context) => {
    const { resource, id } = params(ctx);
    const user = await gate(ctx, resource, 'update');
    await assertOwned(db, user, resource, id, 'update');
    const body = applyOwnership(user, resource, ctx.body, 'update');
    return { data: await db.update(resource, id, await auth.hashPasswordIn(resource, body)) };
  };

  router.patch('/:resource/:id', applyUpdate);
  router.put('/:resource/:id', applyUpdate);

  router.delete('/:resource/:id', async (ctx) => {
    const { resource, id } = params(ctx);
    const user = await gate(ctx, resource, 'delete');
    await assertOwned(db, user, resource, id, 'delete');
    await db.remove(resource, id);
    return { success: true };
  });

  return router;
}
