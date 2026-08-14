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
   * Resource names are plural by convention (`users`, `posts`), and a resource
   * that omits `labels` derives its plural from the name — so an already-plural
   * word has to survive the round trip untouched.
   */
  it('round-trips an already-plural word', () => {
    expect(pluralize('users')).toBe('users');
    expect(pluralize('posts')).toBe('posts');
    expect(pluralize('boxes')).toBe('boxes');
  });

  it('still appends -es to a singular sibilant', () => {
    expect(pluralize('box')).toBe('boxes');
    expect(pluralize('dish')).toBe('dishes');
    expect(pluralize('batch')).toBe('batches');
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
