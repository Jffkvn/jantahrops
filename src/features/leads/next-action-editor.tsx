import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toDateInputValue, dateInputToISO } from '@/lib/format';
import { useUpdateLead } from './use-leads';

/**
 * Sets or clears a lead's next follow-up: a date, an optional note. This is the
 * field the whole Day View and (later) the reminders hang off, so it is a
 * first-class control on the lead, not a buried option.
 *
 * Dates are stored at 09:00 EAT (see dateInputToISO) — "due today" should mean
 * the start of the working day, not midnight.
 */
export function NextActionEditor({
  leadId,
  nextActionAt,
  nextActionNote,
}: {
  leadId: string;
  nextActionAt: string | null;
  nextActionNote: string | null;
}) {
  const update = useUpdateLead(leadId);
  const [date, setDate] = useState(toDateInputValue(nextActionAt));
  const [note, setNote] = useState(nextActionNote ?? '');

  const dirty =
    date !== toDateInputValue(nextActionAt) || note !== (nextActionNote ?? '');

  const save = () => {
    update.mutate({
      next_action_at: dateInputToISO(date),
      next_action_note: note.trim() || null,
    });
  };

  const clear = () => {
    setDate('');
    setNote('');
    update.mutate({ next_action_at: null, next_action_note: null });
  };

  const presetIn = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDate(toDateInputValue(d));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          className="flex-1"
          onChange={(e) => setDate(e.target.value)}
          type="date"
          value={date}
        />
        {nextActionAt && (
          <Button aria-label="Clear follow-up" onClick={clear} size="icon" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Preset label="Tomorrow" onClick={() => presetIn(1)} />
        <Preset label="In 3 days" onClick={() => presetIn(3)} />
        <Preset label="Next week" onClick={() => presetIn(7)} />
      </div>

      <Input
        onChange={(e) => setNote(e.target.value)}
        placeholder="What's the next step? (optional)"
        value={note}
      />

      {dirty && (
        <Button
          className="w-full"
          disabled={update.isPending}
          onClick={save}
          size="sm"
          variant="secondary"
        >
          <Check className="mr-1.5 h-4 w-4" />
          Save follow-up
        </Button>
      )}
    </div>
  );
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="rounded-pill border border-border px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:border-border-strong hover:text-ink"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
