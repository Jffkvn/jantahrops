import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Briefcase,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  Phone,
  Printer,
} from 'lucide-react';
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
 * High-contrast, full-page Executive Applicant Sift Report for the Head of HR,
 * rendered without the app shell for clean A4 Print / Save as PDF with one
 * candidate per page in Sections A & B and live 14-day clickable CV links.
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

  const preparedDate = formatDate(new Date());

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
              <span className="text-sm font-medium text-gray-800">
                {docsLoading
                  ? 'Signing 14-day CV & Cover Letter links…'
                  : 'All 14-day clickable CV links ready · Formatted for 1 candidate per page.'}
              </span>
            </div>

            <Button disabled={docsLoading} onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" />
              Print / Save as PDF
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-gray-200 pt-3 text-sm font-medium text-gray-800">
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
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-gray-800">
              <Checkbox
                checked={excludeRejected}
                onCheckedChange={(v) => setExcludeRejected(Boolean(v))}
              />
              Exclude Rejected
            </label>
          </div>
        </div>

        {/* Printable Briefing Document */}
        <div className="space-y-8 text-gray-950 print:space-y-0">
          {/* PAGE 1: Dedicated Executive Cover & Overview Sheet */}
          <section className="report-cover-page rounded-lg border border-gray-300 border-t-4 border-t-brand-teal bg-white p-8 shadow-xl print:rounded-none print:border-x-0 print:border-b-0 print:p-0 print:pt-4 print:shadow-none">
            <div className="space-y-7">
              {/* Executive Header */}
              <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-brand-teal pb-6">
                <div className="min-w-0 flex-1">
                  <JantaHrBrandLogo />
                  <div className="mt-5">
                    <span className="inline-block rounded bg-brand-teal px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                      Executive Applicant Sift Briefing
                    </span>
                  </div>
                  <h1 className="font-display mt-3 text-3xl font-bold leading-tight text-black">
                    {vacancy.title}
                  </h1>
                  <p className="mt-1.5 text-base font-semibold text-gray-900">
                    {vacancy.organisation?.name ?? 'Unassigned client'}
                    {vacancy.location ? ` · ${vacancy.location}` : ''}
                  </p>
                </div>

                <div className="shrink-0 text-right text-sm text-gray-900">
                  <p className="text-base font-bold text-brand-teal-dark">{company.legal_name}</p>
                  {company.email && <p className="mt-0.5 font-medium">{company.email}</p>}
                  {company.phone && <p className="font-medium">{company.phone}</p>}
                  <p className="mt-3 font-semibold text-black">Prepared {preparedDate}</p>
                  <p className="font-semibold text-brand-teal">
                    {scopedApps.length} applicants analyzed
                  </p>
                  <a
                    className="mt-3 inline-flex items-center gap-1.5 rounded border-2 border-brand-teal bg-brand-teal-soft px-3.5 py-1.5 text-sm font-bold text-brand-teal-dark hover:opacity-90"
                    href={`${opsOrigin}/recruitment/${vacancy.id}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open Vacancy in JantaHR Ops
                    <ExternalLink className="h-4 w-4 text-brand-teal" />
                  </a>
                </div>
              </header>

              {/* Role Brief */}
              {vacancy.summary && (
                <div className="rounded-lg border border-gray-300 bg-gray-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">
                    Role Overview
                  </p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-gray-950">
                    {vacancy.summary}
                  </p>
                </div>
              )}

              {/* 4-Bucket KPI Summary Strip */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-900">
                  Applicant Sift Breakdown
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-950">
                      Most Qualified
                    </p>
                    <p className="font-display mt-2 text-3xl font-bold tabular-nums text-emerald-950">
                      {siftGroups.most_qualified.length}
                    </p>
                    <p className="mt-1 text-sm font-medium text-emerald-900">
                      0–3 yrs HR · In range
                    </p>
                  </div>

                  <div className="rounded-lg border-2 border-sky-400 bg-sky-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-sky-950">
                      Overqualified
                    </p>
                    <p className="font-display mt-2 text-3xl font-bold tabular-nums text-sky-950">
                      {siftGroups.overqualified.length}
                    </p>
                    <p className="mt-1 text-sm font-medium text-sky-900">4+ yrs HR / Manager+</p>
                  </div>

                  <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-950">
                      Transferable
                    </p>
                    <p className="font-display mt-2 text-3xl font-bold tabular-nums text-amber-950">
                      {siftGroups.transferable.length}
                    </p>
                    <p className="mt-1 text-sm font-medium text-amber-900">Admin / Gaps to check</p>
                  </div>

                  <div className="rounded-lg border-2 border-rose-400 bg-rose-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-rose-950">
                      Does Not Qualify
                    </p>
                    <p className="font-display mt-2 text-3xl font-bold tabular-nums text-rose-950">
                      {siftGroups.unqualified.length}
                    </p>
                    <p className="mt-1 text-sm font-medium text-rose-900">Auto-sifted out</p>
                  </div>
                </div>
              </div>

              {/* Report Guide & Section Index */}
              <div className="rounded-lg border border-gray-300 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">
                  Contents &amp; Reading Guide
                </p>
                <ul className="mt-3 divide-y divide-gray-200 text-sm text-gray-950">
                  {includeMostQualified && (
                    <li className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
                      <div>
                        <p className="font-bold text-brand-teal-dark">
                          Section A — {SIFT_BUCKET_META.most_qualified.label} (
                          {siftGroups.most_qualified.length})
                        </p>
                        <p className="mt-0.5 text-gray-900">
                          {SIFT_BUCKET_META.most_qualified.description}. Recommended first group for
                          interviews — one dedicated page per candidate.
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-brand-teal-soft px-2.5 py-1 text-xs font-bold text-brand-teal-dark">
                        1 per page
                      </span>
                    </li>
                  )}
                  {includeOverqualified && (
                    <li className="flex items-start justify-between gap-4 py-2.5">
                      <div>
                        <p className="font-bold text-sky-950">
                          Section B — {SIFT_BUCKET_META.overqualified.label} (
                          {siftGroups.overqualified.length})
                        </p>
                        <p className="mt-0.5 text-gray-900">
                          {SIFT_BUCKET_META.overqualified.description}. Capable immediately; verify
                          salary expectations and retention risk — one dedicated page per candidate.
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-950">
                        1 per page
                      </span>
                    </li>
                  )}
                  {includeTransferable && (
                    <li className="flex items-start justify-between gap-4 py-2.5">
                      <div>
                        <p className="font-bold text-amber-950">
                          Section C — {SIFT_BUCKET_META.transferable.label} (
                          {siftGroups.transferable.length})
                        </p>
                        <p className="mt-0.5 text-gray-900">
                          {SIFT_BUCKET_META.transferable.description}. Reserve summary table if
                          additional interview slots open.
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950">
                        Summary table
                      </span>
                    </li>
                  )}
                  {includeUnqualified && (
                    <li className="flex items-start justify-between gap-4 py-2.5 last:pb-0">
                      <div>
                        <p className="font-bold text-rose-950">
                          Section D — {SIFT_BUCKET_META.unqualified.label} (
                          {siftGroups.unqualified.length})
                        </p>
                        <p className="mt-0.5 text-gray-900">
                          {SIFT_BUCKET_META.unqualified.description}.
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-950">
                        Summary table
                      </span>
                    </li>
                  )}
                </ul>
              </div>

              {/* 14-day Link Note */}
              <div className="rounded-lg border border-brand-teal-soft bg-brand-teal-soft p-4 text-sm font-medium leading-relaxed text-brand-teal-dark">
                <strong>Clickable CV &amp; Ops Links:</strong> Every <strong>Open CV</strong> button
                in this PDF stays active for 14 days from {preparedDate}.{' '}
                <strong>View in JantaHR Ops</strong> opens each applicant&apos;s full profile,
                documents, and stage controls inside JantaHR Ops for team members with Ops logins.
              </div>
            </div>

            <footer className="mt-8 border-t border-gray-300 pt-3 text-sm font-medium text-gray-800 print:mt-auto">
              Generated by JantaHR Ops · {company.legal_name} · {new Date().toISOString().slice(0, 10)}
            </footer>
          </section>

          {/* Section A: Most Qualified — One Candidate Per Page */}
          {includeMostQualified &&
            (siftGroups.most_qualified.length === 0 ? (
              <section className="rounded-lg border border-gray-300 bg-white p-8 shadow-sm print:break-before-page print:border-0 print:p-0 print:shadow-none">
                <h2 className="font-display text-xl font-bold text-brand-teal-dark">
                  Section A — {SIFT_BUCKET_META.most_qualified.label} (0)
                </h2>
                <p className="mt-2 text-base text-gray-900">
                  No applicants matched the target range criteria.
                </p>
              </section>
            ) : (
              siftGroups.most_qualified.map((item, idx) => (
                <ReportBriefCard
                  accent="emerald"
                  briefHeading="Why Qualified (In Hindsight)"
                  docs={docs}
                  item={item}
                  key={item.application.id}
                  opsOrigin={opsOrigin}
                  sectionLabel={`Section A — ${SIFT_BUCKET_META.most_qualified.label}`}
                  sectionPosition={`${idx + 1} of ${siftGroups.most_qualified.length}`}
                  vacancyId={vacancy.id}
                  vacancyTitle={vacancy.title}
                />
              ))
            ))}

          {/* Section B: Overqualified — One Candidate Per Page */}
          {includeOverqualified &&
            (siftGroups.overqualified.length === 0 ? (
              <section className="rounded-lg border border-gray-300 bg-white p-8 shadow-sm print:break-before-page print:border-0 print:p-0 print:shadow-none">
                <h2 className="font-display text-xl font-bold text-sky-950">
                  Section B — {SIFT_BUCKET_META.overqualified.label} (0)
                </h2>
                <p className="mt-2 text-base text-gray-900">
                  No overqualified HR applicants flagged.
                </p>
              </section>
            ) : (
              siftGroups.overqualified.map((item, idx) => (
                <ReportBriefCard
                  accent="sky"
                  briefHeading="Why Overqualified (In Hindsight)"
                  docs={docs}
                  item={item}
                  key={item.application.id}
                  opsOrigin={opsOrigin}
                  sectionLabel={`Section B — ${SIFT_BUCKET_META.overqualified.label}`}
                  sectionPosition={`${idx + 1} of ${siftGroups.overqualified.length}`}
                  vacancyId={vacancy.id}
                  vacancyTitle={vacancy.title}
                />
              ))
            ))}

          {/* Section C: Transferable / Borderline Appendix Table */}
          {includeTransferable && (
            <section className="rounded-lg border border-gray-300 bg-white p-8 shadow-sm print:break-before-page print:rounded-none print:border-0 print:p-0 print:shadow-none">
              <div className="border-b-2 border-amber-600 pb-3">
                <h2 className="font-display text-xl font-bold text-black">
                  Section C — {SIFT_BUCKET_META.transferable.label} (
                  {siftGroups.transferable.length})
                </h2>
                <p className="mt-1 text-sm font-medium text-gray-900">
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
            <section className="rounded-lg border border-gray-300 bg-white p-8 shadow-sm print:break-before-page print:rounded-none print:border-0 print:p-0 print:shadow-none">
              <div className="border-b-2 border-rose-600 pb-3">
                <h2 className="font-display text-xl font-bold text-black">
                  Section D — {SIFT_BUCKET_META.unqualified.label} (
                  {siftGroups.unqualified.length})
                </h2>
                <p className="mt-1 text-sm font-medium text-gray-900">
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
            size: A4 portrait;
            margin: 10mm 11mm;
          }
          .report-cover-page {
            min-height: 254mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            break-after: page;
            page-break-after: always;
          }
          .report-candidate-page {
            min-height: 254mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            break-before: page;
            page-break-before: always;
            break-inside: avoid;
            page-break-inside: avoid;
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
  sectionLabel,
  sectionPosition,
  vacancyId,
  vacancyTitle,
  opsOrigin,
}: {
  item: SiftedApplicant;
  docs: ResolvedApplicationDocuments | undefined;
  briefHeading: string;
  accent: 'emerald' | 'sky';
  sectionLabel: string;
  sectionPosition: string;
  vacancyId: string;
  vacancyTitle: string;
  opsOrigin: string;
}) {
  const candId = item.application.candidate?.id;
  const cvDoc = candId ? docs?.cvByCandidateId[candId] : undefined;
  const tier = item.application.match_tier ?? 'unscored';
  const score = item.application.match_score;
  const opsAppUrl = `${opsOrigin}/recruitment/${vacancyId}/applications/${item.application.id}`;

  const bannerCls =
    accent === 'emerald'
      ? 'bg-brand-teal text-white'
      : 'bg-sky-800 text-white';

  const badgeCls =
    accent === 'emerald'
      ? 'border-brand-teal bg-brand-teal-soft text-brand-teal-dark'
      : 'border-sky-600 bg-sky-100 text-sky-950';

  const cardBorderCls =
    accent === 'emerald' ? 'border-l-4 border-l-brand-teal' : 'border-l-4 border-l-sky-700';

  return (
    <article
      className={`report-candidate-page overflow-hidden rounded-lg border border-gray-300 bg-white shadow-md print:rounded-none print:border-gray-300 print:shadow-none ${cardBorderCls}`}
    >
      <div>
        {/* Top Section Ribbon */}
        <div className={`flex items-center justify-between gap-3 px-6 py-2.5 ${bannerCls}`}>
          <span className="text-xs font-bold uppercase tracking-wider">{sectionLabel}</span>
          <span className="font-mono text-xs font-bold">
            Candidate {sectionPosition} · Rank #{item.rank}
          </span>
        </div>

        <div className="space-y-5 p-6">
          {/* Candidate Identity & Action Buttons */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-300 pb-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded bg-brand-teal px-2.5 py-1 font-mono text-sm font-bold text-white">
                  #{item.rank}
                </span>
                <a
                  className="font-display text-2xl font-bold leading-tight text-brand-teal-dark underline decoration-gray-400 underline-offset-4 hover:decoration-current"
                  href={opsAppUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.fullName}
                </a>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-0.5 text-sm font-bold ${badgeCls}`}>
                  {score != null ? `${score}/100 · ` : ''}
                  {MATCH_TIER_META[tier].label}
                </span>
                <span className="rounded-full border border-gray-400 bg-gray-100 px-3 py-0.5 text-sm font-semibold text-gray-900">
                  Stage: {stageMeta(item.application.stage).label}
                </span>
              </div>

              <p className="mt-2.5 text-[15px] font-semibold leading-snug text-gray-900">
                {item.recentRoleLine}
                {item.educationLine ? ` · ${item.educationLine}` : ''}
              </p>
            </div>

            {/* Clickable CV & JantaHR Ops Links (active inside exported PDF) */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {cvDoc ? (
                <a
                  className="inline-flex items-center gap-1.5 rounded bg-brand-teal px-4 py-2 text-sm font-bold text-white hover:opacity-95"
                  href={cvDoc.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <FileText className="h-4 w-4" />
                  Open CV
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800">
                  No CV uploaded
                </span>
              )}

              <a
                className="inline-flex items-center gap-1.5 rounded border-2 border-brand-teal bg-brand-teal-soft px-3.5 py-1.5 text-sm font-bold text-brand-teal-dark hover:opacity-90"
                href={opsAppUrl}
                rel="noreferrer"
                target="_blank"
              >
                View in JantaHR Ops
                <ExternalLink className="h-3.5 w-3.5 text-brand-teal" />
              </a>
            </div>
          </div>

          {/* High-Contrast Structured Key Facts Grid */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-brand-teal-soft bg-brand-teal-soft p-4 sm:grid-cols-4">
            <div>
              <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-teal">
                <MapPin className="h-3.5 w-3.5" />
                Location
              </p>
              <p className="mt-1 text-sm font-bold text-gray-950">{item.locationLabel}</p>
            </div>

            <div>
              <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-teal">
                <Briefcase className="h-3.5 w-3.5" />
                HR Experience
              </p>
              <p className="mt-1 text-sm font-bold text-gray-950">
                {item.hrYears > 0 ? `${item.hrYears} yrs direct` : '0 yrs direct'}
                {item.totalYears != null && item.totalYears > item.hrYears
                  ? ` (${item.totalYears} yrs total)`
                  : ''}
              </p>
            </div>

            <div>
              <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-teal">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel Level
              </p>
              <p className="mt-1 text-sm font-bold text-gray-950">
                {item.excelLevel ?? 'Not specified'}
              </p>
            </div>

            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-teal">
                <Phone className="h-3.5 w-3.5" />
                Contact
              </p>
              <div className="mt-1 space-y-0.5 text-sm font-bold text-gray-950">
                {item.phone && <p>{formatPhoneDisplay(item.phone)}</p>}
                {item.email && (
                  <a
                    className="flex items-center gap-1 break-all font-semibold text-brand-teal-dark underline"
                    href={`mailto:${item.email}`}
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                    <span>{item.email}</span>
                  </a>
                )}
                {!item.phone && !item.email && <p>—</p>}
              </div>
            </div>
          </div>

          {/* Executive Hindsight Assessment */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-teal-dark">
              {briefHeading}
            </h3>
            <p className="text-[15px] font-semibold leading-relaxed text-black">{item.whyBucket}</p>
            <p className="text-[15px] leading-relaxed text-gray-950">{item.narrative}</p>
          </div>

          {/* Key Strengths (Clear Bullet Points) */}
          {item.strengths.length > 0 && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-950">
                Key Strengths &amp; Relevant Evidence
              </h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-[14.5px] leading-relaxed text-gray-950">
                {item.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Verify / Watchouts (Clear Bullet Points) */}
          {item.watchouts.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/75 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-950">
                Verify / Watchout (Interview Checks)
              </h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-[14.5px] leading-relaxed text-gray-950">
                {item.watchouts.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Cover Letter Analysis */}
          {item.coverLetterSummary && (
            <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-brand-teal-dark">
                Cover Letter Analysis
              </h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-gray-950">
                {item.coverLetterSummary}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Reviewer Action & Notes Strip */}
      <footer className="mt-auto border-t border-gray-300 bg-gray-50 px-6 py-3.5 text-sm text-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 font-semibold">
            <span className="text-xs font-bold uppercase tracking-wide text-brand-teal-dark">
              Decision:
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-gray-700 bg-white" />
              Shortlist
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-gray-700 bg-white" />
              Interview
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-gray-700 bg-white" />
              Hold
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-gray-700 bg-white" />
              Reject
            </span>
          </div>
          <span className="text-xs font-semibold text-gray-800">
            {vacancyTitle} · JantaHR Ops
          </span>
        </div>
      </footer>
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
    return <p className="py-4 text-sm font-medium text-gray-900">{emptyMessage}</p>;
  }

  return (
    <table className="mt-4 w-full border-collapse text-sm">
      <thead>
        <tr className="border-b-2 border-gray-400 bg-gray-100 text-left text-xs font-bold uppercase tracking-wide text-gray-900">
          <th className="px-2 py-2.5">#</th>
          <th className="px-2 py-2.5">Candidate &amp; Contact</th>
          <th className="px-2 py-2.5">Location &amp; Exp</th>
          <th className="px-2 py-2.5">{reasonHeader}</th>
          <th className="px-2 py-2.5 text-right">Links</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const candId = item.application.candidate?.id;
          const cvDoc = candId ? docs?.cvByCandidateId[candId] : undefined;
          const score = item.application.match_score;
          const opsAppUrl = `${opsOrigin}/recruitment/${vacancyId}/applications/${item.application.id}`;

          return (
            <tr
              className="break-inside-avoid border-b border-gray-300 align-top"
              key={item.application.id}
            >
              <td className="px-2 py-3 font-mono font-bold text-gray-900">{item.rank}</td>
              <td className="px-2 py-3">
                <a
                  className="font-bold text-black underline decoration-gray-400 underline-offset-2"
                  href={opsAppUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.fullName}
                  {score != null ? ` (${score})` : ''}
                </a>
                <p className="mt-0.5 text-[13px] font-medium text-gray-900">{item.recentRoleLine}</p>
                {(item.phone || item.email) && (
                  <p className="mt-0.5 text-[13px] text-gray-800">
                    {[item.phone ? formatPhoneDisplay(item.phone) : null, item.email]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </td>
              <td className="px-2 py-3 text-gray-950">
                <p className="font-semibold">{item.locationLabel}</p>
                <p className="mt-0.5 text-[13px] text-gray-900">
                  {item.hrYears > 0 ? `${item.hrYears}y HR` : '0y HR'}
                  {item.totalYears != null ? ` / ${item.totalYears}y tot` : ''}
                  {item.excelLevel ? ` · ${item.excelLevel}` : ''}
                </p>
              </td>
              <td className="px-2 py-3 leading-relaxed text-gray-950">{item.whyBucket}</td>
              <td className="whitespace-nowrap px-2 py-3 text-right">
                <div className="inline-flex flex-col items-end gap-1.5">
                  {cvDoc ? (
                    <a
                      className="font-bold text-brand-teal underline"
                      href={cvDoc.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      CV ↗
                    </a>
                  ) : (
                    <span className="text-xs font-medium text-gray-700">No CV</span>
                  )}
                  <a
                    className="text-xs font-bold text-brand-teal-dark underline"
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
      className="h-14 w-auto shrink-0 text-brand-teal"
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
