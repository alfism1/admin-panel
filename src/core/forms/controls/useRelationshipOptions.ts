import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { getDataProvider } from '@/core/data/DataProvider';
import { queryKeys } from '@/core/data/queryKeys';
import type { RecordShape } from '@/core/data/types';
import { debounce, getPath } from '@/lib/utils';
import type { RelationshipConfig, SelectOption } from '../fields/Select';

const PRELOAD_PAGE_SIZE = 200;
const SEARCH_PAGE_SIZE = 25;

/**
 * Loads `<Select>` options from another resource. `preload` swaps server-side
 * search for one big fetch, which is the right trade for short lookup tables.
 */
export function useRelationshipOptions(
  relationship: RelationshipConfig | undefined,
  { preload = false, selected = [] }: { preload?: boolean; selected?: Array<string | number> } = {},
) {
  const [term, setTerm] = React.useState('');
  const effectiveTerm = preload ? '' : term;

  const listQuery = useQuery({
    queryKey: relationship
      ? queryKeys.options(relationship.resource, effectiveTerm)
      : ['relationship', 'disabled'],
    enabled: Boolean(relationship),
    staleTime: 60_000,
    queryFn: async () => {
      const config = relationship!;
      return getDataProvider().getList<RecordShape>(config.resource, {
        page: 1,
        perPage: preload ? PRELOAD_PAGE_SIZE : SEARCH_PAGE_SIZE,
        search: effectiveTerm || undefined,
        ...config.query,
      });
    },
  });

  // Values already on the record may not appear in the current page of results.
  const missing = React.useMemo(() => {
    if (!relationship || !listQuery.data) return [];
    const key = relationship.valueKey ?? 'id';
    const loaded = new Set(listQuery.data.data.map((row) => String(getPath(row, key))));
    return selected.filter((value) => value !== '' && !loaded.has(String(value)));
  }, [relationship, listQuery.data, selected]);

  const missingQuery = useQuery({
    queryKey: relationship ? [relationship.resource, 'options-by-id', missing.join(',')] : ['noop'],
    enabled: Boolean(relationship) && missing.length > 0,
    staleTime: 60_000,
    queryFn: () => getDataProvider().getMany<RecordShape>(relationship!.resource, missing),
  });

  const options = React.useMemo<SelectOption[]>(() => {
    if (!relationship) return [];
    const valueKey = relationship.valueKey ?? 'id';
    const toOption = (row: RecordShape): SelectOption => ({
      value: String(getPath(row, valueKey) ?? ''),
      label: String(getPath(row, relationship.titleKey) ?? ''),
    });
    const rows = [...(missingQuery.data ?? []), ...(listQuery.data?.data ?? [])];
    const seen = new Set<string>();
    return rows.map(toOption).filter((option) => {
      const key = String(option.value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [relationship, listQuery.data, missingQuery.data]);

  const onSearch = React.useMemo(() => debounce((value: string) => setTerm(value), 300), []);
  React.useEffect(() => onSearch.cancel, [onSearch]);

  return {
    options,
    loading: listQuery.isLoading || missingQuery.isLoading,
    onSearch: preload ? undefined : onSearch,
  };
}
