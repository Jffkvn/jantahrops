import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { StatusChip } from '@/components/status-chip';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { DataTable, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Plus, User, Search, Sparkles } from 'lucide-react';

interface SampleRow {
  id: string;
  name: string;
  organisation: string;
  role: string;
  amount: bigint;
  status: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const sampleData: SampleRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: `ROW-${i + 1}`,
  name: [
    'Sarah Nakato',
    'David Ochieng',
    'Grace Akello',
    'Peter Tumusiime',
    'Juliet Katusiime',
  ][i % 5]!,
  organisation: [
    'Stanbic Bank Uganda',
    'MTN Uganda',
    'CiplaQCIL',
    'Mukwano Group',
    'Kakira Sugar',
  ][i % 5]!,
  role: ['Senior HR Lead', 'Recruitment Lead', 'Payroll Admin', 'HR Specialist', 'Talent Partner'][i % 5]!,
  amount: BigInt((i + 1) * 450000),
  status: (['success', 'warning', 'danger', 'info', 'neutral'] as const)[i % 5]!,
}));

export function StyleguidePage() {
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [switchChecked, setSwitchChecked] = useState(true);

  const sampleColumns: Column<SampleRow>[] = [
    { header: 'ID', accessorKey: 'id', className: 'w-20 font-mono text-xs' },
    {
      header: 'Name',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback>{item.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{item.name}</span>
        </div>
      ),
    },
    { header: 'Organisation', accessorKey: 'organisation' },
    { header: 'Role', accessorKey: 'role' },
    {
      header: 'Status',
      cell: (item) => (
        <StatusChip variant={item.status}>
          {item.status.toUpperCase()}
        </StatusChip>
      ),
    },
    {
      header: 'Contract Value',
      align: 'right',
      cell: (item) => <Money value={item.amount} />,
    },
  ];

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-canvas p-6 text-ink sm:p-12">
        <div className="mx-auto max-w-7xl space-y-12">
          {/* Styleguide Header */}
          <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <img src="/brand/logo-mark.svg" alt="JantaHR Mark" className="h-8 w-8 text-primary" />
                <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
                  JantaHR Ops Design System
                </h1>
              </div>
              <p className="mt-1 text-sm text-ink-secondary">
                Token set, typography scale, and restyled components in light & dark mode (/styleguide).
              </p>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
            </div>
          </div>

          {/* 1. Colour Swatches */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">1. Colour Tokens</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
              {[
                { name: 'Canvas', varName: 'bg-canvas', hex: 'F4F6F8 / 0A141A' },
                { name: 'Surface', varName: 'bg-surface', hex: 'FFFFFF / 101E26' },
                { name: 'Sunken', varName: 'bg-surface-sunken', hex: 'ECF0F3 / 16272F' },
                { name: 'Border', varName: 'bg-border', hex: 'E1E7EC / 21363F' },
                { name: 'Ink Primary', varName: 'bg-ink', hex: '0D2B37 / E7EEF2' },
                { name: 'Ink Muted', varName: 'bg-ink-muted', hex: '5C7380 / 6E8896' },
                { name: 'Primary Deep', varName: 'bg-primary', hex: '0B5978 / 2C8FB5' },
                { name: 'Primary Soft', varName: 'bg-primary-soft', hex: 'E6EFF3 / 12313F' },
                { name: 'Amber Accent', varName: 'bg-highlight', hex: 'F2B33D / F5C05A' },
                { name: 'Success Soft', varName: 'bg-success-soft', hex: 'E4F3EB / 122C22' },
                { name: 'Warning Soft', varName: 'bg-warning-soft', hex: 'FBF1E0 / 2E2413' },
                { name: 'Danger Soft', varName: 'bg-danger-soft', hex: 'FAE9E7 / 2E1A18' },
              ].map((swatch) => (
                <div key={swatch.name} className="rounded-card border border-border bg-surface p-3 shadow-xs">
                  <div className={`h-12 w-full rounded-control border border-border ${swatch.varName}`} />
                  <p className="mt-2 text-xs font-semibold text-ink">{swatch.name}</p>
                  <p className="text-[10px] text-ink-muted">{swatch.hex}</p>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* 2. Typography Scale */}
          <section className="space-y-6">
            <h2 className="font-display text-xl font-semibold text-ink">2. Typography & Tabular Numerals</h2>
            <div className="rounded-card border border-border bg-surface p-6 space-y-4">
              <div>
                <p className="text-xs text-ink-muted">Heading / Display (Satoshi 300–900)</p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-ink">30px Display Title — JantaHR Ops</h1>
                <h2 className="font-display text-2xl font-semibold text-ink">24px Section Header</h2>
                <h3 className="font-display text-xl font-semibold text-ink">20px Subtitle</h3>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-ink-muted">Body (Inter 100–900)</p>
                <p className="text-base text-ink">Base 14px: JantaHR Ops is an internal operating system for HR consultancy in Uganda.</p>
                <p className="text-sm text-ink-secondary">Small 13px: Secondary text, timestamps, helper labels.</p>
                <p className="text-xs text-ink-muted">Tiny 12px: Micro badges, legal disclaimers.</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-ink-muted mb-2">Tabular Numerals Alignment Demo (.num)</p>
                <div className="inline-block rounded-control border border-border bg-surface-sunken p-4">
                  <div className="num font-mono text-sm space-y-1">
                    <p className="text-right">UGX 1,000,000</p>
                    <p className="text-right">UGX 4,500,000</p>
                    <p className="text-right">UGX 999,999,999</p>
                    <p className="text-right">UGX 12,345,678</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* 3. Buttons */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">3. Buttons & Variants</h2>
            <div className="rounded-card border border-border bg-surface p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primary Button</Button>
                <Button variant="secondary">Secondary Button</Button>
                <Button variant="ghost">Ghost Button</Button>
                <Button variant="highlight">
                  <Sparkles className="mr-1.5 h-4 w-4" /> Highlight Amber CTA
                </Button>
                <Button variant="danger">Danger Button</Button>
                <Button variant="link">Link Button</Button>
                <Button disabled variant="primary">Disabled</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="primary">Small (32px)</Button>
                <Button size="md" variant="primary">Medium (36px)</Button>
                <Button size="lg" variant="primary">Large (40px)</Button>
                <Button size="icon" variant="secondary" aria-label="Search">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>

          <Separator />

          {/* 4. Form Controls */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">4. Form Controls</h2>
            <div className="rounded-card border border-border bg-surface p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="demo-input">Full Name</Label>
                <Input id="demo-input" placeholder="e.g. Sarah Nakato" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demo-error-input">Email (Error State)</Label>
                <Input id="demo-error-input" error defaultValue="invalid-email" />
                <p className="text-xs text-danger">Please enter a valid email address.</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="demo-textarea">Notes & Activity Summary</Label>
                <Textarea id="demo-textarea" placeholder="Type interaction notes here..." />
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="demo-checkbox"
                  checked={checkboxChecked}
                  onCheckedChange={(c) => setCheckboxChecked(Boolean(c))}
                />
                <Label htmlFor="demo-checkbox" className="cursor-pointer">
                  Notify assigned team member via email
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="demo-switch"
                  checked={switchChecked}
                  onCheckedChange={(s) => setSwitchChecked(Boolean(s))}
                />
                <Label htmlFor="demo-switch" className="cursor-pointer">
                  Enable automated reminders
                </Label>
              </div>
            </div>
          </section>

          <Separator />

          {/* 5. StatusChip */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">5. StatusChip Component</h2>
            <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-6">
              <StatusChip variant="success">Active / Won</StatusChip>
              <StatusChip variant="warning">Pending / Follow-up</StatusChip>
              <StatusChip variant="danger">Overdue / Lost</StatusChip>
              <StatusChip variant="info">In Review / Contacted</StatusChip>
              <StatusChip variant="neutral">Draft / Archived</StatusChip>
            </div>
          </section>

          <Separator />

          {/* 6. Custom Primitives */}
          <section className="space-y-6">
            <h2 className="font-display text-xl font-semibold text-ink">6. Primitives (EmptyState, Money, Card)</h2>
            <Card>
              <CardHeader>
                <CardTitle>Card Title Example</CardTitle>
                <CardDescription>Hairline border with 16px radius and soft whitespace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-ink-secondary">
                  Money formatting component demo: <Money value={4500000n} /> (Full) or <Money value={4500000n} compact /> (Compact).
                </p>
                <EmptyState
                  headline="No leads found"
                  description="Create a new lead or import contacts to begin tracking follow-ups."
                  action={
                    <Button variant="highlight">
                      <Plus className="mr-1.5 h-4 w-4" /> Add First Lead
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* 7. Overlays (Dialog, Sheet, Dropdown, Toast) */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">7. Overlays & Interactive Components</h2>
            <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-6">
              {/* Dialog */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">Open Modal Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm Action</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to merge these two contacts? This action repoints all foreign keys.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary">Confirm Merge</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Sheet */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="secondary">Open Slide-over Sheet</Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>New Lead Details</SheetTitle>
                    <SheetDescription>
                      Enter candidate or corporate lead details below.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="sheet-name">Name</Label>
                      <Input id="sheet-name" placeholder="Full name" />
                    </div>
                    <Button className="w-full" variant="primary">
                      Save Lead
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">Actions Dropdown</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>View Detail</DropdownMenuItem>
                  <DropdownMenuItem>Log Activity</DropdownMenuItem>
                  <DropdownMenuItem className="text-danger">Delete Record</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Tooltip */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <User className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>User profile options</p>
                </TooltipContent>
              </Tooltip>

              {/* Toast */}
              <Button
                variant="secondary"
                onClick={() => toast.success('Lead follow-up drafted successfully!')}
              >
                Trigger Toast
              </Button>
            </div>
          </section>

          <Separator />

          {/* 8. DataTable Sample (25 rows) */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">8. High Density DataTable (25 Rows)</h2>
            <DataTable data={sampleData} columns={sampleColumns} keyExtractor={(item) => item.id} />
          </section>

          <Separator />

          {/* 9. Skeletons */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">9. Loading Skeletons</h2>
            <div className="rounded-card border border-border bg-surface p-6 space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-10 w-full" />
            </div>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default StyleguidePage;
