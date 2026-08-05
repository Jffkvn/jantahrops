import { useParams } from 'react-router';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Logo } from '@/components/logo';
import { formatDate } from '@/lib/format';
import { formatPhoneDisplay } from '@/lib/phone';
import { stageMeta } from './recruitment-meta';
import { useShortlist, useVacancy } from './use-recruitment';
import { useCompanyProfile } from '@/features/finance/use-finance';

/**
 * Client-facing shortlist pack for a vacancy, rendered WITHOUT the app shell.
 * Print → Save as PDF; no server render.
 */
export function ShortlistPrintView() {
  const params = useParams<{ vacancyId: string }>();
  const vacancyId = params.vacancyId ?? '';
  const { data: vacancy, isLoading: vacancyLoading } = useVacancy(vacancyId);
  const { data: applications } = useShortlist(vacancyId, 'shortlisted');
  const { data: company } = useCompanyProfile();

  if (vacancyLoading || !vacancy || !company) {
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const rows = applications ?? [];

  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <p className="text-sm text-ink-secondary">Shortlist pack — Save as PDF via Print.</p>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>

        <div className="sheet bg-white p-10 text-black shadow-xl">
          <header className="flex items-start justify-between border-b border-gray-300 pb-6">
            <div>
              <Logo className="text-black" size={40} title="JantaHR" />
              <h1 className="font-display mt-4 text-2xl font-bold text-black">Shortlist</h1>
              <p className="mt-0.5 font-medium text-gray-900">{vacancy.title}</p>
              <p className="text-sm text-gray-600">
                {vacancy.organisation?.name ?? 'Unassigned client'}
                {vacancy.location ? ` · ${vacancy.location}` : ''}
              </p>
              {vacancy.summary && <p className="mt-2 text-sm text-gray-600">{vacancy.summary}</p>}
            </div>
            <div className="text-right text-sm text-gray-700">
              <p className="text-base font-semibold text-black">{company.legal_name}</p>
              {company.address && <p>{company.address}</p>}
              {company.email && <p>{company.email}</p>}
              {company.phone && <p>{company.phone}</p>}
              <p className="mt-2">Prepared {formatDate(new Date())}</p>
              <p>{stageMeta('shortlisted').label} candidates ({rows.length})</p>
            </div>
          </header>

          {rows.length === 0 ? (
            <p className="mt-8 text-sm text-gray-600">
              No shortlisted candidates yet. Move candidates to “Shortlisted” to build this pack.
            </p>
          ) : (
            <table className="mt-8 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300 text-left">
                  <th className="py-2 font-bold text-black">Candidate</th>
                  <th className="py-2 font-bold text-black">Contact</th>
                  <th className="py-2 font-bold text-black">Profile</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((app) => {
                  const contact = app.candidateContact;
                  const candidate = app.candidate;
                  return (
                    <tr className="break-inside-avoid border-b border-gray-200 align-top" key={app.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-black">
                          {contact?.full_name ?? 'Unnamed candidate'}
                        </p>
                        {candidate?.headline && (
                          <p className="mt-0.5 text-gray-600">{candidate.headline}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-900">
                        {contact?.email && <p>{contact.email}</p>}
                        {contact?.phone_e164 && <p>{formatPhoneDisplay(contact.phone_e164)}</p>}
                      </td>
                      <td className="py-3 text-gray-700">
                        {candidate?.years_experience != null && (
                          <p>{candidate.years_experience} yrs experience</p>
                        )}
                        {candidate && candidate.skills.length > 0 && (
                          <p className="mt-0.5">{candidate.skills.slice(0, 5).join(', ')}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="mt-10 border-t border-gray-300 pt-4 text-sm text-gray-600">
            <p>Prepared for the hiring manager by JantaHR Ops.</p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500 print:hidden">
          Generated by JantaHR Ops · {new Date().toISOString().slice(0, 10)}
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .sheet, .sheet * { visibility: visible; }
          .sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            padding: 0 !important;
          }
          @page { size: A4; margin: 16mm; }
        }
      `}</style>
    </div>
  );
}
