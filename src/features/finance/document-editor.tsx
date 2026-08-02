import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Plus, Trash2, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip } from '@/components/status-chip';
import { Money } from '@/components/money';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { formatDate, formatDateTime, parseUGX } from '@/lib/format';
import { documentTotals, lineTotalUgx } from '@/lib/money';
import {
  useDocument,
  useIssueDocument,
  useAcceptQuote,
  useRejectQuote,
  useConvertToInvoice,
  useAddLine,
  useUpdateLine,
  useRemoveLine,
  useUpdateDraftDocument,
  useCompanyProfile,
  useOrganisations,
  useContactsForOrganisation,
  useDocumentTimeline,
  useUpdateEfris,
  useDeleteDraftDocument,
} from './use-finance';
import { documentTypeMeta, documentStatusMeta } from './document-meta';
import { RecordPaymentSheet } from './record-payment-sheet';
import { useAuth } from '@/features/auth/auth-provider';
import type { DocumentType } from '@/types/database';

interface EditorLine {
  id: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
}

const BLANK_LINE = (id: string): EditorLine => ({
  id,
  description: '',
  qty: '1',
  unit: '',
  unitPrice: '',
});

let lineSeq = 0;
function newLineId() {
  lineSeq += 1;
  return `draft-line-${Date.now()}-${lineSeq}`;
}

