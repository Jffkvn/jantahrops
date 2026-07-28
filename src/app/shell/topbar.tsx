import { Menu, PanelLeftClose, PanelLeft, Search, Bell, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/features/auth/auth-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TopbarProps {
  onOpenMobileNav: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
  onOpenCommand: () => void;
}

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const chars = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return chars.toUpperCase() || 'U';
}

export function Topbar({ onOpenMobileNav, onToggleCollapse, collapsed, onOpenCommand }: TopbarProps) {
  const { profile, signOut } = useAuth();
  const name = profile?.full_name ?? '';
  const email = profile?.email ?? '';

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      {/* Mobile: open nav sheet. Desktop: collapse rail. */}
      <button
        aria-label="Open navigation"
        className="rounded-control p-2 text-ink-secondary hover:bg-surface-sunken lg:hidden"
        onClick={onOpenMobileNav}
        type="button"
      >
        <Menu className="h-5 w-5" />
      </button>
      <button
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="hidden rounded-control p-2 text-ink-secondary hover:bg-surface-sunken lg:block"
        onClick={onToggleCollapse}
        type="button"
      >
        {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </button>

      {/* Command bar trigger — looks like search, opens ⌘K. */}
      <button
        className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-control border border-border bg-surface-sunken px-3 text-sm text-ink-muted transition-colors hover:border-border-strong"
        onClick={onOpenCommand}
        type="button"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-muted sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1">
        <button
          aria-label="Notifications"
          className={cn(
            'rounded-control p-2 text-ink-secondary transition-colors hover:bg-surface-sunken',
          )}
          title="Notifications — coming in Phase 1"
          type="button"
        >
          <Bell className="h-5 w-5" />
        </button>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Account menu"
              className="ml-1 rounded-pill outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              type="button"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
                  {initials(name, email)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate text-sm font-medium text-ink">{name || 'Your account'}</span>
              <span className="truncate text-xs font-normal text-ink-muted">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <User className="mr-2 h-4 w-4" />
              Profile
              <span className="ml-auto text-[10px] text-ink-muted">soon</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
