import { Outlet } from 'react-router';

const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Admin Panel';

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </div>

      <aside className="bg-primary/10 relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--color-primary)/25,transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-end gap-3 p-10">
          <p className="text-2xl leading-snug font-semibold">
            Declare a resource.
            <br />
            Get the whole admin panel.
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {APP_NAME} builds forms, tables, filters, permissions and routes from a single schema
            file — no hand-written JSX required.
          </p>
        </div>
      </aside>
    </div>
  );
}
