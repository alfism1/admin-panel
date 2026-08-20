import type { AuthUser } from './auth';
import { HttpError } from './db/types';
import { singularize } from './naming';

/** The four actions `permissionsFor` publishes for every exposed table. */
export type Ability = 'view' | 'create' | 'update' | 'delete';

/**
 * Same matching rules as the client checker in `src/core/auth/can.ts`: `*`
 * grants everything and `user.*` grants every `user.` action. The two are
 * deliberately separate implementations — the client one is UX, this one is the
 * boundary — but they must agree, or the UI offers buttons the API refuses.
 */
export function granted(permissions: string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;

  const segments = required.split('.');
  for (let i = segments.length - 1; i > 0; i -= 1) {
    if (permissions.includes(`${segments.slice(0, i).join('.')}.*`)) return true;
  }
  return false;
}

/** `posts` + `update` -> `post.update`. */
export function permissionFor(resource: string, ability: Ability): string {
  return `${singularize(resource)}.${ability}`;
}

/**
 * The authorization gate every data route passes through.
 *
 * Until this existed the API only proved *who* a caller was, never *what* they
 * could touch, so any account with a valid token could delete any exposed
 * table. Hiding the button in the UI was never a boundary.
 */
export function authorize(user: AuthUser, resource: string, ability: Ability): void {
  const required = permissionFor(resource, ability);
  if (granted(user.permissions, required)) return;

  throw new HttpError(403, `This action is unauthorized. Missing permission "${required}".`);
}
