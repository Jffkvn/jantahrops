import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { errorMessage } from './privacy-api';
import { useErasePerson, useErasurePreview } from './use-privacy';

/** Typed to confirm, so an erasure is never one stray click away. */
export const ERASE_CONFIRM_WORD = 'ERASE';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Erase a person and everything held about them: the right to deletion under
 * the Uganda Data Protection and Privacy Act 2019. Also the way to clear test
 * records completely.
 */
export function ErasePersonDialog({
  contactId,
  open,
  onOpenChange,
  onErased,
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onErased: () => void;
}) {
  const { data: preview, isLoading, error } = useErasurePreview(contactId, open);
  const erase = useErasePerson();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const blocked = (preview?.blockers.length ?? 0) > 0;
  const canErase =
    Boolean(preview) && !blocked && typed.trim() === ERASE_CONFIRM_WORD && !erase.isPending;

  const items: string[] = preview
    ? [
        'Their contact record and everything on their timeline',
        ...(preview.leads > 0
          ? [`${plural(preview.leads, 'lead')}, with history, signals and tasks`]
          : []),
        ...(preview.is_candidate
          ? [
              `Their candidate profile${preview.applications > 0 ? ` and ${plural(preview.applications, 'application')} with interviews` : ''}`,
            ]
          : []),
        ...(preview.files.length > 0
          ? [`${plural(preview.files.length, 'stored file')} (CVs and documents)`]
          : []),
        ...(preview.submissions > 0
          ? [`${plural(preview.submissions, 'website submission')} with their raw form data`]
          : []),
      ]
    : [];

  const confirm = async () => {
    if (!preview) return;
    try {
      await erase.mutateAsync({ contactId, files: preview.files });
      toast.success(`${preview.full_name}'s data has been erased`);
      onOpenChange(false);
      onErased();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="text-danger h-4 w-4" />
            Erase {preview?.full_name ?? 'this person'}
          </DialogTitle>
          <DialogDescription>
            Use this when someone asks for their data to be deleted, or to clear test records. It
            can't be undone.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {error && <p className="text-danger text-sm">{errorMessage(error)}</p>}

        {preview && blocked && (
          <div className="rounded-control border-danger/30 bg-danger/5 text-ink flex gap-2 border p-3 text-sm">
            <AlertTriangle className="text-danger mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This person is linked to {preview.blockers.join(', ')}. Those are records the business
              must keep, so they can't be erased until those links are removed.
            </p>
          </div>
        )}

        {preview && !blocked && (
          <>
            <div className="text-sm">
              <p className="text-ink-secondary mb-2">This permanently deletes:</p>
              <ul className="text-ink list-disc space-y-1 pl-5">
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <p className="text-ink-muted mt-3 text-xs">
                A note that a record was erased, with no personal details, is kept for
                accountability.
              </p>
            </div>
            <label className="text-ink-secondary block text-sm" htmlFor="erase-confirm">
              Type <span className="text-ink font-mono font-semibold">{ERASE_CONFIRM_WORD}</span> to
              confirm
            </label>
            <Input
              autoComplete="off"
              id="erase-confirm"
              onChange={(e) => setTyped(e.target.value)}
              placeholder={ERASE_CONFIRM_WORD}
              value={typed}
            />
          </>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={!canErase} onClick={() => void confirm()} variant="danger">
            {erase.isPending ? 'Erasing…' : 'Erase permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
