import { useQuery } from '@tanstack/react-query';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import * as React from 'react';
import type { Action } from '@/core/actions/Action';
import { ActionRenderer } from '@/core/actions/ActionRenderer';
import { useAuth } from '@/core/auth/useAuth';
import { getDataProvider } from '@/core/data/DataProvider';
import { normalizeError } from '@/core/data/errors';
import { queryKeys } from '@/core/data/queryKeys';
import type { DataProvider, ListParams, RecordShape } from '@/core/data/types';
import { Checkbox } from '@/core/ui/checkbox';
import { Card } from '@/core/ui/misc';
import { Table, TableBody, TableCell, TableRow } from '@/core/ui/table';
import { cn } from '@/lib/utils';
import { BulkActionBar } from './BulkActionBar';
import { CellRenderer } from './CellRenderer';
import { TableCards } from './TableCards';
import { TableHeaderRow } from './TableHeaderRow';
import { TableEmptyState, TableErrorState, TableLoadingRows } from './TableStates';
import { TablePagination } from './TablePagination';
import { TableToolbar } from './TableToolbar';
import { useTableState } from './useTableState';
import type { TableSchema } from './types';

export interface SchemaTableProps {
  /** Resource key passed to the data provider. */
  resource: string;
  schema: TableSchema;
  dataProvider?: DataProvider;
  /** Namespaces the stored column preferences; defaults to `resource`. */
  storageKey?: string;
  createAction?: Action;
}

const DEFAULT_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function SchemaTable({
  resource,
  schema,
  dataProvider,
  storageKey,
  createAction,
}: SchemaTableProps) {
  const { user, can } = useAuth();
  const state = useTableState(schema, storageKey ?? resource);
  const [selection, setSelection] = React.useState<RowSelectionState>({});

  const tableCtx = React.useMemo(() => ({ user, can }), [user, can]);

  const columns = React.useMemo(
    () =>
      schema.columns
        .filter((column) => column.isAllowed(tableCtx))
        .filter((column) => !state.hiddenColumns.includes(column.name)),
    [schema.columns, tableCtx, state.hiddenColumns],
  );

  const toggleableColumns = React.useMemo(
    () => schema.columns.filter((column) => column.definition.toggleable),
    [schema.columns],
  );

  const searchable = schema.columns.some((column) => column.definition.searchable);
  const bulkActions = schema.bulkActions ?? [];
  const rowActions = schema.actions ?? [];

  const params: ListParams = {
    page: state.page,
    perPage: state.perPage,
    search: state.search || undefined,
    sort: state.sort ? { field: state.sort.column, order: state.sort.direction } : undefined,
    filters: Object.fromEntries(
      (schema.filters ?? []).flatMap((filter) => {
        const raw = state.filters[filter.name] ?? '';
        return filter.isEmpty(raw) ? [] : [[filter.name, filter.toQuery(raw)]];
      }),
    ),
  };

  const query = useQuery({
    queryKey: queryKeys.list(resource, params),
    queryFn: () => getDataProvider(dataProvider).getList<RecordShape>(resource, params),
    placeholderData: (previous) => previous,
    refetchInterval: schema.poll,
  });

  const rows = query.data?.data ?? [];

  const tableColumns = React.useMemo<ColumnDef<RecordShape>[]>(
    () => columns.map((column) => ({ id: column.name, accessorKey: column.name })),
    [columns],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: bulkActions.length > 0,
    getRowId: (row) => String(row.id),
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
  });

  const selectedRecords = table.getSelectedRowModel().rows.map((row) => row.original);
  const clearSelection = React.useCallback(() => setSelection({}), []);

  // Selection must not survive a page or filter change.
  React.useEffect(
    () => clearSelection(),
    [state.page, state.search, state.filters, clearSelection],
  );

  const showSelection = bulkActions.length > 0;
  const columnCount = columns.length + (showSelection ? 1 : 0) + (rowActions.length > 0 ? 1 : 0);

  return (
    <>
      <Card className="overflow-hidden">
        <TableToolbar
          searchable={searchable}
          search={state.search}
          onSearch={state.setSearch}
          filters={schema.filters ?? []}
          filterValues={state.filters}
          onFilterChange={state.setFilter}
          onResetFilters={state.resetFilters}
          toggleableColumns={toggleableColumns}
          hiddenColumns={state.hiddenColumns}
          onToggleColumn={state.toggleColumn}
        />

        {query.isError ? (
          <TableErrorState
            message={normalizeError(query.error).message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <div
              className={cn(
                'hidden md:block',
                query.isFetching && !query.isLoading && 'opacity-60 transition-opacity',
              )}
            >
              <Table>
                <TableHeaderRow
                  columns={columns}
                  sort={state.sort}
                  onToggleSort={state.toggleSort}
                  showSelection={showSelection}
                  allSelected={table.getIsAllPageRowsSelected()}
                  someSelected={table.getIsSomePageRowsSelected()}
                  onToggleAll={(checked) => table.toggleAllPageRowsSelected(checked)}
                  hasRowActions={rowActions.length > 0}
                />

                <TableBody>
                  {query.isLoading ? (
                    <TableLoadingRows columns={columnCount} />
                  ) : (
                    table.getRowModel().rows.map((row, index) => (
                      <TableRow
                        key={row.id}
                        data-selected={row.getIsSelected()}
                        className={cn(
                          'group/row',
                          schema.striped && index % 2 === 1 && 'bg-muted/30',
                        )}
                      >
                        {showSelection ? (
                          <TableCell>
                            <Checkbox
                              aria-label={`Select row ${row.id}`}
                              checked={row.getIsSelected()}
                              onCheckedChange={(checked) => row.toggleSelected(checked === true)}
                            />
                          </TableCell>
                        ) : null}

                        {columns.map((column) => (
                          <TableCell
                            key={column.name}
                            className={cn(!column.definition.wrap && 'max-w-[22rem]')}
                          >
                            <CellRenderer column={column} record={row.original} />
                          </TableCell>
                        ))}

                        {rowActions.length > 0 ? (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {rowActions.map((action) => (
                                <ActionRenderer
                                  key={action.name}
                                  action={action}
                                  record={row.original}
                                />
                              ))}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <TableCards
              rows={rows}
              columns={columns}
              actions={rowActions}
              loading={query.isLoading}
            />

            {!query.isLoading && rows.length === 0 ? (
              <TableEmptyState
                options={schema.emptyState}
                createAction={createAction}
                filtered={Boolean(state.search) || Object.keys(state.filters).length > 0}
                onClearFilters={state.resetFilters}
              />
            ) : null}

            {query.data && rows.length > 0 ? (
              <TablePagination
                meta={query.data.meta}
                perPageOptions={schema.perPageOptions ?? DEFAULT_PER_PAGE_OPTIONS}
                onPageChange={state.setPage}
                onPerPageChange={state.setPerPage}
              />
            ) : null}
          </>
        )}
      </Card>

      <BulkActionBar actions={bulkActions} records={selectedRecords} onClear={clearSelection} />
    </>
  );
}
