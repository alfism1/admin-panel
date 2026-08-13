import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useNavigate } from 'react-router';
import { queryKeys } from '@/core/data/queryKeys';
import { SchemaForm } from '@/core/forms/SchemaForm';
import { notify } from '@/core/ui/notify';
import { PageShell } from '@/core/ui/PageShell';
import { ResourceProvider } from '../ResourceContext';
import { useResourceMutation } from '../useResourceRecord';
import type { Resource } from '../types';

export function CreatePage({ resource }: { resource: Resource }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useResourceMutation(resource);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.lists(resource.name) });
  }, [queryClient, resource.name]);

  const title = `New ${resource.labels.singular.toLowerCase()}`;

  return (
    <ResourceProvider resource={resource} refresh={refresh}>
      <PageShell
        title={title}
        breadcrumbs={[
          { label: resource.labels.plural, to: resource.routes.list },
          { label: 'Create' },
        ]}
      >
        <SchemaForm
          schema={resource.form ?? []}
          operation="create"
          submitLabel={`Create ${resource.labels.singular.toLowerCase()}`}
          onCancel={() => navigate(resource.routes.list)}
          onSubmit={async (values) => {
            const record = await mutation.mutateAsync(values);
            notify.success(`${resource.labels.singular} created.`);
            navigate(
              record?.id !== undefined ? resource.routes.edit(record) : resource.routes.list,
            );
          }}
        />
      </PageShell>
    </ResourceProvider>
  );
}
