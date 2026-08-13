import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError, type DatabaseAdapter, type Row } from './db/types';
import { env } from './env';
import { isSecretColumn } from './naming';

export interface AuthUser {
  id: string | number;
  name: string;
  email: string;
  avatar?: string | null;
  roles: string[];
  permissions: string[];
}

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
}

function sign(subject: string, type: TokenPayload['type']): string {
  return jwt.sign({ sub: subject, type } satisfies TokenPayload, env.jwt.secret, {
    expiresIn: type === 'access' ? env.jwt.accessTtl : env.jwt.refreshTtl,
  } as jwt.SignOptions);
}

function verify(token: string, type: TokenPayload['type']): string {
  try {
    const payload = jwt.verify(token, env.jwt.secret) as TokenPayload;
    if (payload.type !== type) throw new Error('wrong token type');
    return payload.sub;
  } catch {
    throw new HttpError(401, 'Session expired. Please sign in again.');
  }
}

function parsePermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Authentication reads whatever the database already has. If there is no users
 * table, a single account from ADMIN_EMAIL / ADMIN_PASSWORD is used instead, so
 * the panel boots against an arbitrary database without migrations.
 */
export function createAuth(db: DatabaseAdapter) {
  const { auth } = env;
  const hasUserTable = db.has(auth.table);
  const hasRoleTable = db.has(auth.roleTable);

  if (!hasUserTable && !auth.fallbackEmail) {
    console.warn(
      `  auth      no "${auth.table}" table found and ADMIN_EMAIL is unset — login is disabled.`,
    );
  }

  const allPermissions = () => ['*'];

  const toAuthUser = async (row: Row): Promise<AuthUser> => {
    const schema = db.schema(auth.table);
    let roles: string[] = [];
    let permissions: string[] = [];

    if (hasRoleTable && row[auth.roleForeignKey] != null) {
      const role = await db.find(auth.roleTable, String(row[auth.roleForeignKey]));
      if (role) {
        roles = [String(role[auth.roleNameColumn] ?? role.name ?? 'user')];
        permissions = parsePermissions(role[auth.permissionsColumn]);
      }
    }

    // A database with no role model still needs a usable panel.
    if (permissions.length === 0 && !hasRoleTable) permissions = allPermissions();

    const safe: Row = {};
    for (const [key, value] of Object.entries(row)) {
      if (!isSecretColumn(key)) safe[key] = value;
    }

    return {
      id: String(row[schema.primaryKey]),
      name: String(row[auth.nameColumn] ?? row[auth.emailColumn] ?? 'User'),
      email: String(row[auth.emailColumn] ?? ''),
      avatar: (safe.avatar as string | null) ?? null,
      roles,
      permissions,
    };
  };

  const fallbackUser = (): AuthUser => ({
    id: 'env-admin',
    name: 'Administrator',
    email: auth.fallbackEmail ?? 'admin@localhost',
    avatar: null,
    roles: ['admin'],
    permissions: ['*'],
  });

  const loadUser = async (id: string): Promise<AuthUser> => {
    if (!hasUserTable) {
      if (id !== 'env-admin') throw new HttpError(401, 'Unauthenticated.');
      return fallbackUser();
    }
    const row = await db.findBy(auth.table, db.schema(auth.table).primaryKey, id);
    if (!row) throw new HttpError(401, 'Unauthenticated.');
    return toAuthUser(row);
  };

  return {
    hasUserTable,

    async login(email: string, password: string) {
      if (!email || !password) {
        throw new HttpError(422, 'The given data was invalid.', {
          email: email ? [] : ['Email is required.'],
          password: password ? [] : ['Password is required.'],
        });
      }

      if (!hasUserTable) {
        if (!auth.fallbackEmail || !auth.fallbackPassword) {
          throw new HttpError(
            500,
            `No "${auth.table}" table found. Set AUTH_TABLE, or ADMIN_EMAIL and ADMIN_PASSWORD.`,
          );
        }
        if (email !== auth.fallbackEmail || password !== auth.fallbackPassword) {
          throw new HttpError(401, 'These credentials do not match our records.');
        }
        const user = fallbackUser();
        return {
          accessToken: sign('env-admin', 'access'),
          refreshToken: sign('env-admin', 'refresh'),
          user,
        };
      }

      const row = await db.findBy(auth.table, auth.emailColumn, email);
      if (!row) throw new HttpError(401, 'These credentials do not match our records.');

      const stored = String(row[auth.passwordColumn] ?? '');
      const isHashed = /^\$2[aby]\$/.test(stored);
      const valid = isHashed ? await bcrypt.compare(password, stored) : stored === password;
      if (!valid) throw new HttpError(401, 'These credentials do not match our records.');

      if (row.is_active === false || row.is_active === 0) {
        throw new HttpError(403, 'This account is disabled.');
      }

      const id = String(row[db.schema(auth.table).primaryKey]);
      return {
        accessToken: sign(id, 'access'),
        refreshToken: sign(id, 'refresh'),
        user: await toAuthUser(row),
      };
    },

    async me(header: string | undefined): Promise<AuthUser> {
      const token = header?.replace(/^Bearer\s+/i, '');
      if (!token) throw new HttpError(401, 'Unauthenticated.');
      return loadUser(verify(token, 'access'));
    },

    refresh(refreshToken: string | undefined) {
      if (!refreshToken) throw new HttpError(401, 'No refresh token provided.');
      const id = verify(refreshToken, 'refresh');
      return { accessToken: sign(id, 'access'), refreshToken: sign(id, 'refresh') };
    },

    /** Hashes an incoming plain password so writes never store one in the clear. */
    async hashPasswordIn(resource: string, data: Row): Promise<Row> {
      if (resource !== auth.table) return data;
      const value = data[auth.passwordColumn];
      if (typeof value !== 'string' || value === '') return data;
      if (/^\$2[aby]\$/.test(value)) return data;
      return { ...data, [auth.passwordColumn]: await bcrypt.hash(value, 10) };
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
