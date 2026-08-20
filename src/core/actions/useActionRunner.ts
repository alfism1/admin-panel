import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useNavigate } from 'react-router';
import { getDataProvider } from '@/core/data/DataProvider';
import { normalizeError } from '@/core/data/errors';
import { queryKeys } from '@/core/data/queryKeys';
import type { RecordShape } from '@/core/data/types';
import type { FormValues } from '@/core/forms/types';
import { useResourceContext } from '@/core/resources/ResourceContext';
import { notify } from '@/core/ui/notify';
import type { Action } from './Action';
import { runExport } from './ExportBulkAction';
import { runReplicate } from './ReplicateAction';
import { resolveBuiltin } from './resolveAction';
import type { ActionContext } from './types';

export interface RunPayload {
  record: RecordShape | null;
  records: RecordShape[];
  data: FormValues;
  onDone?: () => void;
}

/**
 * Executes an action: built-in delete goes through the data provider, custom
 * actions call their handler. Success/failure notifications and cache
 * invalidation happen here so no action has to repeat them.
 */
export function useActionRunner(action: Action) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const resourceContext = useResourceContext();
  const resource = resourceContext?.resource;
  const config = action.definition;

  const refresh = React.useCallback(() => {
    if (!resource) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.lists(resource.name) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.details(resource.name) });
  }, [queryClient, resource]);

  const mutation = useMutation({
    mutationFn: async ({ record, records, data, onDone }: RunPayload) => {
      const ctx: ActionContext = {
        record,
        records,
        data,
        refresh,
        close: () => onDone?.(),
        notify: notify.show,
        navigate,
      };

      if (config.builtin === 'delete' && resource && record) {
        await getDataProvider(resource.dataProvider).delete(resource.name, String(record.id));
      } else if (config.builtin === 'deleteBulk' && resource) {
        await getDataProvider(resource.dataProvider).deleteMany(
          resource.name,
          records.map((item) => String(item.id)),
        );
      } else if (
        (config.builtin === 'replicate' || config.builtin === 'replicateBulk') &&
        resource
      ) {
        await runReplicate(resource, record ? [record] : records, config.replicate, navigate);
      } else if (config.builtin === 'exportBulk' && resource) {
        runExport(resource, record ? [record] : records, config.export);
      }

      await config.handler?.(ctx);
      return ctx;
    },

    onSuccess: (_result, variables) => {
      const builtin = resolveBuiltin(config, resource, variables.record);
      const message =
        config.successNotification ??
        builtin.successMessage ??
        `${action.resolveLabel(variables.record)} completed.`;
      if (message !== false) notify.success(message);
      refresh();
      variables.onDone?.();
    },

    onError: (error) => {
      if (config.failureNotification === false) return;
      const normalized = normalizeError(error);
      notify.error(config.failureNotification ?? normalized.message);
    },
  });

  return { run: mutation.mutateAsync, isRunning: mutation.isPending, refresh, resource };
}
