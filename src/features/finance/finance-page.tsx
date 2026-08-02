import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, ReceiptText } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip } from '@/components/status-chip';
import { Money } from '@/components/money';
import { EmptyState } from '@/components/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useFinanceSummary, useDocuments } from './use-finance';
import {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  documentTypeMeta,
  documentStatusMeta,
} from './document-meta';
import type { DocumentType, DocumentStatus } from '@/types/database';

export function FinancePage() {
  const navigate = useNavigate();
  const { data: summary } = useFinanceSummary();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState<DocumentType | 'all'>('all');
  const [status, setStatus] = useState<DocumentStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useDocuments({
    type,
    status,
    search: debouncedSearch,
    page,
    pageSize,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / pageSize);

  return (
    <div>
      <PageHeader
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="primary">
                <Plus className="mr-1.5 h-4 w-4" />
                New document
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {DOCUMENT_TYPES.filter((t) => t.value !== 'receipt').map((t) => (
                <DropdownMenuItem
                  key={t.value}
                  onSelect={() => void navigate(`/finance/new/${t.value}`)}
                >
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
        description="Money in, money out, and the documents that move it."
        title="Finance"
      />

      {/* Money view — numbers lead here */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Receivables" value={summary?.receivables_ugx} />
        <StatCard
          danger={Boolean(summary && summary.overdue_ugx > 0)}
          label="Overdue"
          value={summary?.overdue_ugx}
        />
        <StatCard label="In this month" value={summary?.revenue_month_ugx} />
        <StatCard label="Out this month" value={summary?.expenses_month_ugx} />
        <StatCard label="WHT credit (YTD)" value={summary?.wht_credit_year_ugx} />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-ink-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number or organisation…"
            value={search}
          />
        </div>

        <Select
          onValueChange={(v) => {
            setType(v as DocumentType | 'all');
            setPage(0);
          }}
          value={type}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(v) => {
            setStatus(v as DocumentStatus | 'all');
            setPage(0);
          }}
          value={status}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {DOCUMENT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton className="rounded-control h-12 w-full" key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => void navigate('/finance/new/quote')} variant="primary">
              Create a document
            </Button>
          }
          description={
            type !== 'all' || status !== 'all' || debouncedSearch
              ? 'No documents match these filters. Try clearing them.'
              : 'Quotes, LPOs, invoices and receipts will appear here.'
          }
          headline="No documents yet"
          icon={<ReceiptText className="h-6 w-6" />}
        />
      ) : (
        <div>
          <div className="rounded-card border-border bg-surface overflow-x-auto border">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-border bg-surface-sunken border-b">
                  <Th>Number</Th>
                  <Th>Type</Th>
                  <Th>Organisation</Th>
                  <Th>Issue date</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((doc) => {
                  const typeMeta = documentTypeMeta(doc.type);
                  const statusMeta = documentStatusMeta(doc.status);
                  return (
                    <tr
                      className="border-border hover:bg-surface-sunken/60 cursor-pointer border-b last:border-0"
                      key={doc.id}
                      onClick={() => void navigate(`/finance/${doc.id}`)}
                    >
                      <td className="text-ink px-4 py-2.5 font-medium">{doc.number ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <StatusChip variant={typeMeta.tone}>{typeMeta.label}</StatusChip>
                      </td>
                      <td className="text-ink-secondary px-4 py-2.5">
                        {doc.organisation?.name ?? '—'}
                      </td>
                      <td className="text-ink-secondary px-4 py-2.5">
                        {doc.issue_date ? formatDate(doc.issue_date) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Money value={BigInt(doc.total_ugx)} />
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusChip variant={statusMeta.tone}>{statusMeta.label}</StatusChip>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {doc.balance_ugx !== null ? (
                          <Money value={BigInt(doc.balance_ugx)} />
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="text-ink-muted mt-3 flex items-center justify-between text-sm">
              <span className="num">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  size="sm"
                  variant="secondary"
                >
                  Previous
                </Button>
                <Button
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage(page + 1)}
                  size="sm"
                  variant="secondary"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number | undefined;
  danger?: boolean;
}) {
  return (
    <div className="rounded-card border-border bg-surface border p-4">
      <p className="text-ink-secondary text-xs font-medium">{label}</p>
      <div className="mt-1">
        {value !== undefined ? (
          <Money value={BigInt(value)} className={cn(danger && 'text-danger')} />
        ) : (
          <Skeleton className="h-5 w-24" />
        )}
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`font-display text-ink-secondary px-4 py-2.5 text-xs font-semibold ${className}`}
    >
      {children}
    </th>
  );
}
