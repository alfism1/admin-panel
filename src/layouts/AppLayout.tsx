import * as React from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '@/core/ui/ErrorBoundary';
import { Sheet, SheetContent } from '@/core/ui/sheet';
import { cn } from '@/lib/utils';
import { GlobalSearch } from './GlobalSearch';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSE_KEY = 'admin.sidebar-collapsed';
const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Admin Panel';

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/"
      className="border-sidebar-border flex h-14 shrink-0 items-center gap-2 border-b px-4 font-semibold"
    >
      <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-sm">
        {APP_NAME.charAt(0)}
      </span>
      {collapsed ? null : <span className="truncate">{APP_NAME}</span>}
    </Link>
  );
}

export function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true',
  );
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const toggleSidebar = () => {
    setCollapsed((current) => {
      localStorage.setItem(COLLAPSE_KEY, String(!current));
      return !current;
    });
  };

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="bg-background flex h-full min-h-screen">
      <aside
        className={cn(
          'border-sidebar-border bg-sidebar hidden shrink-0 flex-col border-r transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <Brand collapsed={collapsed} />
        <Sidebar collapsed={collapsed} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent title="Navigation">
          <Brand collapsed={false} />
          <div onClick={() => setMobileNavOpen(false)} className="flex flex-1 flex-col">
            <Sidebar collapsed={false} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onToggleSidebar={toggleSidebar}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <main className="flex-1 px-4 py-5 sm:px-6">
          <div className="mx-auto w-full max-w-7xl">
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
