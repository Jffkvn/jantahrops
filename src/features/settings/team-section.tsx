import { Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/features/auth/auth-provider';
import { useAllProfiles, useUpdateTeamMember } from './use-settings';
import type { ProfileRow, UserRole } from '@/types/database';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  intern: 'Intern',
};

/**
 * Today the database only distinguishes admin from everyone else — `is_admin()`
 * gates company details, role changes and deletes, and nothing else. Intern is
 * recorded so the distinction exists when it is needed, but it currently grants
 * exactly what staff grants. The copy below says so rather than implying a
 * restriction that is not enforced.
 */
const ROLE_HINTS: Record<UserRole, string> = {
  admin: 'Can change company details, roles and delete records.',
  staff: 'Full day-to-day access. Cannot change company settings.',
  intern: 'Same access as staff today — the label is for your own records.',
};

export function TeamSection() {
  const { isAdmin, profile } = useAuth();
  const { data: people, isLoading } = useAllProfiles();
  const update = useUpdateTeamMember();

  const admins = (people ?? []).filter((p) => p.role === 'admin' && p.is_active);

  const change = async (
    person: ProfileRow,
    patch: { role?: UserRole; is_active?: boolean },
    description: string,
  ) => {
    try {
      await update.mutateAsync({ id: person.id, patch });
      toast.success(description);
    } catch {
      toast.error('Could not apply that change.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton className="h-16 w-full rounded-card" key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-card border border-border bg-surface-sunken/60 px-4 py-3 text-sm text-ink-secondary">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Only an admin can change roles or deactivate an account. The database enforces
            this too — a staff member cannot promote themselves.
          </p>
        </div>
      )}

      {admins.length === 0 && (
        <div className="rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink">
          <p className="font-medium">Nobody here is an admin.</p>
          <p className="mt-1 text-ink-secondary">
            Company details, deletions and role changes all require one. Promote an account
            from the Supabase dashboard (Table Editor → profiles → set role to{' '}
            <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">admin</code>).
          </p>
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {(people ?? []).map((person) => {
          const isSelf = person.id === profile?.id;
          // Removing the last admin would lock the whole team out of company
          // details and role changes, with no way back inside the app.
          const isLastAdmin = person.role === 'admin' && person.is_active && admins.length === 1;

          return (
            <li className="flex flex-wrap items-center gap-3 px-4 py-3" key={person.id}>
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary"
              >
                {initials(person.full_name || person.email)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium text-ink">
                  {person.full_name || <span className="text-ink-muted">No name set</span>}
                  {isSelf && (
                    <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-[11px] font-normal text-ink-secondary">
                      You
                    </span>
                  )}
                  {person.role === 'admin' && (
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {person.email} · joined {formatDate(person.created_at)}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {ROLE_HINTS[person.role]}
                </p>
              </div>

              <Select
                disabled={!isAdmin || isLastAdmin}
                onValueChange={(v) =>
                  void change(
                    person,
                    { role: v as UserRole },
                    `${person.full_name || person.email} is now ${ROLE_LABELS[v as UserRole].toLowerCase()}`,
                  )
                }
                value={person.role}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['staff', 'intern', 'admin'] as UserRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted">
                  {person.is_active ? 'Active' : 'Inactive'}
                </span>
                <Switch
                  aria-label={`${person.is_active ? 'Deactivate' : 'Reactivate'} ${person.full_name || person.email}`}
                  checked={person.is_active}
                  disabled={!isAdmin || isLastAdmin}
                  onCheckedChange={(v) =>
                    void change(
                      person,
                      { is_active: v },
                      v ? 'Account reactivated' : 'Account deactivated',
                    )
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-ink-muted">
        Deactivating keeps everything a person owns — their leads, documents and tasks stay
        exactly where they are. They simply stop appearing in owner and assignee pickers.
        New colleagues join by signing up; their profile appears here automatically.
      </p>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (a + b).toUpperCase() || '?';
}
