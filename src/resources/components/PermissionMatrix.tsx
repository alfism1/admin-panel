import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { apiClient } from '@/core/data/apiClient';
import type { SelectConfig, SelectValue } from '@/core/forms/fields/Select';
import type { FieldRenderProps } from '@/core/forms/types';
import { Checkbox } from '@/core/ui/checkbox';
import { Skeleton } from '@/core/ui/misc';
import { labelize } from '@/lib/labelize';

/**
 * Escape hatch demo: a fully custom control plugged into the builder with
 * `.customComponent()`. Rows are resources, columns are actions.
 */
export function PermissionMatrix({
  value,
  onChange,
  state,
}: FieldRenderProps<SelectValue, SelectConfig>) {
  const { data, isLoading } = useQuery({
    queryKey: ['permissions'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const response = await apiClient.get<{ data: string[] }>('/permissions');
      return response.data.data;
    },
  });

  const { groups, actions } = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    const actionSet = new Set<string>();
    for (const permission of data ?? []) {
      const [group, action] = permission.split('.');
      if (!map.has(group)) map.set(group, new Set());
      map.get(group)!.add(action);
      actionSet.add(action);
    }
    return { groups: [...map.entries()], actions: [...actionSet] };
  }, [data]);

  // Stored values may use `post.*`; expand them so the grid shows what is granted.
  const selected = React.useMemo(() => {
    const stored = (Array.isArray(value) ? value : []).map(String);
    const expanded = new Set(stored);
    for (const permission of stored) {
      if (!permission.endsWith('.*')) continue;
      const group = permission.slice(0, -2);
      for (const action of groups.find(([name]) => name === group)?.[1] ?? []) {
        expanded.add(`${group}.${action}`);
      }
    }
    return expanded;
  }, [value, groups]);

  const emit = (next: Set<string>) => onChange([...next].filter((item) => !item.endsWith('.*')));

  const toggle = (permission: string) => {
    const next = new Set(selected);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    emit(next);
  };

  const toggleGroup = (group: string, available: Set<string>) => {
    const all = [...available].map((action) => `${group}.${action}`);
    const next = new Set(selected);
    const enabled = all.every((permission) => next.has(permission));
    for (const permission of all) {
      if (enabled) next.delete(permission);
      else next.add(permission);
    }
    emit(next);
  };

  const toggleAction = (action: string) => {
    const all = groups
      .filter(([, available]) => available.has(action))
      .map(([group]) => `${group}.${action}`);
    const next = new Set(selected);
    const enabled = all.every((permission) => next.has(permission));
    for (const permission of all) {
      if (enabled) next.delete(permission);
      else next.add(permission);
    }
    emit(next);
  };

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const isSuperAdmin = selected.has('*');

  return (
    <div className="space-y-3">
      <label className="border-border flex items-center gap-2.5 rounded-lg border p-3 text-sm">
        <Checkbox
          checked={isSuperAdmin}
          disabled={state.disabled}
          onCheckedChange={(checked) => emit(checked === true ? new Set(['*']) : new Set())}
        />
        <span>
          <span className="font-medium">Super admin</span>
          <span className="text-muted-foreground block text-xs">
            Grants every permission, including ones added later.
          </span>
        </span>
      </label>

      <div className={isSuperAdmin ? 'pointer-events-none opacity-50' : undefined}>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">{state.label}</caption>
            <thead>
              <tr className="border-border bg-muted/40 border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Resource
                </th>
                {actions.map((action) => (
                  <th key={action} scope="col" className="px-3 py-2 text-center font-medium">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => toggleAction(action)}
                    >
                      {labelize(action)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {groups.map(([group, available]) => (
                <tr key={group}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleGroup(group, available)}
                    >
                      {labelize(group)}
                    </button>
                  </th>
                  {actions.map((action) => {
                    const permission = `${group}.${action}`;
                    if (!available.has(action)) {
                      return (
                        <td key={action} className="text-muted-foreground/40 px-3 py-2 text-center">
                          –
                        </td>
                      );
                    }
                    return (
                      <td key={action} className="px-3 py-2 text-center">
                        <Checkbox
                          checked={selected.has(permission)}
                          disabled={state.disabled}
                          aria-label={permission}
                          onCheckedChange={() => toggle(permission)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
