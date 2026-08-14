import { describe, expect, it } from 'vitest';
import { initials, labelize, pluralize, singularize } from '@/lib/labelize';

describe('labelize', () => {
  it.each([
    ['first_name', 'First Name'],
    ['firstName', 'First Name'],
    ['first-name', 'First Name'],
    ['title', 'Title'],
    ['created_at', 'Created At'],
  ])('turns %s into %s', (input, expected) => {
    expect(labelize(input)).toBe(expected);
  });

  it('labels a dotted path by its leaf', () => {
    expect(labelize('role.name')).toBe('Name');
    expect(labelize('author.profile.display_name')).toBe('Display Name');
  });

  it('drops a trailing _id, which is plumbing', () => {
    expect(labelize('user_id')).toBe('User');
    expect(labelize('author_id')).toBe('Author');
  });

  it('keeps a bare id, since dropping it would leave nothing', () => {
    expect(labelize('id')).toBe('ID');
  });

  it('upper-cases known acronyms', () => {
    expect(labelize('api_url')).toBe('API URL');
    expect(labelize('seo_html')).toBe('SEO HTML');
    expect(labelize('sku')).toBe('SKU');
  });

  it('splits digits from following capitals', () => {
    expect(labelize('address2Line')).toBe('Address2 Line');
  });

  it('collapses repeated separators', () => {
    expect(labelize('__first___name__')).toBe('First Name');
  });

  it('returns an empty string for an empty name', () => {
    expect(labelize('')).toBe('');
  });
});

describe('singularize', () => {
  it.each([
    ['users', 'user'],
    ['categories', 'category'],
    ['boxes', 'box'],
    ['dishes', 'dish'],
    ['batches', 'batch'],
    ['posts', 'post'],
  ])('turns %s into %s', (input, expected) => {
    expect(singularize(input)).toBe(expected);
  });

  it('leaves an already-singular word alone', () => {
    expect(singularize('user')).toBe('user');
  });

  it('does not strip the second s of a double-s word', () => {
    expect(singularize('address')).toBe('address');
  });
});

describe('pluralize', () => {
  it.each([
    ['user', 'users'],
    ['category', 'categories'],
    ['box', 'boxes'],
    ['dish', 'dishes'],
    ['batch', 'batches'],
  ])('turns %s into %s', (input, expected) => {
    expect(pluralize(input)).toBe(expected);
  });

  // The rule is a suffix table, not English: a doubled consonant is out of scope.
  it('appends -es after a sibilant without doubling it', () => {
    expect(pluralize('quiz')).toBe('quizes');
  });

  it('keeps a vowel before y', () => {
    expect(pluralize('day')).toBe('days');
    expect(pluralize('key')).toBe('keys');
  });

  /**
   * KNOWN BUG — pinned so a fix is a deliberate, visible change.
   *
   * `pluralize` reads as though an already-plural word passes through
   * untouched, but the `(s|sh|ch|x|z)$` branch matches every word ending in
   * `s` and returns first, leaving the `/s$/ -> return value` guard below it
   * unreachable. Resource names are plural by convention (`users`, `posts`),
   * so any resource that omits `labels` gets "Userses" in its sidebar and
   * page headings. Every resource in `src/resources/` sets `labels`
   * explicitly today, which is why nothing visibly breaks.
   *
   * Fix: reorder so the `/s$/` early-return runs before the sibilant branch.
   * Then flip these three assertions to `users` / `posts` / `boxes`.
   */
  it('does NOT round-trip an already-plural word (dead /s$/ branch)', () => {
    expect(pluralize('users')).toBe('userses');
    expect(pluralize('posts')).toBe('postses');
    expect(pluralize('boxes')).toBe('boxeses');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Grace Brewster Murray Hopper')).toBe('GB');
  });

  it('handles a single name', () => {
    expect(initials('Ada')).toBe('A');
  });

  it('ignores surrounding whitespace', () => {
    expect(initials('  ada  ')).toBe('A');
  });

  it('returns an empty string for an empty name', () => {
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });
});
