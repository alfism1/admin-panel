import { getPath } from '@/lib/utils';
import { labelize, pluralize, singularize } from '@/lib/labelize';
import type { Resource, ResourceDefinition } from './types';

/**
 * Fills in every convention-based default so pages, routes, navigation and
 * actions can rely on a complete object.
 */
export function defineResource(definition: ResourceDefinition): Resource {
  const route = definition.route ?? `/${definition.name}`;
  const singular = definition.labels?.singular ?? labelize(singularize(definition.name));
  const plural = definition.labels?.plural ?? labelize(pluralize(definition.name));
  const recordTitleKey = definition.recordTitleKey ?? 'name';

  const pages = {
    list: definition.pages?.list ?? true,
    create: definition.pages?.create ?? true,
    edit: definition.pages?.edit ?? true,
    view: definition.pages?.view ?? true,
  };

  return {
    ...definition,
    route,
    labels: { singular, plural },
    recordTitleKey,
    permissions: definition.permissions ?? {},
    pages,
    navigation: definition.navigation ?? { label: plural },
    routes: {
      list: route,
      create: `${route}/create`,
      view: (record) => `${route}/${String(record.id)}`,
      edit: (record) => `${route}/${String(record.id)}/edit`,
    },
    recordTitle: (record) => {
      if (!record) return singular;
      const title = getPath(record, recordTitleKey);
      return title ? String(title) : `${singular} #${String(record.id ?? '')}`;
    },
  };
}
