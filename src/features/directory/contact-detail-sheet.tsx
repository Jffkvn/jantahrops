import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Phone, Mail, MessageCircle, Building2, Send, Check, Target, UserRound, Receipt, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/money';
import { formatDateTime, formatRelative } from '@/lib/format';
import { formatPhoneDisplay } from '@/lib/phone';
import {
  useContact,
  useContactFootprint,
  useContactTimeline,
  useAddContactNote,
  useUpdateContact,
  useResolveCandidateReview,
} from './use-directory';
import { DangerZone } from '@/features/privacy/danger-zone';
import { ErasePersonDialog } from '@/features/privacy/erase-person-dialog';

export function ContactDetailSheet({
  contactId,
  onOpenChange,
}: {
  contactId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={contactId !== null}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg" side="right">
        {contactId && <Body contactId={contactId} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: contact, isLoading } = useContact(contactId);
  const { data: footprint } = useContactFootprint(contactId);
  const { data: timeline } = useContactTimeline(contactId);
  const addNote = useAddContactNote(contactId);
  const update = useUpdateContact(contactId);
  const resolveReview = useResolveCandidateReview(contactId);

  const [note, setNote] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [eraseOpen, setEraseOpen] = useState(false);

  useEffect(() => {
    if (contact) setNameDraft(contact.full_name);
  }, [contact]);

  if (isLoading || !contact) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }

  const saveName = async () => {
    const v = nameDraft.trim();
    if (!v || v === contact.full_name) {
      setEditingName(false);
      return;
    }
    await update.mutateAsync({ full_name: v });
    // Renaming a CV-imported person is exactly the moment their review flag
    // stops being true — clear it so the pool's amber dot disappears.
    await resolveReview.mutateAsync();
    toast.success('Name updated');
    setEditingName(false);
  };

  const submitNote = async () => {
    const body = note.trim();
    if (!body) return;
    await addNote.mutateAsync(body);
    setNote('');
  };

  const go = (path: string) => {
    onClose();
    void navigate(path);
  };

  return (
    <div>
      {/* Header */}
      <div className="border-b border-border bg-surface p-6">
        {editingName ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              value={nameDraft}
            />
            <Button onClick={() => void saveName()} size="icon" variant="primary">
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            className="text-left"
            onClick={() => setEditingName(true)}
            title="Click to rename"
            type="button"
          >
            <h2 className="font-display text-xl font-semibold text-ink hover:underline">
              {contact.full_name}
            </h2>
          </button>
        )}

        {(contact.job_title || contact.organisation) && (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-secondary">
            {contact.job_title}
            {contact.job_title && contact.organisation && ' · '}
            {contact.organisation && (
              <>
                <Building2 className="h-3.5 w-3.5" />
                {contact.organisation.name}
              </>
            )}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {contact.phone_e164 && (
            <>
              <Action href={`tel:${contact.phone_e164}`} icon={Phone} label="Call" />
              <Action
                href={`https://wa.me/${contact.phone_e164.replace('+', '')}`}
                icon={MessageCircle}
                label="WhatsApp"
              />
            </>
          )}
          {contact.email && <Action href={`mailto:${contact.email}`} icon={Mail} label="Email" />}
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-6 text-sm">
        {contact.email && <Fact label="Email">{contact.email}</Fact>}
        {contact.phone_e164 && <Fact label="Phone">{formatPhoneDisplay(contact.phone_e164)}</Fact>}
        {contact.location && <Fact label="Location">{contact.location}</Fact>}
        <Fact label="Source">{contact.source ?? '—'}</Fact>
        <Fact label="Added">{formatRelative(contact.created_at)}</Fact>
      </div>

      {/* Footprint — everything this person is, across the app. This is the
          payoff of one spine: a lead who is also a candidate shows both. */}
      {footprint && (
        <div className="space-y-3 border-b border-border p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Across the business
          </h3>

          {footprint.leads.length === 0 &&
            footprint.applications.length === 0 &&
            footprint.documents.length === 0 &&
            !footprint.candidateId && (
              <p className="text-sm text-ink-muted">No linked records yet.</p>
            )}

          {footprint.leads.map((l) => (
            <LinkRow
              icon={Target}
              key={l.id}
              onClick={() => go(`/leads?lead=${l.id}`)}
              right={l.value_ugx > 0 ? <Money compact value={BigInt(l.value_ugx)} /> : null}
              subtitle={l.service_interest ?? 'Lead'}
              title={`Lead · ${l.stage.replace('_', ' ')}`}
            />
          ))}

          {footprint.candidateId && (
            <LinkRow
              icon={UserRound}
              onClick={() => go(`/talent?candidate=${footprint.candidateId!}`)}
              subtitle={
                footprint.applications.length > 0
                  ? `${footprint.applications.length} application${footprint.applications.length > 1 ? 's' : ''}`
                  : 'In the talent pool'
              }
              title="Candidate profile"
            />
          )}

          {footprint.documents.map((d) => (
            <LinkRow
              icon={Receipt}
              key={d.id}
              onClick={() => go(`/finance/${d.id}`)}
              right={<Money compact value={BigInt(d.total_ugx)} />}
              subtitle={d.status}
              title={`${d.type} ${d.number ?? '(draft)'}`}
            />
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="p-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Activity
        </h3>
        <div className="mb-4 flex gap-2">
          <Textarea
            className="min-h-0"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            value={note}
          />
          <Button
            className="shrink-0 self-end"
            disabled={!note.trim() || addNote.isPending}
            onClick={() => void submitNote()}
            size="icon"
            variant="primary"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <ol className="space-y-3">
          {(timeline ?? []).map((a) => (
            <li className="flex gap-3" key={a.id}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
              <div className="min-w-0">
                <p className="whitespace-pre-line text-sm text-ink">{a.body}</p>
                <p className="text-xs text-ink-muted">{formatDateTime(a.occurred_at)}</p>
              </div>
            </li>
          ))}
          {(timeline ?? []).length === 0 && (
            <li className="text-sm text-ink-muted">No activity yet.</li>
          )}
        </ol>
      </div>

      <DangerZone>
        <Button onClick={() => setEraseOpen(true)} size="sm" variant="secondary">
          <UserX className="mr-1 h-3.5 w-3.5 text-danger" />
          Erase this person
        </Button>
      </DangerZone>
      <ErasePersonDialog
        contactId={contact.id}
        onErased={onClose}
        onOpenChange={setEraseOpen}
        open={eraseOpen}
      />
    </div>
  );
}

function Action({ href, icon: Icon, label }: { href: string; icon: typeof Phone; label: string }) {
  return (
    <a
      className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-sunken"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-muted">{label}</p>
      <div className="mt-0.5 truncate text-ink">{children}</div>
    </div>
  );
}

function LinkRow({
  icon: Icon,
  title,
  subtitle,
  right,
  onClick,
}: {
  icon: typeof Target;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-control border border-border px-3 py-2 text-left transition-colors hover:border-border-strong"
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium capitalize text-ink">{title}</span>
        <span className="block truncate text-xs capitalize text-ink-muted">{subtitle}</span>
      </span>
      {right}
    </button>
  );
}
