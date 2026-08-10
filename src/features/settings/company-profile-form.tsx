import { useEffect, useState } from 'react';
import { Loader2, Lock, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizeUgandanPhone } from '@/lib/phone';
import { formatUGX, parseUGX } from '@/lib/format';
import { useAuth } from '@/features/auth/auth-provider';
import { useCompanyProfile } from '@/features/finance/use-finance';
import { useUpdateCompanyProfile } from './use-settings';

type FormState = {
  legal_name: string;
  tin: string;
  address: string;
  email: string;
  phone: string;
  bank_details: string;
  momo_details: string;
  vat_registered: boolean;
  vat_rate_pct: string;
  wht_rate_pct: string;
  internal_day_rate: string;
};

const EMPTY: FormState = {
  legal_name: '',
  tin: '',
  address: '',
  email: '',
  phone: '',
  bank_details: '',
  momo_details: '',
  vat_registered: true,
  vat_rate_pct: '18',
  wht_rate_pct: '6',
  internal_day_rate: '',
};

/**
 * Rates are stored in basis points (1800 = 18.00%) so the money maths stays in
 * integers, but nobody thinks in basis points. The form talks percent and
 * converts at the boundary, rounding to the nearest basis point.
 */
function pctToBp(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

export function CompanyProfileForm() {
  const { isAdmin } = useAuth();
  const { data: company, isLoading } = useCompanyProfile();
  const save = useUpdateCompanyProfile();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!company) return;
    setForm({
      legal_name: company.legal_name,
      tin: company.tin ?? '',
      address: company.address ?? '',
      email: company.email ?? '',
      phone: company.phone ?? '',
      bank_details: company.bank_details ?? '',
      momo_details: company.momo_details ?? '',
      vat_registered: company.vat_registered,
      vat_rate_pct: String(company.vat_rate_bp / 100),
      wht_rate_pct: String(company.wht_rate_bp / 100),
      internal_day_rate:
        company.internal_day_rate_ugx === null ? '' : String(company.internal_day_rate_ugx),
    });
  }, [company]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.legal_name.trim()) next.legal_name = 'The legal name prints on every document.';
    if (form.phone && !normalizeUgandanPhone(form.phone)) {
      next.phone = 'Enter a valid Ugandan phone number.';
    }
    const vatBp = pctToBp(form.vat_rate_pct);
    const whtBp = pctToBp(form.wht_rate_pct);
    if (vatBp === null) next.vat_rate_pct = 'Enter a percentage between 0 and 100.';
    if (whtBp === null) next.wht_rate_pct = 'Enter a percentage between 0 and 100.';

    // Blank is meaningful here: it means "not set", and project profit is then
    // shown as unavailable rather than guessed.
    const rateRaw = form.internal_day_rate.trim();
    const dayRate = rateRaw ? parseUGX(rateRaw) : null;
    if (rateRaw && (dayRate === null || dayRate <= 0n)) {
      next.internal_day_rate = 'Enter a whole amount in shillings, e.g. 250,000.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      await save.mutateAsync({
        legal_name: form.legal_name.trim(),
        tin: form.tin.trim() || null,
        address: form.address.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        bank_details: form.bank_details.trim() || null,
        momo_details: form.momo_details.trim() || null,
        vat_registered: form.vat_registered,
        vat_rate_bp: vatBp!,
        wht_rate_bp: whtBp!,
        internal_day_rate_ugx: dayRate === null ? null : Number(dayRate),
      });
      toast.success('Company details saved');
    } catch {
      toast.error('Could not save. Only an admin can change company details.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton className="h-16 w-full rounded-card" key={i} />
        ))}
      </div>
    );
  }

  const dayRatePreview = form.internal_day_rate.trim()
    ? parseUGX(form.internal_day_rate)
    : null;

  const missing = [
    !form.tin && 'TIN',
    !form.address && 'address',
    !form.bank_details && !form.momo_details && 'payment details',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {/* The whole reason this page was built: an invoice with no TIN and no
          account number is a document a client cannot act on. Say so here
          rather than letting it be discovered at the printer. */}
      {missing.length > 0 && (
        <div className="rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink">
          <p className="font-medium">Your invoices are missing {missing.join(', ')}.</p>
          <p className="mt-1 text-ink-secondary">
            These print on every quote, invoice and receipt. Fill them in below and any
            document you issue from now on will carry them.
          </p>
        </div>
      )}

      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-card border border-border bg-surface-sunken/60 px-4 py-3 text-sm text-ink-secondary">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Only an admin can change these. You can read them, but saving will be rejected —
            ask an admin to promote your account under Team.
          </p>
        </div>
      )}

      <Section
        description="Prints as the letterhead on every document you issue."
        title="Identity"
      >
        <Field error={errors.legal_name} label="Legal name" required>
          <Input
            disabled={!isAdmin}
            onChange={(e) => set('legal_name', e.target.value)}
            value={form.legal_name}
          />
        </Field>
        <Field
          hint="URA Taxpayer Identification Number. Clients need this to claim the input VAT."
          label="TIN"
        >
          <Input
            disabled={!isAdmin}
            onChange={(e) => set('tin', e.target.value)}
            placeholder="1000123456"
            value={form.tin}
          />
        </Field>
        <Field label="Address">
          <Textarea
            disabled={!isAdmin}
            onChange={(e) => set('address', e.target.value)}
            placeholder={'Plot 12, Nakawa\nKampala, Uganda'}
            rows={2}
            value={form.address}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input
              disabled={!isAdmin}
              onChange={(e) => set('email', e.target.value)}
              placeholder="accounts@jantahr.com"
              type="email"
              value={form.email}
            />
          </Field>
          <Field error={errors.phone} label="Phone">
            <Input
              disabled={!isAdmin}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="0772 123 456"
              value={form.phone}
            />
          </Field>
        </div>
      </Section>

      <Section
        description="Printed at the foot of every invoice — this is how a client actually pays you."
        title="How clients pay"
      >
        <Field label="Bank details">
          <Textarea
            disabled={!isAdmin}
            onChange={(e) => set('bank_details', e.target.value)}
            placeholder={'Stanbic Bank Uganda\nAccount name: JantaHR Ltd\nAccount number: 9030001234567\nBranch: Garden City'}
            rows={4}
            value={form.bank_details}
          />
        </Field>
        <Field label="Mobile money">
          <Textarea
            disabled={!isAdmin}
            onChange={(e) => set('momo_details', e.target.value)}
            placeholder={'MTN MoMo: 0772 123 456 (JantaHR)\nAirtel Money: 0752 123 456 (JantaHR)'}
            rows={3}
            value={form.momo_details}
          />
        </Field>
      </Section>

      <Section
        description="Uganda: VAT 18%, withholding tax 6%. Change these only if URA changes them."
        title="Tax"
      >
        <div className="flex items-center justify-between rounded-control border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-ink">VAT registered</p>
            <p className="text-xs text-ink-muted">
              {form.vat_registered
                ? 'Documents are titled "Tax Invoice" and carry a VAT line.'
                : 'Documents are titled "Invoice" and no VAT is charged.'}
            </p>
          </div>
          <Switch
            checked={form.vat_registered}
            disabled={!isAdmin}
            onCheckedChange={(v) => set('vat_registered', v)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={errors.vat_rate_pct} label="VAT rate (%)">
            <Input
              className="num"
              disabled={!isAdmin || !form.vat_registered}
              inputMode="decimal"
              onChange={(e) => set('vat_rate_pct', e.target.value)}
              value={form.vat_rate_pct}
            />
          </Field>
          <Field
            error={errors.wht_rate_pct}
            hint="Used to check whether a withheld invoice has settled."
            label="Withholding tax rate (%)"
          >
            <Input
              className="num"
              disabled={!isAdmin}
              inputMode="decimal"
              onChange={(e) => set('wht_rate_pct', e.target.value)}
              value={form.wht_rate_pct}
            />
          </Field>
        </div>

        <p className="text-xs text-ink-muted">
          Changing a rate affects documents you create from now on. Anything already issued
          keeps the numbers it was issued with —{' '}
          <Link className="text-primary hover:underline" to="/finance">
            see Finance
            <ExternalLink className="ml-0.5 inline h-3 w-3" />
          </Link>
          .
        </p>
      </Section>

      <Section
        description="What a day of your time costs the business. Used only to estimate project profit — it never appears on anything a client sees."
        title="Cost of your time"
      >
        <Field
          error={errors.internal_day_rate}
          hint="Leave blank if you'd rather not estimate. Projects then show costs without a profit figure, instead of guessing one."
          label="Internal day rate (UGX)"
        >
          <Input
            className="num"
            disabled={!isAdmin}
            inputMode="numeric"
            onChange={(e) => set('internal_day_rate', e.target.value)}
            placeholder="250,000"
            value={form.internal_day_rate}
          />
        </Field>

        {dayRatePreview !== null && dayRatePreview > 0n && (
          <p className="text-xs text-ink-secondary">
            {formatUGX(dayRatePreview)} a day ·{' '}
            <span className="num">{formatUGX(dayRatePreview * 5n)}</span> a five-day week.{' '}
            <Link className="text-primary hover:underline" to="/projects">
              See it applied in Projects
              <ExternalLink className="ml-0.5 inline h-3 w-3" />
            </Link>
          </p>
        )}
      </Section>

      <div className="flex justify-end">
        <Button disabled={!isAdmin || save.isPending} onClick={() => void submit()} variant="primary">
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save company details
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="font-display text-md font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-sm text-ink-secondary">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  );
}
