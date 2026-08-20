import type { NavigateFunction } from 'react-router';
import { getDataProvider } from '@/core/data/DataProvider';
import type { RecordShape } from '@/core/data/types';
import type { Resource } from '@/core/resources/types';
import { Action, type ActionConfig } from './Action';
import type { ReplicateOptions } from './types';

/** Row identity never survives a copy, whatever else the caller excludes. */
export const REPLICA_OMITTED = ['id', 'created_at', 'updated_at'];

const DEFAULTS: ReplicateOptions = { exclude: [], redirect: false };

function patch(config: ActionConfig, options: Partial<ReplicateOptions>): Partial<ActionConfig> {
  return { replicate: { ...DEFAULTS, ...config.replicate, ...options } };
}

export function buildReplica(source: RecordShape, exclude: readonly string[]): RecordShape {
  const dropped = new Set([...REPLICA_OMITTED, ...exclude]);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !dropped.has(key)));
}

/**
 * Duplicates a record through the data provider. Label, permission and success
 * message come from the surrounding resource, so `make()` takes no arguments.
 */
export class ReplicateAction extends Action {
  static make(): ReplicateAction {
    return new ReplicateAction({
      name: 'replicate',
      builtin: 'replicate',
      icon: 'copy',
      color: 'gray',
      iconOnly: true,
      tooltip: 'Duplicate',
      replicate: DEFAULTS,
    });
  }

  /** Columns the copy should not carry over, on top of the id and timestamps. */
  exclude(...columns: string[]): this {
    const { exclude } = { ...DEFAULTS, ...this.config.replicate };
    return this.mutate(patch(this.config, { exclude: [...exclude, ...columns] }));
  }

  /** Rewrites the copy before it is created — unique slugs, `(copy)` titles. */
  beforeReplicaSaved(mutator: NonNullable<ReplicateOptions['mutate']>): this {
    return this.mutate(patch(this.config, { mutate: mutator }));
  }

  /** Opens the copy once it exists. Ignored when several records are copied. */
  redirectTo(target: ReplicateOptions['redirect']): this {
    return this.mutate(patch(this.config, { redirect: target }));
  }
}

/**
 * Copies every selected record. It extends `ReplicateAction` rather than
 * `BulkAction` so the three option builders are shared; `BulkAction` itself
 * contributes only the defaults `make()` sets here anyway.
 */
export class ReplicateBulkAction extends ReplicateAction {
  static make(): ReplicateBulkAction {
    return new ReplicateBulkAction({
      name: 'replicateSelected',
      builtin: 'replicateBulk',
      label: 'Duplicate selected',
      icon: 'copy',
      color: 'secondary',
      size: 'sm',
      confirmation: {},
      replicate: DEFAULTS,
    });
  }
}

/**
 * The rows in hand come from the list, which carries only the columns on
 * screen, so each copy is made from a freshly read record. Sequential on
 * purpose: a selection of a hundred rows should not open a hundred requests.
 */
export async function runReplicate(
  resource: Resource,
  sources: RecordShape[],
  options: ReplicateOptions | undefined,
  navigate: NavigateFunction,
): Promise<void> {
  const provider = getDataProvider(resource.dataProvider);
  const { exclude, mutate, redirect } = { ...DEFAULTS, ...options };
  let created: RecordShape | undefined;

  for (const source of sources) {
    const full = await provider.getOne(resource.name, String(source.id));
    const replica = buildReplica(full, exclude);
    created = await provider.create(resource.name, mutate ? await mutate(replica, full) : replica);
  }

  if (redirect && created && sources.length === 1) navigate(resource.routes[redirect](created));
}
