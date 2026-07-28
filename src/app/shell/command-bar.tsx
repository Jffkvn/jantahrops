import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { NAV_ITEMS } from './nav-config';

interface CommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: typeof Search;
  run: () => void;
}

/**
 * ⌘K command bar. Phase 0 scope: navigation and a few actions, keyboard-first.
 * Phase 1 adds server-side fuzzy search across contacts, leads and tasks and
 * natural-language quick-add — this is the frame those hang off.
 */
export function CommandBar({ open, onOpenChange }: CommandBarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      void navigate(path);
      onOpenChange(false);
    };
    return NAV_ITEMS.map((item) => ({
      id: `nav:${item.path}`,
      label: item.label,
      hint: 'Go to',
      icon: item.icon,
      run: go(item.path),
    }));
  }, [navigate, onOpenChange]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Reset transient state and focus the input each time the bar opens. Radix
  // steadies focus after mount, so defer one frame.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  // Keep the active row in view.
  useEffect(() => {
    setActive(0);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.run();
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="top-[20%] max-w-[560px] translate-y-0 gap-0 overflow-hidden p-0"
        showClose={false}
      >
        <DialogTitle className="sr-only">Command menu</DialogTitle>

        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or jump to…"
            ref={inputRef}
            value={query}
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-ink-muted sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2" ref={listRef}>
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">No matches.</p>
          ) : (
            results.map((c, i) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm transition-colors',
                    i === active ? 'bg-surface-sunken text-ink' : 'text-ink-secondary',
                  )}
                  onClick={c.run}
                  onMouseMove={() => setActive(i)}
                  type="button"
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className="flex-1">
                    <span className="text-ink-muted">{c.hint} </span>
                    {c.label}
                  </span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-ink-muted" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
