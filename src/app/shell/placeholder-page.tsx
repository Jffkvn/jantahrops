import { Hammer } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';

/**
 * Stand-in for a route whose module has not been built yet. Every nav item
 * resolves to a real page from day one — a dead link reads as a bug, this reads
 * as a promise. Replaced phase by phase.
 */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <PageHeader description={`This section arrives in ${phase}.`} title={title} />
      <EmptyState
        description={`${title} is planned and specified. It will be built in ${phase}.`}
        headline="Coming soon"
        icon={<Hammer className="h-6 w-6" />}
      />
    </div>
  );
}
