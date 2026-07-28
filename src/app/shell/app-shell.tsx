import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { cn } from '@/lib/cn';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SidebarNav } from './sidebar-nav';
import { Topbar } from './topbar';
import { CommandBar } from './command-bar';

const COLLAPSE_KEY = 'jantahr-ops-sidebar-collapsed';

/**
 * The application frame: fixed sidebar on desktop, slide-over sheet on mobile,
 * a top bar, and the ⌘K command palette. Routed pages render into <Outlet />.
 *
 * The sidebar collapse state persists; the mobile sheet does not (it should
 * always start closed on a fresh page).
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Global ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 transition-[width] duration-200 ease-out lg:block',
          collapsed ? 'w-[68px]' : 'w-[264px]',
        )}
      >
        <SidebarNav collapsed={collapsed} />
      </aside>

      {/* Mobile sidebar sheet */}
      <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
        <SheetContent className="w-[264px] border-0 p-0" side="left">
          <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          collapsed={collapsed}
          onOpenCommand={() => setCommandOpen(true)}
          onOpenMobileNav={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandBar onOpenChange={setCommandOpen} open={commandOpen} />
    </div>
  );
}
