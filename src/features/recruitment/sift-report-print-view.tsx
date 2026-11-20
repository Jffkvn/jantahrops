import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, ExternalLink, FileText, MapPin, Phone, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { formatPhoneDisplay } from '@/lib/phone';
import { useCompanyProfile } from '@/features/finance/use-finance';
import { MATCH_TIER_META } from './ai-matching-schema';
import {
  SIFT_BUCKET_META,
  siftVacancyApplications,
  type SiftedApplicant,
} from './applicant-sift';
import type { ResolvedApplicationDocuments } from './recruitment-api';
import { stageMeta } from './recruitment-meta';
import { useApplicationDocuments, useApplications, useVacancy } from './use-recruitment';

const REPORT_LINK_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * Uncongested Executive Applicant Sift Report for the Head of HR, rendered
 * without the app shell for clean A4 Print / Save as PDF with live 14-day
 * clickable CV and Cover Letter links.
 */
export function SiftReportPrintView() {
  const params = useParams<{ vacancyId: string }>();
  const vacancyId = params.vacancyId ?? '';
  const navigate = useNavigate();

  const { data: vacancy, isLoading: vacancyLoading } = useVacancy(vacancyId);
  const { data: applications, isLoading: appsLoading } = useApplications(vacancyId);
  const { data: company, isLoading: companyLoading } = useCompanyProfile();

  const [includeMostQualified, setIncludeMostQualified] = useState(true);
  const [includeOverqualified, setIncludeOverqualified] = useState(true);
  const [includeTransferable, setIncludeTransferable] = useState(true);
  const [includeUnqualified, setIncludeUnqualified] = useState(true);
  const [excludeRejected, setExcludeRejected] = useState(true);

  const scopedApps = useMemo(() => {
    const all = applications ?? [];
    return excludeRejected ? all.filter((a) => a.stage !== 'rejected') : all;
  }, [applications, excludeRejected]);

  const { data: docs, isLoading: docsLoading } = useApplicationDocuments(
    vacancyId,
    applications,
    REPORT_LINK_TTL_SECONDS,
  );

  const siftGroups = useMemo(
    () => siftVacancyApplications(scopedApps, vacancy),
    [scopedApps, vacancy],
  );

  const opsOrigin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://ops.jantahr.com';

  if (vacancyLoading || appsLoading || companyLoading || !vacancy || !company) {
    return (
      <div className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-4xl px-4 print:max-w-none print:px-0">
        {/* Controls Toolbar (hidden in PDF / Print) */}
        <div className="mb-6 space-y-3 rounded-lg border border-gray-300 bg-white p-4 shadow-sm print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => void navigate(`/recruitment/${vacancyId}`)}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to Vacancy
              </Button>
              <span className="text-sm text-gray-600">
                {docsLoading
                  ? 'Signing 14-day CV & Cover Letter links…'
                  : 'All 14-day clickable CV & Cover Letter links ready.'}
              </span>
            </div>

            <Button disabled={docsLoading} onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" />
              Print / Save as PDF
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-gray-200 pt-3 text-xs font-medium text-gray-700">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={includeMostQualified}
                onCheckedChange={(v) => setIncludeMostQualified(Boolean(v))}
              />
              Most Qualified ({siftGroups.most_qualified.length})
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={includeOverqualified}
                onCheckedChange={(v) => setIncludeOverqualified(Boolean(v))}
              />
              Overqualified ({siftGroups.overqualified.length})
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={includeTransferable}
                onCheckedChange={(v) => setIncludeTransferable(Boolean(v))}
              />
              Transferable / Borderline ({siftGroups.transferable.length})
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={includeUnqualified}
                onCheckedChange={(v) => setIncludeUnqualified(Boolean(v))}
              />
              Does Not Qualify ({siftGroups.unqualified.length})
            </label>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-gray-600">
              <Checkbox
                checked={excludeRejected}
                onCheckedChange={(v) => setExcludeRejected(Boolean(v))}
              />
              Exclude Rejected
            </label>
          </div>
        </div>

        {/* Printable Briefing Document */}
        <div className="sheet border-t-4 border-brand-teal bg-white p-10 text-black shadow-xl print:p-0 print:shadow-none">
          {/* Cover / Executive Header */}
          <header className="flex items-start justify-between border-b border-gray-300 pb-6">
            <div>
              <JantaHrBrandLogo />
              <div className="mt-4">
                <span className="inline-block rounded bg-brand-teal-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-teal">
                  Executive Applicant Sift Briefing
                </span>
              </div>
              <h1 className="font-display mt-2 text-2xl font-bold text-black">{vacancy.title}</h1>
              <p className="mt-0.5 text-sm font-medium text-gray-700">
                {vacancy.organisation?.name ?? 'Unassigned client'}
                {vacancy.location ? ` · ${vacancy.location}` : ''}
              </p>
              {vacancy.summary && (
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-gray-600">
                  {vacancy.summary}
                </p>
              )}
            </div>
            <div className="text-right text-xs text-gray-700">
              <p className="text-sm font-semibold text-brand-teal-dark">{company.legal_name}</p>
              {company.email && <p>{company.email}</p>}
              {company.phone && <p>{company.phone}</p>}
              <p className="mt-2 font-medium text-black">Prepared {formatDate(new Date())}</p>
              <p>{scopedApps.length} applicants analyzed</p>
              <a
                className="mt-2.5 inline-flex items-center gap-1 rounded border border-brand-teal bg-brand-teal-soft px-2.5 py-1 text-xs font-semibold text-brand-teal-dark hover:opacity-90"
                href={`${opsOrigin}/recruitment/${vacancy.id}`}
                rel="noreferrer"
                target="_blank"
              >
                Open Vacancy in JantaHR Ops
                <ExternalLink className="h-3 w-3 text-brand-teal" />
              </a>
            </div>
          </header>

          {/* 4-Bucket Summary Strip */}
          <div className="mt-6 grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
                Most Qualified
              </p>
              <p className="font-display mt-1 text-2xl font-bold tabular-nums text-emerald-950">
                {siftGroups.most_qualified.length}
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-800">0–3 yrs HR · In range</p>
            </div>

            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900">
                Overqualified
              </p>
              <p className="font-display mt-1 text-2xl font-bold tabular-nums text-sky-950">
                {siftGroups.overqualified.length}
              </p>
              <p className="mt-0.5 text-[11px] text-sky-800">4+ yrs HR / Manager+</p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                Transferable
              </p>
              <p className="font-display mt-1 text-2xl font-bold tabular-nums text-amber-950">
                {siftGroups.transferable.length}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800">Admin / Gaps to check</p>
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-900">
                Does Not Qualify
              </p>
              <p className="font-display mt-1 text-2xl font-bold tabular-nums text-rose-950">
                {siftGroups.unqualified.length}
              </p>
              <p className="mt-0.5 text-[11px] text-rose-800">Auto-sifted out</p>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-gray-500">
            CV links embedded in this report remain clickable for 14 days. Candidate and JantaHR Ops
            links open directly to each applicant&apos;s full profile and files inside JantaHR Ops
            for team members with Ops logins.
          </p>

          {/* Section A: Most Qualified */}
          {includeMostQualified && (
            <section className="mt-8">
              <div className="border-b-2 border-brand-teal pb-2">
                <h2 className="font-display text-lg font-bold text-brand-teal-dark">
                  Section A — {SIFT_BUCKET_META.most_qualified.label} (
                  {siftGroups.most_qualified.length})
                </h2>
                <p className="text-xs text-gray-600">
                  {SIFT_BUCKET_META.most_qualified.description}. Recommended first group for
                  interviews.
                </p>
              </div>

              {siftGroups.most_qualified.length === 0 ? (
                <p className="py-4 text-xs text-gray-600">
                  No applicants matched the target range criteria.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {siftGroups.most_qualified.map((item) => (
                    <ReportBriefCard
                      accent="emerald"
                      briefHeading="Why Qualified (In Hindsight)"
                      docs={docs}
                      item={item}
                      key={item.application.id}
                      opsOrigin={opsOrigin}
                      vacancyId={vacancy.id}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section B: Overqualified */}
          {includeOverqualified && (
            <section className="mt-10">
              <div className="border-b-2 border-sky-600 pb-2">
                <h2 className="font-display text-lg font-bold text-black">
                  Section B — {SIFT_BUCKET_META.overqualified.label} (
                  {siftGroups.overqualified.length})
                </h2>
                <p className="text-xs text-gray-600">
                  {SIFT_BUCKET_META.overqualified.description}. Capable of the work immediately,
                  but verify salary expectations and long-term retention risk.
                </p>
              </div>

              {siftGroups.overqualified.length === 0 ? (
                <p className="py-4 text-xs text-gray-600">
                  No overqualified HR applicants flagged.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {siftGroups.overqualified.map((item) => (
                    <ReportBriefCard
                      accent="sky"
                      briefHeading="Why Overqualified (In Hindsight)"
                      docs={docs}
                      item={item}
                      key={item.application.id}
                      opsOrigin={opsOrigin}
                      vacancyId={vacancy.id}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section C: Transferable / Borderline Compact Table */}
          {includeTransferable && (
            <section className="mt-10">
              <div className="border-b-2 border-amber-500 pb-2">
                <h2 className="font-display text-lg font-bold text-black">
                  Section C — {SIFT_BUCKET_META.transferable.label} (
                  {siftGroups.transferable.length})
                </h2>
                <p className="text-xs text-gray-600">
                  {SIFT_BUCKET_META.transferable.description}. Reserve list if additional interview
                  slots open.
                </p>
              </div>

              <CompactAppendixTable
                docs={docs}
                emptyMessage="No transferable or borderline candidates in this report."
                items={siftGroups.transferable}
                opsOrigin={opsOrigin}
                reasonHeader="Hindsight Summary (Why Transferable / To Verify)"
                vacancyId={vacancy.id}
              />
            </section>
          )}

          {/* Section D: Does Not Qualify Appendix Table */}
          {includeUnqualified && (
            <section className="mt-10">
              <div className="border-b-2 border-rose-500 pb-2">
                <h2 className="font-display text-lg font-bold text-black">
                  Section D — {SIFT_BUCKET_META.unqualified.label} (
                  {siftGroups.unqualified.length})
                </h2>
                <p className="text-xs text-gray-600">
                  {SIFT_BUCKET_META.unqualified.description}.
                </p>
              </div>

              <CompactAppendixTable
                docs={docs}
                emptyMessage="No disqualified candidates in this report."
                items={siftGroups.unqualified}
                opsOrigin={opsOrigin}
                reasonHeader="Reason Not Qualified"
                vacancyId={vacancy.id}
              />
            </section>
          )}

          <footer className="mt-10 border-t border-gray-300 pt-4 text-xs text-gray-500">
            Generated by JantaHR Ops · {company.legal_name} · {new Date().toISOString().slice(0, 10)}
          </footer>
        </div>
      </div>

      <style>{`
        @media print {
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: A4;
            margin: 14mm;
          }
        }
      `}</style>
    </div>
  );
}

function ReportBriefCard({
  item,
  docs,
  briefHeading,
  accent,
  vacancyId,
  opsOrigin,
}: {
  item: SiftedApplicant;
  docs: ResolvedApplicationDocuments | undefined;
  briefHeading: string;
  accent: 'emerald' | 'sky';
  vacancyId: string;
  opsOrigin: string;
}) {
  const candId = item.application.candidate?.id;
  const cvDoc = candId ? docs?.cvByCandidateId[candId] : undefined;
  const tier = item.application.match_tier ?? 'unscored';
  const score = item.application.match_score;
  const opsAppUrl = `${opsOrigin}/recruitment/${vacancyId}/applications/${item.application.id}`;

  const badgeCls =
    accent === 'emerald'
      ? 'border-brand-teal-soft bg-brand-teal-soft text-brand-teal-dark'
      : 'border-sky-300 bg-sky-50 text-sky-950';

  const cardBorderCls =
    accent === 'emerald' ? 'border-l-4 border-l-brand-teal' : 'border-l-4 border-l-sky-600';

  return (
    <article
      className={`break-inside-avoid rounded-lg border border-gray-300 bg-white p-4 ${cardBorderCls}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-brand-teal px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
              #{item.rank}
            </span>
            <a
              className="font-display text-base font-bold text-brand-teal-dark underline decoration-gray-300 underline-offset-2 hover:decoration-current"
              href={opsAppUrl}
              rel="noreferrer"
              target="_blank"
            >
              {item.fullName}
            </a>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeCls}`}
            >
              {score != null ? `${score}/100 · ` : ''}
              {MATCH_TIER_META[tier].label}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
              {stageMeta(item.application.stage).label}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-gray-800">
            {item.recentRoleLine}
            {item.educationLine ? ` · ${item.educationLine}` : ''}
          </p>
        </div>

        {/* Clickable CV & JantaHR Ops Links (active inside exported PDF) */}
        <div className="flex flex-wrap items-center gap-2">
          {cvDoc ? (
            <a
              className="inline-flex items-center gap-1 rounded bg-brand-teal px-2.5 py-1 text-xs font-semibold text-white hover:opacity-95"
              href={cvDoc.url}
              rel="noreferrer"
              target="_blank"
            >
              <FileText className="h-3.5 w-3.5" />
              Open CV
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-[11px] text-gray-500">No CV</span>
          )}

          <a
            className="inline-flex items-center gap-1 rounded border border-brand-teal bg-brand-teal-soft px-2.5 py-1 text-xs font-semibold text-brand-teal-dark hover:opacity-90"
            href={opsAppUrl}
            rel="noreferrer"
            target="_blank"
          >
            View in JantaHR Ops
            <ExternalLink className="h-3 w-3 text-brand-teal" />
          </a>
        </div>
      </div>

      {/* Location, HR Experience, Excel, Phone & Email */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-brand-teal-soft bg-brand-teal-soft px-3 py-1.5 text-xs text-brand-teal-dark">
        <span className="inline-flex items-center gap-1 font-semibold">
          <MapPin className="h-3.5 w-3.5 text-brand-teal" />
          {item.locationLabel}
        </span>
        <span>
          <strong className="text-brand-teal">HR Exp:</strong>{' '}
          {item.hrYears > 0 ? `${item.hrYears} yrs` : '0 yrs direct'}
          {item.totalYears != null && item.totalYears > item.hrYears
            ? ` (${item.totalYears} yrs total)`
            : ''}
        </span>
        {item.excelLevel && (
          <span>
            <strong className="text-brand-teal">Excel:</strong> {item.excelLevel}
          </span>
        )}
        {item.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3 text-brand-teal" />
            {formatPhoneDisplay(item.phone)}
          </span>
        )}
        {item.email && (
          <a
            className="font-medium text-brand-teal underline"
            href={`mailto:${item.email}`}
          >
            {item.email}
          </a>
        )}
      </div>

      {/* Hindsight Narrative */}
      <div className="mt-2.5 space-y-1.5 text-xs leading-relaxed">
        <p className="text-gray-900">
          <strong className="text-brand-teal-dark">{briefHeading}:</strong> {item.whyBucket}
        </p>
        <p className="text-gray-700">{item.narrative}</p>

        {item.strengths.length > 0 && (
          <p className="text-gray-800">
            <strong className="text-emerald-900">Strengths:</strong>{' '}
            {item.strengths.join(' · ')}
          </p>
        )}
        {item.watchouts.length > 0 && (
          <p className="text-amber-950">
            <strong>Verify / Watchout:</strong> {item.watchouts.join(' · ')}
          </p>
        )}
        {item.coverLetterSummary && (
          <p className="text-gray-800">
            <strong className="text-brand-teal-dark">Cover Letter Analysis:</strong>{' '}
            {item.coverLetterSummary}
          </p>
        )}
      </div>
    </article>
  );
}

function CompactAppendixTable({
  items,
  docs,
  reasonHeader,
  emptyMessage,
  vacancyId,
  opsOrigin,
}: {
  items: SiftedApplicant[];
  docs: ResolvedApplicationDocuments | undefined;
  reasonHeader: string;
  emptyMessage: string;
  vacancyId: string;
  opsOrigin: string;
}) {
  if (items.length === 0) {
    return <p className="py-4 text-xs text-gray-600">{emptyMessage}</p>;
  }

  return (
    <table className="mt-3 w-full border-collapse text-xs">
      <thead>
        <tr className="border-b-2 border-gray-300 text-left text-[11px] uppercase tracking-wide text-gray-600">
          <th className="py-2 pr-2">#</th>
          <th className="py-2 pr-3">Candidate &amp; Contact</th>
          <th className="py-2 pr-3">Location &amp; Exp</th>
          <th className="py-2 pr-3">{reasonHeader}</th>
          <th className="py-2 text-right">Links</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const candId = item.application.candidate?.id;
          const cvDoc = candId ? docs?.cvByCandidateId[candId] : undefined;
          const score = item.application.match_score;
          const opsAppUrl = `${opsOrigin}/recruitment/${vacancyId}/applications/${item.application.id}`;

          return (
            <tr className="break-inside-avoid border-b border-gray-200 align-top" key={item.application.id}>
              <td className="py-2 pr-2 font-mono text-gray-600">{item.rank}</td>
              <td className="py-2 pr-3">
                <a
                  className="font-semibold text-black underline decoration-gray-300 underline-offset-2"
                  href={opsAppUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.fullName}
                  {score != null ? ` (${score})` : ''}
                </a>
                <p className="text-[11px] text-gray-600">{item.recentRoleLine}</p>
                {(item.phone || item.email) && (
                  <p className="text-[11px] text-gray-500">
                    {[item.phone ? formatPhoneDisplay(item.phone) : null, item.email]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </td>
              <td className="py-2 pr-3 text-gray-700">
                <p>{item.locationLabel}</p>
                <p className="text-[11px] text-gray-600">
                  {item.hrYears > 0 ? `${item.hrYears}y HR` : '0y HR'}
                  {item.totalYears != null ? ` / ${item.totalYears}y tot` : ''}
                  {item.excelLevel ? ` · ${item.excelLevel}` : ''}
                </p>
              </td>
              <td className="py-2 pr-3 text-gray-800">{item.whyBucket}</td>
              <td className="whitespace-nowrap py-2 text-right">
                <div className="inline-flex flex-col items-end gap-1">
                  {cvDoc ? (
                    <a
                      className="font-semibold text-brand-teal underline"
                      href={cvDoc.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      CV ↗
                    </a>
                  ) : (
                    <span className="text-[11px] text-gray-400">No CV</span>
                  )}
                  <a
                    className="text-[11px] font-medium text-brand-teal-dark underline"
                    href={opsAppUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Ops ↗
                  </a>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Full JantaHR brand logo in vector brand teal: open-right-edge square mark
 * with the "JantaHR" wordmark crossing cleanly through the opening.
 */
function JantaHrBrandLogo() {
  return (
    <svg
      aria-label="JantaHR"
      className="h-12 w-auto shrink-0 text-brand-teal"
      role="img"
      viewBox="0 0 190 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>JantaHR</title>
      <path
        d="M 96 26 L 96 3 L 3 3 L 3 97 L 96 97 L 96 74"
        fill="none"
        stroke="currentColor"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeWidth="4.5"
      />
      <text
        fill="currentColor"
        fontFamily="'Satoshi', ui-sans-serif, system-ui, -apple-system, sans-serif"
        fontSize="36"
        fontWeight="600"
        letterSpacing="-0.8"
        x="24"
        y="60"
      >
        JantaHR
      </text>
    </svg>
  );
}
