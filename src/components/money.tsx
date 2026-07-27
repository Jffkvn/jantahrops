import { formatUGX, formatUGXCompact } from '@/lib/format';

interface MoneyProps {
  value: bigint;
  compact?: boolean;
  muted?: boolean;
  className?: string;
}

export function Money({ value, compact = false, muted = false, className = '' }: MoneyProps) {
  const formatted = compact ? formatUGXCompact(value) : formatUGX(value);
  const colorClass = muted ? 'text-ink-muted' : 'text-ink';

  return <span className={`num font-semibold ${colorClass} ${className}`}>{formatted}</span>;
}
