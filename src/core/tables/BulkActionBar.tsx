import { X } from 'lucide-react';
import type { Action } from '@/core/actions/Action';
import { ActionRenderer } from '@/core/actions/ActionRenderer';
import type { RecordShape } from '@/core/data/types';
import { Button } from '@/core/ui/button';

interface BulkActionBarProps {
  actions: Action[];
  records: RecordShape[];
  onClear: () => void;
}

/** Floating bar that appears once at least one row is selected. */
export function BulkActionBar({ actions, records, onClear }: BulkActionBarProps) {
  if (records.length === 0) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
    >
      <div className="border-border bg-card pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 shadow-lg">
        <span className="px-1 text-sm font-medium">{records.length} selected</span>
        <span className="bg-border h-5 w-px" aria-hidden />
        {actions.map((action) => (
          <ActionRenderer
            key={action.name}
            action={action}
            records={records}
            onCompleted={onClear}
          />
        ))}
        <Button variant="ghost" size="iconSm" aria-label="Clear selection" onClick={onClear}>
          <X />
        </Button>
      </div>
    </div>
  );
}
