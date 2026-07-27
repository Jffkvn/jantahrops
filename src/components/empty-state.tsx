import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  headline: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, headline, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-border bg-surface p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-surface-sunken text-primary">
        {icon ?? <FolderOpen className="h-6 w-6" />}
      </div>
      <h3 className="mt-4 font-display text-md font-semibold text-ink">{headline}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-secondary">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
