import { ShieldOff } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/core/ui/button';

export function ForbiddenPage({ requiredPermission }: { requiredPermission?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="bg-destructive/10 flex size-12 items-center justify-center rounded-full">
        <ShieldOff className="text-destructive size-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">403 — Not allowed</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Your account does not have permission to open this page.
          {requiredPermission ? (
            <>
              {' '}
              Required: <code className="bg-muted rounded px-1 py-0.5">{requiredPermission}</code>
            </>
          ) : null}
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