export function DocumentEditor() {
  const params = useParams<{ id?: string; type?: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const createType = (params.type as DocumentType | undefined) ?? null;
  const docId = params.id ?? null;

  const { data: loaded, isLoading } = useDocument(docId ?? '');
  const document = createType ? null : (loaded?.document ?? null);
  const lines = useMemo(() => (createType ? [] : (loaded?.lines ?? [])), [createType, loaded]);
  const payments = useMemo(
    () => (createType ? [] : (loaded?.payments ?? [])),
    [createType, loaded],
  );

  const isDraft = document?.status === 'draft';
  const isCreate = createType !== null;

  // Editor state
  const [organisationId, setOrganisationId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [orgSearch, setOrgSearch] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [vatApplicable, setVatApplicable] = useState(true);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [editorLines, setEditorLines] = useState<EditorLine[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // Hydrate state from the loaded document.
  useEffect(() => {
    if (!document) return;
    setOrganisationId(document.organisation_id);
    setContactId(document.contact_id ?? '');
    setIssueDate(document.issue_date ?? '');
    setDueDate(document.due_date ?? '');
    setValidUntil(document.valid_until ?? '');
    setVatApplicable(document.vat_applicable);
    setNotes(document.notes ?? '');
    setTerms(document.terms ?? '');
    setEditorLines(
      lines.map((l) => ({
        id: l.id,
        description: l.description,
        qty: String(l.qty),
        unit: l.unit ?? '',
        unitPrice: String(l.unit_price_ugx),
      })),
    );
  }, [document, lines]);

  const { data: company } = useCompanyProfile();
  const vatRateBp = BigInt(company?.vat_rate_bp ?? 1800);

  const { data: orgOptions } = useOrganisations(orgSearch);
  const { data: contactOptions } = useContactsForOrganisation(organisationId || null);

  const updateDraft = useUpdateDraftDocument(docId ?? '');
  const issue = useIssueDocument();
  const acceptQuote = useAcceptQuote(docId ?? '');
  const rejectQuote = useRejectQuote(docId ?? '');
  const convertToInvoice = useConvertToInvoice();
  const addLine = useAddLine(docId ?? '');
  const updateLine = useUpdateLine(docId ?? '');
  const removeLine = useRemoveLine(docId ?? '');
  const updateEfris = useUpdateEfris(docId ?? '');
  const deleteDraft = useDeleteDraftDocument(docId ?? '');
  const { data: timeline } = useDocumentTimeline(docId ?? '');

  const paidSoFar = useMemo(() => {
    return payments.reduce(
      (acc, p) => acc + BigInt(p.amount_received_ugx) + BigInt(p.wht_withheld_ugx),
      0n,
    );
  }, [payments]);

  const computedBalance = useMemo(() => {
    if (!document) return 0n;
    const balance = BigInt(document.total_ugx) - paidSoFar;
    return balance < 0n ? 0n : balance;
  }, [document, paidSoFar]);

  const totals = useMemo(() => {
    const parsedLines = editorLines.map((l) => ({
      qty: Number(l.qty) || 0,
      unitPriceUgx: parseUGX(l.unitPrice) ?? 0n,
    }));
    return documentTotals(parsedLines, vatApplicable, vatRateBp);
  }, [editorLines, vatApplicable, vatRateBp]);

  if (isLoading && docId) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="rounded-card h-40 w-full" />
        <Skeleton className="rounded-card h-40 w-full" />
      </div>
    );
  }

  if (!document && !isCreate) {
    return (
      <EmptyState
        description="The document you are looking for does not exist."
        headline="Document not found"
      />
    );
  }

  const isEditable = isCreate || isDraft;
  const type = createType ?? document!.type;
  const typeMeta = documentTypeMeta(type);
  const statusMeta = document && !isCreate ? documentStatusMeta(document.status) : null;
  const isInvoice = type === 'invoice';

  const saveDraftFields = async () => {
    if (isCreate || !docId) return;
    await updateDraft.mutateAsync({
      ...(organisationId ? { organisation_id: organisationId } : {}),
      contact_id: contactId || null,
      issue_date: issueDate || null,
      due_date: isInvoice ? dueDate || null : null,
      valid_until: type === 'quote' ? validUntil || null : null,
      vat_applicable: vatApplicable,
      notes: notes || null,
      terms: terms || null,
    });
  };

  const persistLine = async (line: EditorLine, index: number) => {
    if (isCreate || !docId) return;
    if (line.id.startsWith('draft-line-')) {
      // New unsaved line → create then replace local id.
      await addLine.mutateAsync({
        description: line.description || 'Item',
        qty: Number(line.qty) || 1,
        unit: line.unit || null,
        unit_price_ugx: parseUGX(line.unitPrice) ?? 0n,
        position: index,
      });
    } else {
      await updateLine.mutateAsync({
        line_id: line.id,
        description: line.description || 'Item',
        qty: Number(line.qty) || 1,
        unit: line.unit || null,
        unit_price_ugx: parseUGX(line.unitPrice) ?? 0n,
        position: index,
      });
    }
  };

  const handleAddLine = async () => {
    if (isCreate) {
      setEditorLines((prev) => [...prev, BLANK_LINE(newLineId())]);
      return;
    }
    if (!docId) return;
    await addLine.mutateAsync({ description: 'Item', unit_price_ugx: 0n });
  };

  const handleRemoveLine = async (line: EditorLine) => {
    if (isCreate) {
      setEditorLines((prev) => prev.filter((l) => l.id !== line.id));
      return;
    }
    if (!line.id.startsWith('draft-line-')) await removeLine.mutateAsync(line.id);
  };

  const handleIssue = async () => {
    if (isCreate || !docId) return;
    try {
      await saveDraftFields();
      await issue.mutateAsync(docId);
      toast.success('Document issued');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not issue the document'));
    }
  };

  const handleDelete = async () => {
    if (isCreate || !docId || !isAdmin) return;
    try {
      await deleteDraft.mutateAsync();
      toast.success('Draft deleted');
      void navigate('/finance');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the draft'));
    }
  };

  const handleAccept = async () => {
    try {
      await acceptQuote.mutateAsync();
      toast.success('Quote accepted');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not accept the quote'));
    }
  };

  const handleReject = async () => {
    try {
      await rejectQuote.mutateAsync();
      toast.success('Quote rejected');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not reject the quote'));
    }
  };

  const handleConvert = async () => {
    try {
      const invoiceId = await convertToInvoice.mutateAsync(docId!);
      toast.success('Converted to invoice');
      void navigate(`/finance/${invoiceId}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not convert to invoice'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void navigate('/finance')} size="icon" variant="ghost">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-ink truncate text-xl font-semibold">
            {isCreate
              ? `New ${typeMeta.label}`
              : document
                ? (document.number ?? `Draft ${typeMeta.label}`)
                : `Draft ${typeMeta.label}`}
          </h1>
          {document && statusMeta && (
            <div className="text-ink-secondary mt-0.5 flex items-center gap-2 text-sm">
              <StatusChip variant={statusMeta.tone}>{statusMeta.label}</StatusChip>
              {document.issue_date && <span>Issued {formatDate(document.issue_date)}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isEditable && isAdmin && isDraft && (
            <Button onClick={() => void handleDelete()} variant="ghost">
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}
          {isEditable && (
            <Button onClick={() => void handleIssue()} variant="primary">
              Issue
            </Button>
          )}
          {!isCreate && document && document.status !== 'draft' && (
            <Button onClick={() => void navigate(`/finance/${docId}/print`)} variant="secondary">
              <Printer className="mr-1.5 h-4 w-4" />
              Print / PDF
            </Button>
          )}
        </div>
      </div>

      {/* Meta fields */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Organisation" required>
            {isCreate || isDraft ? (
              <div className="space-y-1.5">
                <Select onValueChange={setOrganisationId} value={organisationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Search & pick" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <Input
                        onChange={(e) => setOrgSearch(e.target.value)}
                        placeholder="Search…"
                        value={orgSearch}
                      />
                    </div>
                    {(orgOptions ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {organisationId && <p className="text-ink-muted text-xs">Linked to a client</p>}
              </div>
            ) : (
              <div className="rounded-control border-border bg-surface-sunken border px-3 py-2 text-sm">
                {loaded?.document?.organisation_id ? 'Linked organisation' : '—'}
              </div>
            )}
          </Field>

          <Field label="Contact">
            {isCreate || isDraft ? (
              <Select disabled={!organisationId} onValueChange={setContactId} value={contactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {(contactOptions ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-control border-border bg-surface-sunken border px-3 py-2 text-sm">
                {contactId ? 'Linked contact' : '—'}
              </div>
            )}
          </Field>

          <Field label={isInvoice ? 'Due date' : type === 'quote' ? 'Valid until' : 'Issue date'}>
            <Input
              disabled={!(isCreate || isDraft)}
              onChange={(e) => {
                if (isInvoice) setDueDate(e.target.value);
                else if (type === 'quote') setValidUntil(e.target.value);
                else setIssueDate(e.target.value);
              }}
              type="date"
              value={isInvoice ? dueDate : type === 'quote' ? validUntil : issueDate}
            />
          </Field>

          <Field label="VAT applicable">
            <div className="flex h-9 items-center">
              <Switch
                checked={vatApplicable}
                disabled={!(isCreate || isDraft)}
                onCheckedChange={setVatApplicable}
              />
              <span className="text-ink-secondary ml-2 text-sm">
                {vatRateBp / 100n}.{String(vatRateBp % 100n).padStart(2, '0')}%
              </span>
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Line items</CardTitle>
          {isEditable && (
            <Button onClick={() => void handleAddLine()} size="sm" variant="secondary">
              <Plus className="mr-1.5 h-4 w-4" />
              Add line
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editorLines.length === 0 ? (
            <p className="text-ink-muted text-sm">No line items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-border bg-surface-sunken border-b">
                    <Th className="w-full">Description</Th>
                    <Th className="w-20">Qty</Th>
                    <Th className="w-24">Unit</Th>
                    <Th className="w-36 text-right">Unit price</Th>
                    <Th className="w-36 text-right">Line total</Th>
                    {isEditable && <Th className="w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {editorLines.map((line, index) => (
                    <LineRow
                      key={line.id}
                      editable={isEditable}
                      line={line}
                      onRemove={() => void handleRemoveLine(line)}
                      onUpdate={(patch) => {
                        if (isCreate) {
                          setEditorLines((prev) =>
                            prev.map((l) => (l.id === line.id ? { ...l, ...patch } : l)),
                          );
                        } else {
                          const merged = { ...line, ...patch };
                          setEditorLines((prev) => {
                            const found = prev.find((l) => l.id === line.id);
                            return found
                              ? prev.map((l) => (l.id === line.id ? merged : l))
                              : [...prev, merged];
                          });
                          void persistLine(merged, index);
                        }
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Subtotal">
              <Money value={totals.subtotalUgx} />
            </Row>
            <Row label="VAT (18%)">
              <Money value={totals.vatUgx} />
            </Row>
            <Row label="Total" strong>
              <Money value={totals.totalUgx} />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes &amp; terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              disabled={!isEditable}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void saveDraftFields()}
              placeholder="Internal notes"
              rows={2}
              value={notes}
            />
            <Textarea
              disabled={!isEditable}
              onChange={(e) => setTerms(e.target.value)}
              onBlur={() => void saveDraftFields()}
              placeholder="Terms shown on the document"
              rows={2}
              value={terms}
            />
          </CardContent>
        </Card>
      </div>

      {/* Issued actions / payments / EFRIS / timeline */}
      {!isCreate && document && document.status !== 'draft' && (
        <>
          <div className="flex flex-wrap gap-2">
            {document.type === 'quote' && document.status === 'issued' && (
              <>
                <Button onClick={() => void handleAccept()} variant="primary">
                  Mark accepted
                </Button>
                <Button onClick={() => void handleReject()} variant="secondary">
                  Mark rejected
                </Button>
              </>
            )}
            {document.type === 'quote' && document.status === 'accepted' && (
              <Button onClick={() => void handleConvert()} variant="primary">
                Convert to invoice
              </Button>
            )}
            {document.type === 'invoice' && document.status !== 'paid' && (
              <Button onClick={() => setPaymentOpen(true)} variant="primary">
                Record payment
              </Button>
            )}
          </div>

          {isInvoice && (
            <EfrisPanel
              document={document}
              onSave={(fdn, qr) => {
                updateEfris.mutate({ efris_fdn: fdn, efris_qr_url: qr, efris_status: 'issued' });
              }}
            />
          )}

          {payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-border bg-surface-sunken border-b">
                        <Th>Date</Th>
                        <Th>Method</Th>
                        <Th className="text-right">Received</Th>
                        <Th className="text-right">WHT withheld</Th>
                        <Th>Reference</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr className="border-border border-b last:border-0" key={p.id}>
                          <td className="text-ink-secondary px-4 py-2.5">
                            {formatDate(p.received_at)}
                          </td>
                          <td className="text-ink-secondary px-4 py-2.5">
                            {p.method.replace('_', ' ')}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Money value={BigInt(p.amount_received_ugx)} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {p.wht_withheld_ugx > 0 ? (
                              <Money value={BigInt(p.wht_withheld_ugx)} />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="text-ink-secondary px-4 py-2.5">{p.reference ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-sm">
                  <Row label="Remaining balance">
                    <Money value={computedBalance} />
                  </Row>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {(timeline ?? []).map((a) => (
                  <li className="flex gap-3" key={a.id}>
                    <span className="bg-border-strong mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    <div className="min-w-0">
                      <p className="text-ink text-sm">{a.body}</p>
                      <p className="text-ink-muted text-xs">{formatDateTime(a.occurred_at)}</p>
                    </div>
                  </li>
                ))}
                {(timeline ?? []).length === 0 && (
                  <li className="text-ink-muted text-sm">No activity yet.</li>
                )}
              </ol>
            </CardContent>
          </Card>
        </>
      )}

      <RecordPaymentSheet
        balanceUgx={computedBalance}
        documentId={docId ?? ''}
        onOpenChange={setPaymentOpen}
        open={paymentOpen}
        totalUgx={document ? BigInt(document.total_ugx) : 0n}
      />
    </div>
  );
}

function EfrisPanel({
  document,
  onSave,
}: {
  document: {
    efris_fdn: string | null;
    efris_qr_url: string | null;
    efris_status: string;
    vat_applicable: boolean;
  };
  onSave: (fdn: string, qr: string) => void;
}) {
  const [fdn, setFdn] = useState(document.efris_fdn ?? '');
  const [qr, setQr] = useState(document.efris_qr_url ?? '');

  useEffect(() => {
    setFdn(document.efris_fdn ?? '');
    setQr(document.efris_qr_url ?? '');
  }, [document]);

  if (!document.vat_applicable) return null;

  const needsEfris =
    document.efris_status === 'pending' ||
    (document.efris_status === 'not_required' && !document.efris_fdn);

  return (
    <Card>
      <CardHeader>
        <CardTitle>EFRIS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {needsEfris && !document.efris_fdn && (
          <div className="rounded-control border-warning/30 bg-warning-soft text-warning-ink border px-3 py-2 text-sm">
            This VAT document is not yet registered on EFRIS. Paste the FDN after filing.
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="FDN">
            <Input
              onChange={(e) => setFdn(e.target.value)}
              placeholder="Fiscal Device Number"
              value={fdn}
            />
          </Field>
          <Field label="QR URL">
            <Input
              onChange={(e) => setQr(e.target.value)}
              placeholder="https://efris…"
              value={qr}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!fdn.trim() && !qr.trim()}
            onClick={() => onSave(fdn.trim(), qr.trim())}
            size="sm"
            variant="secondary"
          >
            Save EFRIS details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LineRow({
  line,
  editable,
  onRemove,
  onUpdate,
}: {
  line: EditorLine;
  editable: boolean;
  onRemove: () => void;
  onUpdate: (patch: Partial<EditorLine>) => void;
}) {
  const lineTotal = lineTotalUgx(Number(line.qty) || 0, parseUGX(line.unitPrice) ?? 0n);
  return (
    <tr className="border-border border-b last:border-0">
      <td className="px-4 py-2.5">
        <Input
          disabled={!editable}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Description"
          value={line.description}
        />
      </td>
      <td className="px-4 py-2.5">
        <Input
          disabled={!editable}
          inputMode="decimal"
          onChange={(e) => onUpdate({ qty: e.target.value })}
          value={line.qty}
        />
      </td>
      <td className="px-4 py-2.5">
        <Input
          disabled={!editable}
          onChange={(e) => onUpdate({ unit: e.target.value })}
          placeholder="days"
          value={line.unit}
        />
      </td>
      <td className="px-4 py-2.5">
        <Input
          disabled={!editable}
          inputMode="numeric"
          onChange={(e) => onUpdate({ unitPrice: e.target.value })}
          placeholder="0"
          value={line.unitPrice}
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <Money value={lineTotal} />
      </td>
      {editable && (
        <td className="px-4 py-2.5">
          <Button onClick={onRemove} size="icon" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </td>
      )}
    </tr>
  );
}

function Row({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-secondary">{label}</span>
      <span className={strong ? 'text-ink font-semibold' : 'text-ink'}>{children}</span>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`font-display text-ink-secondary px-4 py-2.5 text-xs font-semibold ${className}`}
    >
      {children}
    </th>
  );
}

function errorMessage(e: unknown, fallback: string): string {
  return e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
    ? e.message
    : fallback;
}
