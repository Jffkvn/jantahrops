import { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { formatUGX, parseUGX } from '@/lib/format';
import { useCourse, useCreateCourse, useUpdateCourse } from './use-academy';
import { slugify } from './academy-api';

export function CourseSheet({
  courseId,
  open,
  onOpenChange,
}: {
  courseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: course } = useCourse(open ? courseId : null);
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const isEdit = courseId !== null;

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');
  const [corporate, setCorporate] = useState('');
  const [retake, setRetake] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (course) {
      setTitle(course.title);
      setSummary(course.summary ?? '');
      setDuration(course.duration_label ?? '');
      setPrice(String(course.price_ugx || ''));
      setCorporate(course.corporate_price_ugx === null ? '' : String(course.corporate_price_ugx));
      setRetake(course.retake_interval_months === null ? '' : String(course.retake_interval_months));
    } else if (!courseId) {
      setTitle('');
      setSummary('');
      setDuration('');
      setPrice('');
      setCorporate('');
      setRetake('');
    }
    setError(null);
  }, [open, course, courseId]);

  const submit = async () => {
    if (!title.trim()) {
      setError('Give the course a title.');
      return;
    }
    const priceUgx = price.trim() ? parseUGX(price) : 0n;
    if (priceUgx === null) {
      setError('Enter the price as a plain number, e.g. 800,000.');
      return;
    }
    const corporateUgx = corporate.trim() ? parseUGX(corporate) : null;
    if (corporate.trim() && corporateUgx === null) {
      setError('Enter the corporate price as a plain number.');
      return;
    }
    const retakeMonths = retake.trim() ? Number(retake) : null;
    if (retake.trim() && (!Number.isInteger(retakeMonths) || retakeMonths! < 1 || retakeMonths! > 120)) {
      setError('Retake interval must be a whole number of months, 1–120.');
      return;
    }
    setError(null);

    const payload = {
      title,
      summary: summary.trim() || null,
      duration_label: duration.trim() || null,
      price_ugx: Number(priceUgx),
      corporate_price_ugx: corporateUgx === null ? null : Number(corporateUgx),
      retake_interval_months: retakeMonths,
    };

    try {
      if (isEdit && courseId) {
        await updateCourse.mutateAsync({ id: courseId, patch: payload });
        toast.success('Course updated');
      } else {
        await createCourse.mutateAsync(payload);
        toast.success('Course created');
      }
      onOpenChange(false);
    } catch (e) {
      // The slug is unique; two courses called the same thing collide there.
      const dup = e && typeof e === 'object' && 'code' in e && e.code === '23505';
      setError(
        dup
          ? 'A course with that title already exists — give this one a distinct name.'
          : 'Could not save the course. Please try again.',
      );
    }
  };

  const pricePreview = price.trim() ? parseUGX(price) : null;
  const pending = createCourse.isPending || updateCourse.isPending;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit course' : 'New course'}</SheetTitle>
          <SheetDescription>
            The thing you teach. You run it as many cohorts — each with its own dates, seats
            and register.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {error && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="c-title">
              Title<span className="text-danger"> *</span>
            </Label>
            <Input
              id="c-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Labour Law for Line Managers"
              value={title}
            />
            {!isEdit && title.trim() && (
              <p className="text-xs text-ink-muted">
                Web address: <span className="num">/{slugify(title)}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-summary">Summary</Label>
            <Textarea
              id="c-summary"
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Who it's for and what they'll be able to do afterwards."
              rows={3}
              value={summary}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-duration">Duration</Label>
            <Input
              id="c-duration"
              onChange={(e) => setDuration(e.target.value)}
              placeholder="3 days"
              value={duration}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-price">Price per seat</Label>
              <Input
                className="num"
                id="c-price"
                inputMode="numeric"
                onChange={(e) => setPrice(e.target.value)}
                placeholder="800,000"
                value={price}
              />
              {pricePreview !== null && pricePreview > 0n && (
                <p className="text-xs text-ink-muted">{formatUGX(pricePreview)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-corp">Corporate rate</Label>
              <Input
                className="num"
                id="c-corp"
                inputMode="numeric"
                onChange={(e) => setCorporate(e.target.value)}
                placeholder="Optional"
                value={corporate}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-retake">Retake interval (months)</Label>
            <Input
              className="num"
              id="c-retake"
              inputMode="numeric"
              onChange={(e) => setRetake(e.target.value)}
              placeholder="12"
              value={retake}
            />
            <p className="text-xs text-ink-muted">
              For compliance training that expires. Leave blank if the certificate does not
              lapse — otherwise this is what tells you whose is due for renewal.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => void submit()} type="button" variant="primary">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save course' : 'Create course'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
