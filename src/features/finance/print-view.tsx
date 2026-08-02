import { useEffect } from 'react';
import { useParams } from 'react-router';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUGX } from '@/lib/format';
import { Logo } from '@/components/logo';
import { useDocument, useCompanyProfile } from './use-finance';
import { documentTitleFor } from './print-title';

/**
 * Print-optimised, branded document route rendered WITHOUT the app shell.
 * The user saves the PDF via the browser (Print → Save as PDF) — no PDF
 * library, no server render.
 */
export function PrintView() {
  const params = useParams<{ id: string }>();
  const docId = params.id ?? '';
  const { data: loaded, isLoading } = useDocument(docId);
  const { data: company } = useCompanyProfile();

  useEffect(() => {
    // Auto "Print" affordance: do not auto-open the dialog (browsers block it),
    // but keep a visible button on screen and everything else hidden in print.
  }, []);

  if (isLoading || !loaded || !company) {
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

  const { document, lines, payments, organisation } = loaded;
  const title = documentTitleFor(document.type, company.vat_registered);
  const vatRatePct = company.vat_rate_bp / 100;

  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-3xl px-4">
        {/* On-screen toolbar — hidden in print */}
        <div className="mb-6 flex items-center justify-between print:hidden">
          <p className="text-ink-secondary text-sm">Branded document — Save as PDF via Print.</p>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>

        {/* The sheet */}
        <div className="sheet bg-white p-10 text-black shadow-xl">
          {/* Header */}
          <header className="flex items-start justify-between border-b border-gray-300 pb-6">
            <div>
              <Logo className="text-black" size={40} title="JantaHR" />
              <h1 className="font-display mt-4 text-2xl font-bold text-black">{title}</h1>
              <p className="mt-0.5 font-medium text-gray-900">{document.number}</p>
              <p className="text-sm text-gray-600">Issued {document.issue_date}</p>
              {document.type === 'invoice' && document.due_date && (
                <p className="text-sm text-gray-600">Due {document.due_date}</p>
              )}
              {document.type === 'quote' && document.valid_until && (
                <p className="text-sm text-gray-600">Valid until {document.valid_until}</p>
              )}
            </div>
            <div className="text-right text-sm text-gray-700">
              <p className="text-base font-semibold text-black">{company.legal_name}</p>
              {company.address && <p>{company.address}</p>}
              {company.email && <p>{company.email}</p>}
              {company.phone && <p>{company.phone}</p>}
              {company.tin && <p>TIN: {company.tin}</p>}
            </div>
          </header>

          {/* Bill-to */}
          <section className="mt-6">
            <h2 className="text-xs font-bold tracking-wide text-gray-500 uppercase">Bill to</h2>
            {organisation ? (
              <>
                <p className="mt-1 font-medium text-black">{organisation.name}</p>
                {organisation.tin && (
                  <p className="text-sm text-gray-600">TIN: {organisation.tin}</p>
                )}
              </>
            ) : (
              <p className="mt-1 font-medium text-black">Client</p>
            )}
          </section>

          {/* Lines */}
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left">
                <th className="py-2 font-bold text-black">Description</th>
                <th className="py-2 text-right font-bold text-black">Qty</th>
                <th className="py-2 text-right font-bold text-black">Unit price</th>
                <th className="py-2 text-right font-bold text-black">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr className="break-inside-avoid border-b border-gray-200" key={line.id}>
                  <td className="py-2 text-gray-900">{line.description}</td>
                  <td className="num py-2 text-right text-gray-900">{line.qty}</td>
                  <td className="num py-2 text-right text-gray-900">
                    {formatUGX(BigInt(line.unit_price_ugx))}
                  </td>
                  <td className="num py-2 text-right font-medium text-gray-900">
                    {formatUGX(BigInt(line.line_total_ugx))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-72 space-y-1 text-sm">
              <TotalRow label="Subtotal" value={BigInt(document.subtotal_ugx)} />
              <TotalRow label={`VAT (${vatRatePct}%)`} value={BigInt(document.vat_amount_ugx)} />
              <div className="flex justify-between border-t-2 border-gray-300 pt-2 text-base font-bold text-black">
                <span>Total</span>
                <span className="num">{formatUGX(BigInt(document.total_ugx))}</span>
              </div>
            </div>
          </div>

          {/* Receipt paid line */}
          {document.type === 'receipt' && payments.length > 0 && (
            <div className="mt-6 rounded border border-gray-300 p-4 text-sm">
              <p className="font-bold text-black">Paid</p>
              <p className="num text-gray-900">{formatUGX(BigInt(document.total_ugx))}</p>
              {payments.map((p) => (
                <p className="mt-1 text-gray-600" key={p.id}>
                  {p.method.replace('_', ' ')} · {p.received_at.slice(0, 10)}
                  {p.reference ? ` · ${p.reference}` : ''}
                </p>
              ))}
            </div>
          )}

          {/* EFRIS block */}
          {document.efris_fdn && (
            <div className="mt-6 flex items-center gap-4 border-t border-gray-300 pt-4 text-sm">
              <div>
                <p className="font-bold text-black">EFRIS FDN: {document.efris_fdn}</p>
                <p className="text-gray-600">Verify this invoice on the EFRIS portal.</p>
              </div>
              {document.efris_qr_url && (
                <img alt="EFRIS QR" className="h-24 w-24" src={document.efris_qr_url} />
              )}
            </div>
          )}

          {/* Bank + MoMo on invoices */}
          {document.type === 'invoice' && (company.bank_details || company.momo_details) && (
            <div className="mt-6 grid grid-cols-2 gap-6 border-t border-gray-300 pt-4 text-sm">
              {company.bank_details && (
                <div>
                  <h3 className="text-xs font-bold tracking-wide text-gray-500 uppercase">Bank</h3>
                  <p className="mt-1 whitespace-pre-line text-gray-900">{company.bank_details}</p>
                </div>
              )}
              {company.momo_details && (
                <div>
                  <h3 className="text-xs font-bold tracking-wide text-gray-500 uppercase">
                    Mobile money
                  </h3>
                  <p className="mt-1 whitespace-pre-line text-gray-900">{company.momo_details}</p>
                </div>
              )}
            </div>
          )}

          {/* Notes / terms */}
          {(document.notes || document.terms) && (
            <div className="mt-6 border-t border-gray-300 pt-4 text-sm">
              {document.terms && (
                <p className="whitespace-pre-line text-gray-900">{document.terms}</p>
              )}
              {document.notes && <p className="mt-2 text-gray-600">Notes: {document.notes}</p>}
            </div>
          )}
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

function TotalRow({ label, value }: { label: string; value: bigint }) {
  return (
    <div className="flex justify-between text-gray-900">
      <span>{label}</span>
      <span className="num">{formatUGX(value)}</span>
    </div>
  );
}
