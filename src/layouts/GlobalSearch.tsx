import { CornerDownLeft } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/core/auth/useAuth';
import { buildNavigation } from '@/core/navigation/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/core/ui/dialog';
import { Icon } from '@/core/ui/icon';
import { cn } from '@/lib/utils';

/** ⌘K palette over the navigation the current user is allowed to see. */
export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = React.useState('');
  const [cursor, setCursor] = React.useState(0);

  const items = React.useMemo(() => buildNavigation(can).flatMap((group) => group.items), [can]);

  const results = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.label.toLowerCase().includes(needle));
  }, [items, term]);

  React.useEffect(() => setCursor(0), [term]);

  const go = (path: string) => {
    onOpenChange(false);
    setTerm('');
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="lg" hideClose className="gap-0 p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <input
          autoFocus
          value={term}
          placeholder="Jump to…"
          aria-label="Search navigation"
          className="border-border placeholder:text-muted-foreground w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setCursor((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setCursor((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter' && results[cursor]) {
              go(results[cursor].path);
            }
          }}
        />

        <ul className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="text-muted-foreground px-2 py-6 text-center text-sm">No matches.</li>
          ) : (
            results.map((item, index) => (
              <li key={item.key}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(item.path)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm',
                    index === cursor ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                  )}
                >
                  <Icon name={item.icon ?? 'circle-dot'} className="size-4" />
                  <span className="flex-1">{item.label}</span>
                  {index === cursor ? <CornerDownLeft className="size-3.5 opacity-60" /> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
