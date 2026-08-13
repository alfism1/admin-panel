import * as React from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  to?: string;
}

interface PageShellProps {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Consistent page frame: breadcrumbs, heading, header actions, content slot. */
export function PageShell({
  title,
  description,
  breadcrumbs,
  actions,
  children,
  className,
}: PageShellProps) {
  React.useEffect(() => {
    document.title = `${title} · ${import.meta.env.VITE_APP_NAME ?? 'Admin Panel'}`;
  }, [title]);

  return (
    <div className={cn('space-y-5', className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="size-3.5 opacity-60" aria-hidden /> : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-foreground rounded-sm hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {children}
    </div>
  );
}
