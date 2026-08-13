import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Checkbox } from '@/core/ui/checkbox';
import { TableHead, TableHeader, TableRow } from '@/core/ui/table';
import { cn } from '@/lib/utils';
import { ALIGNMENT } from './CellRenderer';
import type { Column } from './Column';
import type { TableSortState } from './types';

interface TableHeaderRowProps {
  columns: Column[];
  sort: TableSortState | null;
  onToggleSort: (column: Column) => void;
  showSelection: boolean;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  hasRowActions: boolean;
}

export function TableHeaderRow({
  columns,
  sort,
  onToggleSort,
  showSelection,
  allSelected,
  someSelected,
  onToggleAll,
  hasRowActions,
}: TableHeaderRowProps) {
  return (
    <TableHeader>
      <TableRow>
        {showSelection ? (
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all rows on this page"
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={(checked) => onToggleAll(checked === true)}
            />
          </TableHead>
        ) : null}

        {columns.map((column) => {
          const config = column.definition;
          const sortKey = config.sortColumn ?? column.name;
          const active = sort?.column === sortKey ? sort : null;
          const alignment = ALIGNMENT[config.align ?? 'start'];

          return (
            <TableHead
              key={column.name}
              style={{ width: config.width }}
              aria-sort={
                active ? (active.direction === 'asc' ? 'ascending' : 'descending') : undefined
              }
            >
              {config.sortable ? (
                <button
                  type="button"
                  onClick={() => onToggleSort(column)}
                  className={cn(
                    'hover:text-foreground flex w-full items-center gap-1 uppercase transition-colors',
                    alignment,
                  )}
                >
                  {column.resolveLabel()}
                  {active ? (
                    active.direction === 'asc' ? (
                      <ArrowUp className="size-3.5" />
                    ) : (
                      <ArrowDown className="size-3.5" />
                    )
                  ) : (
                    <ChevronsUpDown className="size-3.5 opacity-40" />
                  )}
                </button>
              ) : (
                <span className={cn('flex', alignment)}>{column.resolveLabel()}</span>
              )}
            </TableHead>
          );
        })}

        {hasRowActions ? (
          <TableHead className="w-px text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        ) : null}
      </TableRow>
    </TableHeader>
  );
}
