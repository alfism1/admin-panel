import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { ActionRenderer } from '@/core/actions/ActionRenderer';
import { normalizeError } from '@/core/data/errors';
import { queryKeys } from '@/core/data/queryKeys';
import { SchemaForm } from '@/core/forms/SchemaForm';
import { notify } from '@/core/ui/notify';
import { PageShell } from '@/core/ui/PageShell';
import { TableErrorState } from '@/core/tables/TableStates';
import { ResourceProvider } from '../ResourceContext';
import { useResourceMutation, useResourceRecord } from '../useResourceRecord';
import type { Resource } from '../types';

export function EditPage({ resource }: { resource: Resource }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useResourceRecord(resource, id);
  const mutation = useResourceMutation(resource, id);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.detail(resource.name, id ?? '') });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lists(resource.name) });
  }, [queryClient, resource.name, id]);

  const record = query.data ?? null;
  const title = resource.recordTitle(record);

  return (
    <ResourceProvider resource={resource} refresh={refresh}>
      <PageShell
        title={title}
        description={`Edit this ${resource.labels.singular.toLowerCase()}`}
        breadcrumbs={[
          { label: resource.labels.plural, to: resource.routes.list },
          { label: title, to: record ? resource.routes.view(record) : undefined },
          { label: 'Edit' },
        ]}
        actions={
          record ? (
            <>
              {resource.pages.view ? (
                <ActionRenderer action={ViewAction.make().iconOnly(false)} record={record} />
              ) : null}
              <ActionRenderer
                action={DeleteAction.make()
                  .iconOnly(false)
                  .action(() => navigate(resource.routes.list))}
                record={record}
              />
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
          <SchemaForm
            schema={resource.form ?? []}
            operation="edit"
            record={record}
            loading={query.isLoading}
            onCancel={() => navigate(resource.routes.list)}
            onSubmit={async (values) => {
              await mutation.mutateAsync(values);
              notify.success(`${resource.labels.singular} updated.`);
            }}
          />
        )}
      </PageShell>
    </ResourceProvider>
  );
}
