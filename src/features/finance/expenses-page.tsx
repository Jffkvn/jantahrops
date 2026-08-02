import { useMemo, useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip } from '@/components/status-chip';
import { Money } from '@/components/money';
import { EmptyState } from '@/components/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/format';
import { useExpenses, useExpenseCategorySummary } from './use-finance';
import { EXPENSE_CATEGORIES } from './document-meta';
import { ExpenseSheet } from './expense-sheet';
import { currentMonth } from './document-meta';
import type { ExpenseCategory } from '@/types/database';

export function ExpensesPage() {
  const [category, setCategory] = useState<ExpenseCategory | 'all'>('all');
  const [month, setMonth] = useState(currentMonth());
  const [page, setPage] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const pageSize = 25;

  const { data: summary } = useExpenseCategorySummary(month);
  const { data, isLoading } = useExpenses({ category, month, page, pageSize });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / pageSize);

  const monthLabel = useMemo(() => formatMonthLabel(month), [month]);

  return (
    <div>
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setEditingId(null);
              setSheetOpen(true);
            }}
            variant="primary"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add expense
          </Button>
        }
        description="What money went out, and on what."
        title="Expenses"
      />

      {/* Month + total strip */}
      <div className="rounded-card border-border bg-surface mb-6 border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-pill bg-surface-sunken text-primary flex h-10 w-10 items-center justify-center">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-ink-secondary text-xs font-medium">{monthLabel} total</p>
              {summary ? (
                <Money value={BigInt(summary.month_total_ugx)} />
              ) : (
                <Skeleton className="h-5 w-28" />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <MonthInput
              month={month}
              onMonthChange={(m) => {
                setMonth(m);
                setPage(0);
              }}
            />
            <Select
              onValueChange={(v) => {
                setCategory(v as ExpenseCategory | 'all');
                setPage(0);
              }}
              value={category}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {summary && summary.categories.length > 0 && (
          <div className="border-border mt-4 flex flex-wrap gap-2 border-t pt-4">
            {summary.categories.map((c) => (
              <div
                className="rounded-pill border-border bg-surface-sunken border px-3 py-1 text-xs"
                key={c.category}
              >
                <span className="text-ink-secondary">{c.category}: </span>
                <span className="num text-ink font-medium">{formatUGXShort(c.total_ugx)}</span>
              </div>
            ))}
          </div>
        )}
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
            <Button
              onClick={() => {
                setEditingId(null);
                setSheetOpen(true);
              }}
              variant="primary"
            >
              Add an expense
            </Button>
          }
          description={
            category !== 'all'
              ? 'No expenses in this category for the selected month.'
              : 'Expenses recorded here appear in the money view.'
          }
          headline="No expenses yet"
          icon={<Wallet className="h-6 w-6" />}
        />
      ) : (
        <div>
          <div className="rounded-card border-border bg-surface overflow-x-auto border">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-border bg-surface-sunken border-b">
                  <Th>Date</Th>
                  <Th>Category</Th>
                  <Th>Description</Th>
                  <Th>Vendor</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((expense) => (
                  <tr
                    className="border-border hover:bg-surface-sunken/60 cursor-pointer border-b last:border-0"
                    key={expense.id}
                    onClick={() => {
                      setEditingId(expense.id);
                      setSheetOpen(true);
                    }}
                  >
                    <td className="text-ink-secondary px-4 py-2.5">
                      {formatDate(expense.incurred_on)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusChip variant="neutral">{expense.category}</StatusChip>
                    </td>
                    <td className="text-ink px-4 py-2.5">{expense.description ?? '—'}</td>
                    <td className="text-ink-secondary px-4 py-2.5">{expense.vendor ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Money value={BigInt(expense.amount_ugx)} />
                    </td>
                  </tr>
                ))}
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

      <ExpenseSheet
        editingId={editingId}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditingId(null);
        }}
        open={sheetOpen}
      />
    </div>
  );
}

function MonthInput({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (m: string) => void;
}) {
  return (
    <input
      aria-label="Month"
      className="rounded-control border-border bg-surface text-ink focus:ring-ring border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
      onChange={(e) => onMonthChange(e.target.value)}
      type="month"
      value={month}
    />
  );
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  const name = new Date(y, m - 1, 1).toLocaleString('en-UG', { month: 'long', year: 'numeric' });
  return name;
}

function formatUGXShort(value: number): string {
  const n = BigInt(value);
  if (n >= 1_000_000n) return `UGX ${n / 1_000_000n}M`;
  if (n >= 1_000n) return `UGX ${n / 1_000n}K`;
  return `UGX ${n}`;
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
