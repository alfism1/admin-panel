import type { RecordShape } from '@/core/data/types';
import type { Resource } from '@/core/resources/types';
import type { ActionConfig } from './Action';
import type { ActionContext } from './types';

export interface ResolvedAction {
  label: string;
  permission?: string;
  href?: string;
  confirmation: ActionConfig['confirmation'];
  run?: (ctx: ActionContext) => void | Promise<void>;
  successMessage?: string | false;
}

/**
 * Fills a built-in action's blanks from the resource it is rendered inside, so
 * `EditAction.make()` knows its route, label and permission without arguments.
 */
export function resolveBuiltin(
  config: ActionConfig,
  resource: Resource | undefined,
  record: RecordShape | null,
): Partial<ResolvedAction> {
  if (!config.builtin || !resource) return {};

  const { permissions, routes, labels } = resource;

  switch (config.builtin) {
    case 'view':
      return {
        label: 'View',
        permission: permissions.view,
        href: record ? routes.view(record) : undefined,
      };

    case 'edit':
      return {
        label: 'Edit',
        permission: permissions.update,
        href: record ? routes.edit(record) : undefined,
      };

    case 'create':
      return {
        label: `New ${labels.singular.toLowerCase()}`,
        permission: permissions.create,
        href: routes.create,
      };

    case 'delete':
      return {
        label: 'Delete',
        permission: permissions.delete,
        confirmation: {
          heading: `Delete this ${labels.singular.toLowerCase()}?`,
          description: `"${resource.recordTitle(record)}" will be permanently removed. This cannot be undone.`,
          confirmLabel: 'Delete',
          ...(config.confirmation || {}),
        },
        successMessage: `${labels.singular} deleted.`,
      };

    case 'deleteBulk':
      return {
        label: 'Delete selected',
        permission: permissions.delete,
        confirmation: {
          heading: `Delete the selected ${labels.plural.toLowerCase()}?`,
          description: 'This cannot be undone.',
          confirmLabel: 'Delete',
          ...(config.confirmation || {}),
        },
        successMessage: `${labels.plural} deleted.`,
      };

    // A copy is reversible, so this one only generates confirmation copy when
    // the caller asked for a confirmation at all.
    case 'replicate':
      return {
        label: 'Duplicate',
        permission: permissions.create,
        ...(config.confirmation
          ? {
              confirmation: {
                heading: `Duplicate this ${labels.singular.toLowerCase()}?`,
                description: `A copy of "${resource.recordTitle(record)}" will be created.`,
                confirmLabel: 'Duplicate',
                ...config.confirmation,
              },
            }
          : {}),
        successMessage: `${labels.singular} duplicated.`,
      };

    case 'replicateBulk':
      return {
        label: 'Duplicate selected',
        permission: permissions.create,
        confirmation: {
          heading: `Duplicate the selected ${labels.plural.toLowerCase()}?`,
          description: `One copy is created for each selected ${labels.singular.toLowerCase()}.`,
          confirmLabel: 'Duplicate',
          ...(config.confirmation || {}),
        },
        successMessage: `${labels.plural} duplicated.`,
      };

    // Reading rows the caller already has on screen, so `viewAny` is the gate.
    case 'exportBulk':
      return {
        label: 'Export selected',
        permission: permissions.viewAny,
        successMessage: `${labels.plural} exported.`,
      };

    default:
      return {};
  }
}
