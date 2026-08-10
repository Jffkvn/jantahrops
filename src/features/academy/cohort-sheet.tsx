import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTeam } from '@/features/team/use-team';
import { useCohorts, useCourses, useCreateCohort } from './use-academy';
import { COHORT_STATUS_LABELS, DELIVERY_LABELS } from './academy-meta';
import type { CohortStatus, DeliveryMode } from '@/types/database';

const NONE = '__none__';

export function CohortSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: courses } = useCourses();
  const { data: team } = useTeam();
  const createCohort = useCreateCohort();
  // Used only to suggest a name like "Cohort 3".
  const { data: existing } = useCohorts({ scope: 'all' });

  const [courseId, setCourseId] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mode, setMode] = useState<DeliveryMode>('in_person');
  const [capacity, setCapacity] = useState('');
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [facilitator, setFacilitator] = useState(NONE);
  const [status, setStatus] = useState<CohortStatus>('planned');
  const [error, setError] = useState<string | null>(null);

  const pickCourse = (id: string) => {
    setCourseId(id);
    // Suggest the next run number for this course, so the common case is one
    // click. Still fully editable.
    if (!name.trim()) {
      const runs = (existing ?? []).filter((c) => c.course_id === id).length;
      setName(`Cohort ${runs + 1}`);
    }
  };

  const submit = async () => {
    if (!courseId) {
      setError('Pick the course this cohort runs.');
      return;
    }
    if (!name.trim()) {
      setError('Give the cohort a name.');
      return;
    }
    const cap = capacity.trim() ? Number(capacity) : null;
    if (capacity.trim() && (!Number.isInteger(cap) || cap! < 1)) {
      setError('Capacity must be a whole number of seats.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('The end date is before the start date.');
      return;
    }
    setError(null);

    try {
      await createCohort.mutateAsync({
        course_id: courseId,
        name,
        start_date: startDate || null,
        end_date: endDate || null,
        delivery_mode: mode,
        capacity: cap,
        location: location.trim() || null,
        meeting_url: meetingUrl.trim() || null,
        facilitator_id: facilitator === NONE ? null : facilitator,
        status,
      });
      toast.success('Cohort created');
      setCourseId('');
      setName('');
      setStartDate('');
      setEndDate('');
      setCapacity('');
      setLocation('');
      setMeetingUrl('');
      onOpenChange(false);
    } catch {
      setError('Could not create the cohort. Please try again.');
    }
  };

  const online = mode === 'live_online' || mode === 'hybrid';
  const inPerson = mode === 'in_person' || mode === 'hybrid';

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>New cohort</SheetTitle>
          <SheetDescription>
            One run of a course — its dates, its seats and its register.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {error && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              Course<span className="text-danger"> *</span>
            </Label>
            <Select onValueChange={pickCourse} value={courseId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a course" />
              </SelectTrigger>
              <SelectContent>
                {(courses ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co-name">
              Name<span className="text-danger"> *</span>
            </Label>
            <Input
              id="co-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="Cohort 1"
              value={name}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="co-start">Starts</Label>
              <Input
                id="co-start"
                onChange={(e) => setStartDate(e.target.value)}
                type="date"
                value={startDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-end">Ends</Label>
              <Input
                id="co-end"
                onChange={(e) => setEndDate(e.target.value)}
                type="date"
                value={endDate}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Delivery</Label>
              <Select onValueChange={(v) => setMode(v as DeliveryMode)} value={mode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DELIVERY_LABELS) as DeliveryMode[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {DELIVERY_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-cap">Seats</Label>
              <Input
                className="num"
                id="co-cap"
                inputMode="numeric"
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Uncapped"
                value={capacity}
              />
            </div>
          </div>

          {/* Only ask for the field that matches the delivery mode. */}
          {inPerson && (
            <div className="space-y-1.5">
              <Label htmlFor="co-loc">Venue</Label>
              <Input
                id="co-loc"
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Nakawa training room"
                value={location}
              />
            </div>
          )}

          {online && (
            <div className="space-y-1.5">
              <Label htmlFor="co-url">Meeting link</Label>
              <Input
                id="co-url"
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/…"
                value={meetingUrl}
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Facilitator</Label>
              <Select onValueChange={setFacilitator} value={facilitator}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {(team ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select onValueChange={(v) => setStatus(v as CohortStatus)} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COHORT_STATUS_LABELS) as CohortStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {COHORT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={createCohort.isPending}
              onClick={() => void submit()}
              type="button"
              variant="primary"
            >
              {createCohort.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create cohort
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
