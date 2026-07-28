import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/logo';
import { NAV_GROUPS } from './nav-config';

interface SidebarNavProps {
  collapsed: boolean;
  /** Called when a nav item is chosen — used to close the mobile sheet. */
  onNavigate?: () => void;
}

/**
 * The sidebar's inner content: brand, then grouped navigation.
 *
 * Rendered on the deep-petrol surface (bg-primary), so every colour here is a
 * light-on-dark override rather than a token pair — the sidebar is the one
 * place in the app that does not follow the light/dark canvas.
 */
export function SidebarNav({ collapsed, onNavigate }: SidebarNavProps) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-ink">
      {/* Brand */}
      <div className={cn('flex h-16 items-center gap-2.5 px-5', collapsed && 'justify-center px-0')}>
        <Logo className="text-sidebar-ink" size={26} title="JantaHR Ops" />
        {!collapsed && (
          <span className="font-display text-lg font-semibold tracking-[-0.02em]">JantaHR Ops</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.heading ?? `group-${i}`} className="space-y-1">
            {group.heading && !collapsed && (
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-ink/45">
                {group.heading}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors duration-150',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-sidebar-ink/15 text-sidebar-ink'
                        : 'text-sidebar-ink/70 hover:bg-sidebar-ink/10 hover:text-sidebar-ink',
                    )
                  }
                  end={item.path === '/'}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  to={item.path}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
