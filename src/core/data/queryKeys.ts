import type { ID, ListParams } from './types';

export const queryKeys = {
  all: (resource: string) => [resource] as const,
  lists: (resource: string) => [resource, 'list'] as const,
  list: (resource: string, params: ListParams) => [resource, 'list', params] as const,
  details: (resource: string) => [resource, 'detail'] as const,
  detail: (resource: string, id: ID) => [resource, 'detail', String(id)] as const,
  options: (resource: string, term?: string) => [resource, 'options', term ?? ''] as const,
};
