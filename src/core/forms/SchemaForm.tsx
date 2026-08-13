import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { FormProvider, useForm, type Resolver as RhfResolver } from 'react-hook-form';
import { useAuth } from '@/core/auth/useAuth';
import { applyServerErrors } from '@/core/data/errors';
import { Button } from '@/core/ui/button';
import { Skeleton } from '@/core/ui/misc';
import { cn } from '@/lib/utils';
import { buildZodSchema, resetUniqueCache } from './buildZodSchema';
import { ComponentRenderer } from './ComponentRenderer';
import { buildDefaultValues, collectFields, dehydrateValues } from './formState';
import { createStaticContext } from './useFieldContext';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';
import type { FormComponent, FormValues, Operation } from './types';

export interface SchemaFormProps {
  schema: FormComponent[];
  operation: Operation;
  record?: FormValues | null;
  onSubmit: (data: FormValues) => Promise<void> | void;
  loading?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  /** Rendered next to the submit button, e.g. a "Save and create another". */
  extraActions?: React.ReactNode;
  hideActions?: boolean;
  id?: string;
  className?: string;
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function SchemaForm({
  schema,
  operation,
  record = null,
  onSubmit,
  loading = false,
  submitLabel,
  onCancel,
  extraActions,
  hideActions = false,
  id,
  className,
}: SchemaFormProps) {
  const { user, can } = useAuth();
  const fields = React.useMemo(() => collectFields(schema), [schema]);

  const makeContext = React.useCallback(
    (values: FormValues, field: (typeof fields)[number]) =>
      createStaticContext(values, {
        operation,
        record,
        ownName: field.name,
        user,
        can,
      }),
    [operation, record, user, can],
  );

  const defaultValues = React.useMemo(
    () => buildDefaultValues(fields, record, makeContext),
    [fields, record, makeContext],
  );

  const resolver = React.useMemo(
    () => zodResolver(buildZodSchema({ fields, makeContext })) as RhfResolver<FormValues>,
    [fields, makeContext],
  );

  const form = useForm<FormValues>({
    defaultValues,
    resolver,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  // The record arrives after the first render on edit pages.
  React.useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  useUnsavedChangesGuard(form.formState.isDirty && !form.formState.isSubmitSuccessful);

  const handleSubmit = form.handleSubmit(async (values) => {
    const payload = dehydrateValues(fields, values, makeContext);
    try {
      await onSubmit(payload);
      resetUniqueCache();
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  if (loading) return <FormSkeleton />;

  const isView = operation === 'view';

  return (
    <FormProvider {...form}>
      <form
        id={id}
        noValidate
        onSubmit={handleSubmit}
        className={cn('space-y-5', className)}
        aria-busy={form.formState.isSubmitting}
      >
        <div className="grid grid-cols-1 gap-5">
          <ComponentRenderer components={schema} operation={operation} record={record} />
        </div>

        {!hideActions && !isView ? (
          <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {extraActions}
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" loading={form.formState.isSubmitting}>
              {submitLabel ?? (operation === 'create' ? 'Create' : 'Save changes')}
            </Button>
          </div>
        ) : null}
      </form>
    </FormProvider>
  );
}
