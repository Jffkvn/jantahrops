import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, CornerDownLeft, Plus, Target, Moon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useTheme } from '@/app/theme-provider';
import { NAV_ITEMS } from './nav-config';
import { searchLeads, parseQuickLead } from '@/features/search/search-api';
import { stageMeta } from '@/features/leads/lead-stages';

interface CommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: typeof Search;
  run: () => void;
}

/**
 * ⌘K command bar: quick-add, live lead search, and navigation, keyboard-first.
 * Search hits the server-side indexes; everything is one flat, arrow-navigable
 * list so Enter always does the obvious thing.
 */
export function CommandBar({ open, onOpenChange }: CommandBarProps) {
  const navigate = useNavigate();
  const { setTheme, theme } = useTheme();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = (path: string) => {
    void navigate(path);
    onOpenChange(false);
  };

  // Debounce the server search; navigation/actions filter instantly.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const { data: leadResults } = useQuery({
    queryKey: ['cmdk-search', debounced],
    queryFn: () => searchLeads(debounced),
    enabled: open && debounced.length >= 2,
    staleTime: 10_000,
  });

  const quick = useMemo(() => parseQuickLead(query), [query]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const list: Item[] = [];

    // Quick-add always first when it parses.
    if (quick) {
      const params = new URLSearchParams({ new: '1', name: quick.name });
      if (quick.phone) params.set('phone', quick.phone);
      list.push({
        id: 'quick-add',
        label: `Create lead: ${quick.name}${quick.phone ? ` · ${quick.phone}` : ''}`,
        hint: 'New',
        icon: Plus,
        run: () => go(`/leads?${params.toString()}`),
      });
    }

    // Lead search results.
    for (const r of leadResults ?? []) {
      list.push({
        id: `lead:${r.leadId}`,
        label: `${r.contactName}${r.organisationName ? ` · ${r.organisationName}` : ''}`,
        hint: stageMeta(r.stage).label,
        icon: Target,
        run: () => go(`/leads?lead=${r.leadId}`),
      });
    }

    // Actions (always available, filtered by query text).
    const actions: Item[] = [
      { id: 'act:new-lead', label: 'New lead', hint: 'Create', icon: Plus, run: () => go('/leads?new=1') },
      {
        id: 'act:theme',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        hint: 'Toggle',
        icon: Moon,
        run: () => {
          setTheme(theme === 'dark' ? 'light' : 'dark');
          onOpenChange(false);
        },
      },
    ];
    for (const a of actions) {
      if (!q || a.label.toLowerCase().includes(q)) list.push(a);
    }

    // Navigation.
    for (const nav of NAV_ITEMS) {
      if (!q || nav.label.toLowerCase().includes(q)) {
        list.push({
          id: `nav:${nav.path}`,
          label: nav.label,
          hint: 'Go to',
          icon: nav.icon,
          run: () => go(nav.path),
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, quick, leadResults, theme]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => setActive(0), [items.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="top-[15%] max-w-[600px] translate-y-0 gap-0 overflow-hidden p-0"
        showClose={false}
      >
        <DialogTitle className="sr-only">Command menu</DialogTitle>

        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leads, jump to a page, or type “lead Name 0772…”"
            ref={inputRef}
            value={query}
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-ink-muted sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">
              {debounced.length >= 2 ? 'No matches.' : 'Type to search.'}
            </p>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm transition-colors',
                    i === active ? 'bg-surface-sunken text-ink' : 'text-ink-secondary',
                  )}
                  onClick={item.run}
                  onMouseMove={() => setActive(i)}
                  type="button"
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-ink-muted">{item.hint} </span>
                    {item.label}
                  </span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-muted" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
