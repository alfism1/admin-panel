import { LogOut, Menu, Moon, PanelLeft, Search, Sun, User } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/core/auth/useAuth';
import { Button } from '@/core/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/core/ui/dropdown-menu';
import { Avatar } from '@/core/ui/misc';
import { useTheme } from '@/core/ui/useTheme';
import { initials } from '@/lib/labelize';

interface TopbarProps {
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
}

export function Topbar({ onToggleSidebar, onOpenMobileNav, onOpenSearch }: TopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <header className="border-border bg-background/85 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={onOpenMobileNav}
      >
        <Menu />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
      >
        <PanelLeft />
      </Button>

      <button
        type="button"
        onClick={onOpenSearch}
        className="border-input bg-card text-muted-foreground hover:text-foreground ml-1 hidden min-w-56 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors sm:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="border-border rounded border px-1 text-[10px] font-medium">⌘K</kbd>
      </button>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        onClick={toggleTheme}
      >
        {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hover:bg-accent flex items-center gap-2 rounded-md p-1 transition-colors"
            aria-label="Account menu"
          >
            <Avatar src={user?.avatar} fallback={initials(user?.name ?? '?')} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuLabel className="text-foreground text-sm font-medium">
            {user?.name}
            <span className="text-muted-foreground block text-xs font-normal">{user?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/profile')}>
            <User /> Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onSelect={() => {
              void logout().then(() => navigate('/login'));
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
