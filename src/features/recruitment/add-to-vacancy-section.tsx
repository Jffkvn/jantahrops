import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { assignableVacancies, formatAssignableVacancyLabel } from './recruitment-meta';
import { useAddContactToVacancy, useVacanciesList } from './use-recruitment';

/**
 * Reusable sidebar block that lets recruiters assign any contact (from a Lead
 * or Contact profile) directly to a vacancy — including closed roles — creating
 * their candidate profile automatically if they aren't in the Talent Pool yet.
 */
export function AddContactToVacancySection({
  contactId,
  source,
  notes,
}: {
  contactId: string;
  source?: string | undefined;
  notes?: string | null | undefined;
}) {
  const [vacancyId, setVacancyId] = useState('');
  const {
    data: vacanciesData,
    isLoading: vacanciesLoading,
    isError: vacanciesError,
  } = useVacanciesList({ status: 'all', pageSize: 100 });
  const addContact = useAddContactToVacancy();

  const vacancies = useMemo(
    () => assignableVacancies(vacanciesData?.rows ?? []),
    [vacanciesData],
  );

  const handleAdd = async () => {
    if (!vacancyId) return;
    try {
      const result = await addContact.mutateAsync({
        contactId,
        vacancyId,
        source,
        notes,
      });
      if (result.application === null) {
        toast.info('Already applied to this vacancy');
      } else {
        toast.success('Added to vacancy');
        setVacancyId('');
      }
    } catch {
      toast.error('Could not add candidate to vacancy');
    }
  };

  return (
    <div className="border-b border-border p-6">
      <label className="mb-1.5 block text-xs font-semibold text-ink-secondary">
        Add to a vacancy
      </label>
      <div className="flex gap-2">
        <Select onValueChange={setVacancyId} value={vacancyId}>
          <SelectTrigger aria-label="Choose a vacancy" className="flex-1">
            <SelectValue placeholder="Choose a vacancy" />
          </SelectTrigger>
          <SelectContent>
            {vacanciesLoading ? (
              <div className="px-2 py-3 text-center text-xs text-ink-muted">
                Loading vacancies…
              </div>
            ) : vacanciesError ? (
              <div className="px-2 py-3 text-center text-xs text-danger">
                Could not load vacancies.
              </div>
            ) : vacancies.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-ink-muted">
                No vacancies available.
              </div>
            ) : (
              vacancies.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {formatAssignableVacancyLabel(v)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          disabled={!vacancyId || addContact.isPending}
          onClick={() => void handleAdd()}
          variant="primary"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">
        Includes closed roles. Adds this person to the Talent Pool automatically if needed.
      </p>
    </div>
  );
}
