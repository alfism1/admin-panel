import type { AuthUser } from './auth';
import { HttpError, type DatabaseAdapter, type Row } from './db/types';
import { env } from './env';
import { granted, type Ability } from './permissions';
import { singularize } from './naming';

/**
 * Row-level ownership.
 *
 * `gate()` answers "may this caller update posts at all". It cannot answer "may
 * this caller update *this* post", so anyone holding `post.update` could edit
 * every row in the table. Where that is wrong, `OWNED_TABLES` names the column
 * that ties a row to a user:
 *
 *   OWNED_TABLES=posts:author_id,comments:user_id
 *
 * A caller then reaches only their own rows, unless they hold the escape hatch
 * `<singular>.<ability>.any` (or `*`). Opt-in on purpose: with no configuration
 * the behaviour is exactly what it was, because "owner" is a claim about the
 * application's domain that the schema alone cannot make.
 */
export function ownerColumn(resource: string): string | undefined {
  return env.ownedTables[resource];
}

/** True when the caller may act on rows belonging to somebody else. */
export function mayActOnAny(user: AuthUser, resource: string, ability: Ability): boolean {
  return granted(user.permissions, `${singularize(resource)}.${ability}.any`);
}

/**
 * The filter that narrows a list to the caller's own rows, or undefined when
 * ownership does not apply. Returned as a filter rather than applied directly
 * so it goes through the adapter's column validation like any other.
 */
export function ownershipFilter(
  user: AuthUser,
  resource: string,
  ability: Ability = 'view',
): Record<string, string> | undefined {
  const column = ownerColumn(resource);
  if (!column || mayActOnAny(user, resource, ability)) return undefined;
  return { [column]: String(user.id) };
}

/**
 * Refuses the request when the stored row belongs to somebody else.
 *
 * Deliberately reports 404 rather than 403: a caller who may not touch a row
 * should not be able to use the error to learn it exists.
 */
export async function assertOwned(
  db: DatabaseAdapter,
  user: AuthUser,
  resource: string,
  id: string,
  ability: Ability,
): Promise<void> {
  const column = ownerColumn(resource);
  if (!column || mayActOnAny(user, resource, ability)) return;

  const row = await db.find(resource, id);
  if (!row) throw new HttpError(404, 'Record not found.');
  if (String(row[column] ?? '') !== String(user.id)) {
    throw new HttpError(404, 'Record not found.');
  }
}

/**
 * Stamps the owner column on a create, and stops a caller reassigning it on any
 * write. Without this, ownership would be self-service.
 */
export function applyOwnership(user: AuthUser, resource: string, data: Row, ability: Ability): Row {
  const column = ownerColumn(resource);
  if (!column || mayActOnAny(user, resource, ability)) return data;

  if (ability === 'create') return { ...data, [column]: user.id };

  const { [column]: _ignored, ...rest } = data;
  return rest;
}
