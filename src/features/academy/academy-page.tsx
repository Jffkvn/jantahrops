import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BookOpen, CalendarDays, GraduationCap, Plus, Search, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useCohorts, useCourses } from './use-academy';
import { CourseSheet } from './course-sheet';
import { CohortSheet } from './cohort-sheet';
import { CohortDetailSheet } from './cohort-detail-sheet';
import {
  COHORT_STATUS_LABELS,
  COHORT_STATUS_TONE,
  DELIVERY_LABELS,
} from './academy-meta';
import type { CourseWithStats, CohortWithRelations } from './academy-api';
import type { CohortStatus } from '@/types/database';

export function AcademyPage() {
  const [tab, setTab] = useState('cohorts');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [scope, setScope] = useState<'live' | 'all' | CohortStatus>('live');
  const [courseSheet, setCourseSheet] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [cohortSheetOpen, setCohortSheetOpen] = useState(false);
  const [openCohortId, setOpenCohortId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: ?cohort=<id> opens a roster.
  useEffect(() => {
    const c = searchParams.get('cohort');
    if (c) {
      setOpenCohortId(c);
      searchParams.delete('cohort');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const cohortParams = useMemo(() => ({ scope }), [scope]);
  const { data: cohorts, isLoading: cohortsLoading } = useCohorts(cohortParams);
  const { data: courses, isLoading: coursesLoading } = useCourses(debounced);

  const hasCourses = (courses?.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setCourseSheet({ open: true, id: null })} variant="secondary">
              <BookOpen className="mr-1.5 h-4 w-4" />
              New course
            </Button>
            <Button
              disabled={!hasCourses}
              onClick={() => setCohortSheetOpen(true)}
              title={hasCourses ? undefined : 'Create a course first'}
              variant="primary"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New cohort
            </Button>
          </div>
        }
        description="What you teach, when you run it, and who is on it."
        title="Academy"
      />

      <Tabs onValueChange={setTab} value={tab}>
        <TabsList className="mb-4">
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
        </TabsList>

        <TabsContent value="cohorts">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select onValueChange={(v) => setScope(v as typeof scope)} value={scope}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="all">All</SelectItem>
                {(Object.keys(COHORT_STATUS_LABELS) as CohortStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {COHORT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {cohortsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton className="h-24 w-full rounded-card" key={i} />
              ))}
            </div>
          ) : (cohorts?.length ?? 0) === 0 ? (
            <EmptyState
              action={
                hasCourses ? (
                  <Button onClick={() => setCohortSheetOpen(true)} variant="primary">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New cohort
                  </Button>
                ) : (
                  <Button onClick={() => setCourseSheet({ open: true, id: null })} variant="primary">
                    <BookOpen className="mr-1.5 h-4 w-4" />
                    Create your first course
                  </Button>
                )
              }
              description={
                hasCourses
                  ? 'No live cohorts. A cohort is one run of a course — its dates, its seats and its register.'
                  : 'Start with a course: what you teach and what it costs. Then schedule a cohort to run it.'
              }
              headline={hasCourses ? 'No cohorts running' : 'Nothing set up yet'}
              icon={<GraduationCap className="h-6 w-6" />}
            />
          ) : (
            <ul className="space-y-2">
              {(cohorts ?? []).map((cohort) => (
                <CohortCard
                  cohort={cohort}
                  key={cohort.id}
                  onOpen={() => setOpenCohortId(cohort.id)}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="courses">
          <div className="relative mb-4 min-w-[200px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input
              className="pl-9"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses…"
              value={search}
            />
          </div>

          {coursesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton className="h-20 w-full rounded-card" key={i} />
              ))}
            </div>
          ) : (courses?.length ?? 0) === 0 ? (
            <EmptyState
              action={
                <Button onClick={() => setCourseSheet({ open: true, id: null })} variant="primary">
                  <BookOpen className="mr-1.5 h-4 w-4" />
                  New course
                </Button>
              }
              description={
                debounced
                  ? 'No courses match that search.'
                  : 'A course is the thing you teach — its outline, its price, and how often it has to be retaken. You run it as many cohorts.'
              }
              headline={debounced ? 'Nothing found' : 'No courses yet'}
              icon={<BookOpen className="h-6 w-6" />}
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {(courses ?? []).map((course) => (
                <CourseRow
                  course={course}
                  key={course.id}
                  onEdit={() => setCourseSheet({ open: true, id: course.id })}
                />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <CourseSheet
        courseId={courseSheet.id}
        onOpenChange={(o) => setCourseSheet({ open: o, id: o ? courseSheet.id : null })}
        open={courseSheet.open}
      />
      <CohortSheet onOpenChange={setCohortSheetOpen} open={cohortSheetOpen} />
      <CohortDetailSheet cohortId={openCohortId} onOpenChange={(o) => !o && setOpenCohortId(null)} />
    </div>
  );
}

function CohortCard({ cohort, onOpen }: { cohort: CohortWithRelations; onOpen: () => void }) {
  const s = cohort.summary;
  const full = s?.seats_left === 0;

  return (
    <li>
      <button
        className="w-full rounded-card border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong"
        onClick={onOpen}
        type="button"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium text-ink">{cohort.name}</p>
              <span
                className={cn(
                  'rounded-pill px-2 py-0.5 text-[11px]',
                  COHORT_STATUS_TONE[cohort.status],
                )}
              >
                {COHORT_STATUS_LABELS[cohort.status]}
              </span>
              <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-muted">
                {DELIVERY_LABELS[cohort.delivery_mode]}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
              {cohort.course && <span>{cohort.course.title}</span>}
              {cohort.start_date && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 shrink-0" />
                  {formatDate(cohort.start_date)}
                  {cohort.end_date && ` – ${formatDate(cohort.end_date)}`}
                </span>
              )}
              {cohort.facilitator?.full_name && <span>{cohort.facilitator.full_name}</span>}
              {cohort.location && <span>{cohort.location}</span>}
            </p>
          </div>

          {cohort.course && cohort.course.price_ugx > 0 && (
            <div className="shrink-0 text-right">
              <Money className="num text-sm" value={BigInt(cohort.course.price_ugx)} />
              <p className="text-[11px] text-ink-muted">per seat</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2.5 text-xs">
          <span className="flex items-center gap-1 text-ink-secondary">
            <Users className="h-3 w-3 shrink-0" />
            <span className="num">{s?.enrolled ?? 0}</span> enrolled
            {cohort.capacity !== null && (
              <span className={cn('num', full ? 'font-medium text-warning' : 'text-ink-muted')}>
                {' '}
                / {cohort.capacity}
              </span>
            )}
          </span>

          <span className="num text-ink-muted">
            {s?.entitled ?? 0} paid
          </span>

          {/* Seats held that nobody has been billed for — the line that costs
              money, so it gets the amber. */}
          {(s?.unbilled ?? 0) > 0 && (
            <span className="num font-medium text-warning">{s?.unbilled} not yet invoiced</span>
          )}
        </div>
      </button>
    </li>
  );
}

function CourseRow({ course, onEdit }: { course: CourseWithStats; onEdit: () => void }) {
  return (
    <li>
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken/40"
        onClick={onEdit}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-ink">{course.title}</p>
            {course.retake_interval_months !== null && (
              <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-muted">
                retake every {course.retake_interval_months}m
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-secondary">
            {course.duration_label && <span>{course.duration_label}</span>}
            <span className="num">
              {course.cohortCount} {course.cohortCount === 1 ? 'cohort' : 'cohorts'}
            </span>
            {course.upcomingCohort && (
              <span className="text-ink-muted">
                next: {course.upcomingCohort.name}
                {course.upcomingCohort.start_date &&
                  ` · ${formatDate(course.upcomingCohort.start_date)}`}
              </span>
            )}
          </p>
        </div>
        {course.price_ugx > 0 && (
          <Money className="num shrink-0 text-sm" value={BigInt(course.price_ugx)} />
        )}
      </button>
    </li>
  );
}
