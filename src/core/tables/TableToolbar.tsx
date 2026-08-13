import { Filter as FilterIcon, Search, Settings2, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/core/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/core/ui/dropdown-menu';
import { Input } from '@/core/ui/input';
import { Badge } from '@/core/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/core/ui/popover';
import { debounce } from '@/lib/utils';
import type { Column } from './Column';
import type { Filter } from './filters/Filter';

interface TableToolbarProps {
  searchable: boolean;
  search: string;
  onSearch: (value: string) => void;
  filters: Filter[];
  filterValues: Record<string, string>;
  onFilterChange: (filter: Filter, value: string) => void;
  onResetFilters: () => void;
  toggleableColumns: Column[];
  hiddenColumns: string[];
  onToggleColumn: (name: string) => void;
}

export function TableToolbar({
  searchable,
  search,
  onSearch,
  filters,
  filterValues,
  onFilterChange,
  onResetFilters,
  toggleableColumns,
  hiddenColumns,
  onToggleColumn,
}: TableToolbarProps) {
  const [term, setTerm] = React.useState(search);
  const debounced = React.useMemo(() => debounce(onSearch, 300), [onSearch]);

  React.useEffect(() => setTerm(search), [search]);
  React.useEffect(() => debounced.cancel, [debounced]);

  const activeFilters = filters.filter((filter) => {
    const value = filterValues[filter.name] ?? '';
    return !filter.isEmpty(value);
  });

  if (!searchable && filters.length === 0 && toggleableColumns.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3">
      {searchable ? (
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={term}
            placeholder="Search…"
            aria-label="Search records"
            className="pl-8"
            onChange={(event) => {
              setTerm(event.target.value);
              debounced(event.target.value);
            }}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {filters.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="md">
              <FilterIcon />
              Filters
              {activeFilters.length > 0 ? (
                <Badge tone="primary" className="ml-1">
                  {activeFilters.length}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-4" align="end">
            {filters.map((filter) => {
              const Control = filter.control;
              return (
                <div key={filter.name} className="space-y-1.5">
                  <p className="text-sm font-medium">{filter.resolveLabel()}</p>
                  <Control
                    filter={filter}
                    value={filterValues[filter.name] ?? ''}
                    onChange={(value) => onFilterChange(filter, value)}
                  />
                </div>
              );
            })}
            {activeFilters.length > 0 ? (
              <Button variant="ghost" size="sm" className="w-full" onClick={onResetFilters}>
                <X /> Clear all filters
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}

      {toggleableColumns.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="md">
              <Settings2 />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {toggleableColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.name}
                checked={!hiddenColumns.includes(column.name)}
                onCheckedChange={() => onToggleColumn(column.name)}
                onSelect={(event) => event.preventDefault()}
              >
                {column.resolveLabel()}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {activeFilters.length > 0 ? (
        <ul className="flex w-full flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <li key={filter.name}>
              <button
                type="button"
                onClick={() => onFilterChange(filter, '')}
                className="bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors"
              >
                <span className="text-foreground font-medium">{filter.resolveLabel()}:</span>
                {filter.describe(filterValues[filter.name] ?? '')}
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
