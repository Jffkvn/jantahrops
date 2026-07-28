import { useTheme } from '@/app/theme-provider';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      aria-label="Select color theme"
      className="inline-flex items-center rounded-pill border border-border bg-surface-sunken p-1 text-ink"
      role="group"
    >
      <button
        aria-label="Light theme"
        className={`flex h-7 w-7 items-center justify-center rounded-pill transition-colors duration-150 ${
          theme === 'light'
            ? 'border border-border bg-surface text-primary'
            : 'text-ink-muted hover:text-ink'
        }`}
        onClick={() => setTheme('light')}
        type="button"
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        aria-label="Dark theme"
        className={`flex h-7 w-7 items-center justify-center rounded-pill transition-colors duration-150 ${
          theme === 'dark'
            ? 'border border-border bg-surface text-primary'
            : 'text-ink-muted hover:text-ink'
        }`}
        onClick={() => setTheme('dark')}
        type="button"
      >
        <Moon className="h-4 w-4" />
      </button>
      <button
        aria-label="System theme"
        className={`flex h-7 w-7 items-center justify-center rounded-pill transition-colors duration-150 ${
          theme === 'system'
            ? 'border border-border bg-surface text-primary'
            : 'text-ink-muted hover:text-ink'
        }`}
        onClick={() => setTheme('system')}
        type="button"
      >
        <Monitor className="h-4 w-4" />
      </button>
    </div>
  );
}
