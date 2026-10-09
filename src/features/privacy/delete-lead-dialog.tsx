import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { errorMessage } from './privacy-api';
import { useDeleteLead } from './use-privacy';

export function DeleteLeadDialog({
  leadId,
  personName,
  open,
  onOpenChange,
  onDeleted,
}: {
  leadId: string;
  personName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const del = useDeleteLead();

  const confirm = async () => {
    try {
      await del.mutateAsync(leadId);
      toast.success('Lead deleted');
      onOpenChange(false);
      onDeleted();
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
            Delete this lead?
          </DialogTitle>
          <DialogDescription>
            The lead, its activity history, signals, tasks and the website submission that created
            it are deleted permanently. {personName}'s contact record stays. To remove the person
            entirely, use "Erase this person" on their contact page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={del.isPending} onClick={() => void confirm()} variant="danger">
            {del.isPending ? 'Deleting…' : 'Delete lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
