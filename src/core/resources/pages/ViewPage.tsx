import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useParams } from 'react-router';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { ActionRenderer } from '@/core/actions/ActionRenderer';
import { useAuth } from '@/core/auth/useAuth';
import { normalizeError } from '@/core/data/errors';
import { queryKeys } from '@/core/data/queryKeys';
import { CellRenderer } from '@/core/tables/CellRenderer';
import { TableErrorState } from '@/core/tables/TableStates';
import { Card, Skeleton } from '@/core/ui/misc';
import { PageShell } from '@/core/ui/PageShell';
import { labelize } from '@/lib/labelize';
import { ResourceProvider } from '../ResourceContext';
import { useResourceRecord } from '../useResourceRecord';
import type { Resource } from '../types';

export function ViewPage({ resource }: { resource: Resource }) {
  const { id } = useParams();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const query = useResourceRecord(resource, id);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.detail(resource.name, id ?? '') });
  }, [queryClient, resource.name, id]);

  const record = query.data ?? null;
  const title = resource.recordTitle(record);
  const entries = (resource.infolist ?? resource.table.columns).filter((column) =>
    column.isAllowed({ user, can }),
  );

  return (
    <ResourceProvider resource={resource} refresh={refresh}>
      <PageShell
        title={title}
        breadcrumbs={[
          { label: resource.labels.plural, to: resource.routes.list },
          { label: title },
        ]}
        actions={
          record ? (
            <>
              {resource.pages.edit ? (
                <ActionRenderer action={EditAction.make().iconOnly(false)} record={record} />
              ) : null}
              <ActionRenderer action={DeleteAction.make().iconOnly(false)} record={record} />
            </>
          ) : null
        }
      >
        {query.isError ? (
          <TableErrorState
            message={normalizeError(query.error).message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <Card className="p-5">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {entries.map((column) => (
                <div key={column.name} className="min-w-0 space-y-1">
                  <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {column.resolveLabel() || labelize(column.name)}
                  </dt>
                  <dd className="min-w-0 text-sm">
                    {query.isLoading || !record ? (
                      <Skeleton className="h-4 w-32" />
                    ) : (
                      <CellRenderer column={column} record={record} align="start" />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </PageShell>
    </ResourceProvider>
  );
}
