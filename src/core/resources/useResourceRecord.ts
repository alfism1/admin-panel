import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataProvider } from '@/core/data/DataProvider';
import { queryKeys } from '@/core/data/queryKeys';
import type { RecordShape } from '@/core/data/types';
import type { FormValues } from '@/core/forms/types';
import type { Resource } from './types';

export function useResourceRecord(resource: Resource, id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.detail(resource.name, id ?? ''),
    enabled: Boolean(id),
    queryFn: () => getDataProvider(resource.dataProvider).getOne<RecordShape>(resource.name, id!),
  });
}

/** Create/update with precise invalidation — never a blanket `invalidateQueries()`. */
export function useResourceMutation(resource: Resource, id?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: FormValues) => {
      const provider = getDataProvider(resource.dataProvider);
      return id
        ? provider.update<RecordShape>(resource.name, id, values)
        : provider.create<RecordShape>(resource.name, values);
    },
    onSuccess: (record) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists(resource.name) });
      if (record?.id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.detail(resource.name, String(record.id)),
        });
      }
    },
  });
}
