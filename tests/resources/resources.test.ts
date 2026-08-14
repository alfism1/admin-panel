import { describe, expect, it } from 'vitest';
import { collectFields } from '@/core/forms/formState';
import { Layout } from '@/core/forms/layouts/Layout';
import { Field } from '@/core/forms/Field';
import { Column } from '@/core/tables/Column';
import { Filter } from '@/core/tables/filters/Filter';
import { Action } from '@/core/actions/Action';
import { allResources } from '@/core/resources/registry';
import { resources } from '@/resources';
import type { Resource } from '@/core/resources/types';

/**
 * Contract tests over the resources this app actually ships. They catch the
 * mistakes the type checker cannot: a duplicated field name, a filter that
 * points at nothing, a column sorted by a key the table never fetches.
 */

describe('registration', () => {
  it('registers every resource exactly once', () => {
    expect(allResources()).toEqual(resources);
  });

  it('registers the four expected resources', () => {
    expect(resources.map((resource) => resource.name).sort()).toEqual([
      'posts',
      'products',
      'roles',
      'users',
    ]);
  });

  it('gives every resource a unique name and route', () => {
    const names = resources.map((resource) => resource.name);
    const routes = resources.map((resource) => resource.route);

    expect(new Set(names).size).toBe(names.length);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

describe.each(resources.map((resource) => [resource.name, resource] as const))(
  '%s resource',
  (_name, resource: Resource) => {
    it('has both labels filled in', () => {
      expect(resource.labels.singular).toBeTruthy();
      expect(resource.labels.plural).toBeTruthy();
    });

    it('has a route starting with a slash', () => {
      expect(resource.route).toMatch(/^\//);
    });

    it('derives its CRUD routes from the base route', () => {
      expect(resource.routes.list).toBe(resource.route);
      expect(resource.routes.create).toBe(`${resource.route}/create`);
      expect(resource.routes.view({ id: 1 })).toBe(`${resource.route}/1`);
      expect(resource.routes.edit({ id: 1 })).toBe(`${resource.route}/1/edit`);
    });

    it('declares at least one column', () => {
      expect(resource.table.columns.length).toBeGreaterThan(0);
    });

    it('builds only Column instances', () => {
      for (const column of resource.table.columns) {
        expect(column).toBeInstanceOf(Column);
      }
    });

    it('gives every column a distinct name', () => {
      const names = resource.table.columns.map((column) => column.name);
      expect(new Set(names).size).toBe(names.length);
    });

    // A blank header is deliberate on avatar/cover columns, so only columns that
    // never set one explicitly are required to resolve to something readable.
    it('derives a readable label for every column that does not set one', () => {
      for (const column of resource.table.columns) {
        if (column.definition.label !== undefined) continue;
        expect(column.resolveLabel(), `column "${column.name}"`).not.toBe('');
      }
    });

    it('builds only Filter instances, each with a distinct name', () => {
      const filters = resource.table.filters ?? [];
      for (const filter of filters) {
        expect(filter).toBeInstanceOf(Filter);
      }
      expect(new Set(filters.map((filter) => filter.name)).size).toBe(filters.length);
    });

    it('builds only Action instances', () => {
      const actions = [
        ...(resource.table.actions ?? []),
        ...(resource.table.bulkActions ?? []),
        ...(resource.table.headerActions ?? []),
      ];
      for (const action of actions) {
        expect(action).toBeInstanceOf(Action);
      }
    });

    it('names its row actions distinctly', () => {
      const names = (resource.table.actions ?? []).map((action) => action.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('sorts by a column the table declares, when a default sort is set', () => {
      const sort = resource.table.defaultSort;
      if (!sort) return;

      const sortable = resource.table.columns.map(
        (column) => column.definition.sortColumn ?? column.name,
      );
      expect(sortable).toContain(sort.column);
    });

    it('offers a perPage default that is one of the options', () => {
      const { defaultPerPage, perPageOptions } = resource.table;
      if (defaultPerPage === undefined || !perPageOptions) return;

      expect(perPageOptions).toContain(defaultPerPage);
    });

    it('builds a form of Fields and Layouts only', () => {
      for (const component of resource.form ?? []) {
        expect(component instanceof Field || component instanceof Layout).toBe(true);
      }
    });

    it('gives every form field a distinct name', () => {
      const names = collectFields(resource.form ?? []).map((field) => field.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('resolves a label for every form field', () => {
      for (const field of collectFields(resource.form ?? [])) {
        expect(field.name).not.toBe('');
      }
    });

    it('titles a record, falling back when the title key is missing', () => {
      expect(resource.recordTitle({ id: 1 })).toContain('#1');
      expect(resource.recordTitle(null)).toBe(resource.labels.singular);
    });

    it('declares a permission for every enabled page, or none at all', () => {
      const { permissions, pages } = resource;
      if (Object.keys(permissions).length === 0) return;

      if (pages.list) expect(permissions.viewAny).toBeTruthy();
      if (pages.create) expect(permissions.create).toBeTruthy();
      if (pages.edit) expect(permissions.update).toBeTruthy();
      if (pages.view) expect(permissions.view).toBeTruthy();
    });
  },
);
