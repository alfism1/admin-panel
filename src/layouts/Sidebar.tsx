import { NavLink } from 'react-router';
import { useAuth } from '@/core/auth/useAuth';
import { buildNavigation } from '@/core/navigation/navigation';
import type { NavigationItem } from '@/core/navigation/types';
import { Icon } from '@/core/ui/icon';
import { cn } from '@/lib/utils';

function NavItem({ item, collapsed }: { item: NavigationItem; collapsed: boolean }) {
  const badge = item.badge?.();

  return (
    <NavLink
      to={item.path}
      end={!item.matchPrefix}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary/12 text-primary font-medium'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
        )
      }
    >
      <Icon name={item.icon ?? 'circle-dot'} className="size-4 shrink-0" />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {badge ? (
            <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-xs font-medium">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { can } = useAuth();
  const groups = buildNavigation(can);

  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
      {groups.map((group) => (
        <div key={group.label ?? 'root'} className="space-y-1">
          {group.label && !collapsed ? (
            <p className="text-muted-foreground/70 px-2.5 pb-1 text-xs font-semibold tracking-wider uppercase">
              {group.label}
            </p>
          ) : null}
          {group.label && collapsed ? <div className="bg-sidebar-border mx-2 h-px" /> : null}
          {group.items.map((item) => (
            <NavItem key={item.key} item={item} collapsed={collapsed} />
          ))}
        </div>
      ))}
    </nav>
  );
}
