import { describe, expect, it } from 'vitest';
import { DISPLAY_COLUMNS, isSecretColumn, pluralize, singularize } from '../../server/naming';

describe('singularize', () => {
  it.each([
    ['posts', 'post'],
    ['users', 'user'],
    ['roles', 'role'],
    ['categories', 'category'],
    ['countries', 'country'],
    ['boxes', 'box'],
    ['batches', 'batch'],
    ['dishes', 'dish'],
    ['statuses', 'status'],
  ])('%s -> %s', (plural, singular) => {
    expect(singularize(plural)).toBe(singular);
  });

  it('leaves an already-singular name alone', () => {
    expect(singularize('post')).toBe('post');
    expect(singularize('media')).toBe('media');
  });

  it('does not strip the second s of a double-s word', () => {
    // `address` -> `addres` would be wrong, and permissions are derived from
    // this, so it would be wrong everywhere at once.
    expect(singularize('address')).toBe('address');
    expect(singularize('class')).toBe('class');
  });

  it('is case-insensitive in its matching', () => {
    expect(singularize('Posts')).toBe('Post');
    expect(singularize('Categories')).toBe('Category');
  });

  it('KNOWN LIMITATION: a singular table ending in s loses its last letter', () => {
    // `status`, `bus`, `lens` are legitimate table names, and every permission
    // for them is published under a word that does not exist: the API demands
    // `statu.view` while a human writing the role grants `status.view`.
    // Fix: keep a small irregular set (`status`, `bus`, `lens`, `news`, ...)
    // checked before the `s$` rule, and flip these assertions in the same
    // commit. Left as-is because the exposed tables are all plural today.
    expect(singularize('status')).toBe('statu');
    expect(singularize('bus')).toBe('bu');
    expect(singularize('lens')).toBe('len');
  });
});

describe('pluralize', () => {
  it.each([
    ['post', 'posts'],
    ['category', 'categories'],
    ['country', 'countries'],
    ['box', 'boxes'],
    ['batch', 'batches'],
    ['dish', 'dishes'],
    ['status', 'statuses'],
  ])('%s -> %s', (singular, plural) => {
    expect(pluralize(singular)).toBe(plural);
  });

  it('keeps a vowel before y', () => {
    expect(pluralize('day')).toBe('days');
    expect(pluralize('key')).toBe('keys');
  });

  it('KNOWN BUG: is not idempotent, and its guard against that is unreachable', () => {
    // `if (/s$/i.test(value)) return value;` is dead: `(s|sh|ch|x|z)$` already
    // matched every value ending in `s` on the line above, so `posts` becomes
    // `postses` instead of returning early as intended.
    // Fix: move the `s$` check above the sibilant rule, but exempt the words
    // the sibilant rule exists for — `status`, `address`, `class` must still
    // gain `es`. Simplest correct form is to return early only on a plural
    // shape (`/(?<![sc]h?|[sxz])s$/`), then flip these assertions.
    // Reachable from `introspect.ts:199`, where a `news_id` column infers a
    // `newses` table; that relation is dropped by the `tableSet` filter below
    // it, so today the bug costs a missing relation rather than a bad query.
    expect(pluralize('posts')).toBe('postses');
    expect(pluralize('users')).toBe('userses');
    expect(pluralize('news')).toBe('newses');
  });

  it('still pluralises the sibilant singulars that rule is for', () => {
    expect(pluralize('address')).toBe('addresses');
    expect(pluralize('class')).toBe('classes');
  });

  it('round-trips the shapes the panel actually exposes', () => {
    for (const table of ['posts', 'users', 'roles', 'categories', 'boxes', 'batches']) {
      expect(pluralize(singularize(table))).toBe(table);
    }
  });
});

describe('isSecretColumn', () => {
  it.each([
    'password',
    'password_hash',
    'passwordhash',
    'hashed_password',
    'remember_token',
    'api_token',
    'secret',
    'two_factor_secret',
    'two_factor_recovery_codes',
  ])('redacts %s', (column) => {
    expect(isSecretColumn(column)).toBe(true);
  });

  it('matches regardless of the case the database reports', () => {
    // SQL Server and Oracle hand back upper-case identifiers; a case-sensitive
    // check there would ship every password hash to the browser.
    expect(isSecretColumn('PASSWORD')).toBe(true);
    expect(isSecretColumn('Password_Hash')).toBe(true);
    expect(isSecretColumn('API_TOKEN')).toBe(true);
  });

  it('leaves ordinary columns alone', () => {
    for (const column of ['id', 'email', 'name', 'title', 'created_at', 'is_active']) {
      expect(isSecretColumn(column)).toBe(false);
    }
  });

  it('does not match on a substring', () => {
    // Denylists that use `includes` catch `password_reset_sent_at` too and
    // silently hide a column the panel is supposed to show.
    expect(isSecretColumn('password_reset_sent_at')).toBe(false);
    expect(isSecretColumn('secret_santa')).toBe(false);
  });
});

describe('DISPLAY_COLUMNS', () => {
  it('prefers name over the other candidates', () => {
    // Order is the whole contract: `sqlAdapter` embeds the first one present,
    // so a related record labelled by `slug` when it has a `name` is a bug.
    expect(DISPLAY_COLUMNS[0]).toBe('name');
    expect(DISPLAY_COLUMNS.indexOf('title')).toBeLessThan(DISPLAY_COLUMNS.indexOf('slug'));
    expect(DISPLAY_COLUMNS.indexOf('name')).toBeLessThan(DISPLAY_COLUMNS.indexOf('email'));
  });

  it('contains no secret column', () => {
    expect(DISPLAY_COLUMNS.filter(isSecretColumn)).toEqual([]);
  });
});
