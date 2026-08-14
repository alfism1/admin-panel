import { describe, expect, it } from 'vitest';
import { defineResource } from '@/core/resources/Resource';
import { TextColumn } from '@/core/tables/columns/TextColumn';

const table = { columns: [TextColumn.make('name')] };

describe('defineResource defaults', () => {
  it('derives the route from the name', () => {
    expect(defineResource({ name: 'users', table }).route).toBe('/users');
  });

  it('keeps an explicit route', () => {
    expect(defineResource({ name: 'users', route: '/admin/people', table }).route).toBe(
      '/admin/people',
    );
  });

  it('derives the singular label from the name', () => {
    expect(defineResource({ name: 'users', table }).labels.singular).toBe('User');
    expect(defineResource({ name: 'categories', table }).labels.singular).toBe('Category');
  });

  it('derives a plural label from an already-singular name', () => {
    expect(defineResource({ name: 'product', table }).labels.plural).toBe('Products');
  });

  /** See the `pluralize` note in tests/lib/labelize.test.ts — pinned, not endorsed. */
  it('KNOWN BUG: double-pluralises a conventionally plural resource name', () => {
    expect(defineResource({ name: 'users', table }).labels.plural).toBe('Userses');
    expect(defineResource({ name: 'categories', table }).labels.plural).toBe('Categorieses');
  });

  it('respects explicit labels', () => {
    const resource = defineResource({
      name: 'posts',
      labels: { singular: 'Article', plural: 'Articles' },
      table,
    });
    expect(resource.labels).toEqual({ singular: 'Article', plural: 'Articles' });
  });

  it('fills only the missing half of a partial label pair', () => {
    const resource = defineResource({ name: 'post', labels: { singular: 'Article' }, table });
    expect(resource.labels).toEqual({ singular: 'Article', plural: 'Posts' });
  });

  it('defaults the record title key to name', () => {
    expect(defineResource({ name: 'users', table }).recordTitleKey).toBe('name');
  });

  it('enables all four pages by default', () => {
    expect(defineResource({ name: 'users', table }).pages).toEqual({
      list: true,
      create: true,
      edit: true,
      view: true,
    });
  });

  it('keeps an explicitly disabled page disabled and defaults the rest on', () => {
    const resource = defineResource({ name: 'users', pages: { create: false }, table });
    expect(resource.pages).toEqual({ list: true, create: false, edit: true, view: true });
  });

  it('defaults navigation to the plural label', () => {
    expect(defineResource({ name: 'product', table }).navigation).toEqual({ label: 'Products' });
  });

  it('preserves navigation: false', () => {
    expect(defineResource({ name: 'users', navigation: false, table }).navigation).toBe(false);
  });

  it('defaults permissions to an empty object rather than undefined', () => {
    expect(defineResource({ name: 'users', table }).permissions).toEqual({});
  });
});

describe('resource routes', () => {
  const resource = defineResource({ name: 'users', table });

  it('builds the list and create routes', () => {
    expect(resource.routes.list).toBe('/users');
    expect(resource.routes.create).toBe('/users/create');
  });

  it('builds record routes from the id', () => {
    expect(resource.routes.view({ id: 7 })).toBe('/users/7');
    expect(resource.routes.edit({ id: 7 })).toBe('/users/7/edit');
  });

  it('builds record routes from a string id', () => {
    expect(resource.routes.view({ id: 'abc-123' })).toBe('/users/abc-123');
  });

  it('honours a custom base route', () => {
    const custom = defineResource({ name: 'users', route: '/admin/people', table });
    expect(custom.routes.edit({ id: 3 })).toBe('/admin/people/3/edit');
  });
});

describe('recordTitle', () => {
  it('reads the configured title key', () => {
    const resource = defineResource({ name: 'users', table });
    expect(resource.recordTitle({ id: 1, name: 'Ada' })).toBe('Ada');
  });

  it('reads a dotted title key', () => {
    const resource = defineResource({ name: 'posts', recordTitleKey: 'meta.title', table });
    expect(resource.recordTitle({ id: 1, meta: { title: 'Hello' } })).toBe('Hello');
  });

  it('falls back to "Singular #id" when the title is missing', () => {
    const resource = defineResource({ name: 'users', table });
    expect(resource.recordTitle({ id: 9 })).toBe('User #9');
  });

  it('falls back to "Singular #" when the record has neither title nor id', () => {
    const resource = defineResource({ name: 'users', table });
    expect(resource.recordTitle({})).toBe('User #');
  });

  it('returns the singular label for a null record', () => {
    const resource = defineResource({ name: 'users', table });
    expect(resource.recordTitle(null)).toBe('User');
  });

  it('stringifies a non-string title', () => {
    const resource = defineResource({ name: 'users', recordTitleKey: 'code', table });
    expect(resource.recordTitle({ id: 1, code: 42 })).toBe('42');
  });
});
