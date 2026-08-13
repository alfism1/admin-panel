import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/core/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="bg-muted flex size-12 items-center justify-center rounded-full">
        <Compass className="text-muted-foreground size-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">404 — Page not found</h1>
        <p className="text-muted-foreground text-sm">
          The page you were looking for does not exist or has moved.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
