import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { CreateAction } from '@/core/actions/CreateAction';
import { ActionRenderer } from '@/core/actions/ActionRenderer';
import { queryKeys } from '@/core/data/queryKeys';
import { SchemaTable } from '@/core/tables/SchemaTable';
import { PageShell } from '@/core/ui/PageShell';
import { ResourceProvider } from '../ResourceContext';
import type { Resource } from '../types';

export function ListPage({ resource }: { resource: Resource }) {
  const queryClient = useQueryClient();

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.lists(resource.name) });
  }, [queryClient, resource.name]);

  const createAction = React.useMemo(() => CreateAction.make(), []);
  const headerActions = resource.table.headerActions ?? [];

  return (
    <ResourceProvider resource={resource} refresh={refresh}>
      <PageShell
        title={resource.labels.plural}
        breadcrumbs={[{ label: resource.labels.plural }]}
        actions={
          <>
            {headerActions.map((action) => (
              <ActionRenderer key={action.name} action={action} />
            ))}
            {resource.pages.create ? <ActionRenderer action={createAction} /> : null}
          </>
        }
      >
        <SchemaTable
          resource={resource.name}
          schema={resource.table}
          dataProvider={resource.dataProvider}
          createAction={resource.pages.create ? createAction : undefined}
        />
      </PageShell>
    </ResourceProvider>
  );
}
