import type { ReactNode } from 'react';

export type StatusChipVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusChipProps {
  children: ReactNode;
  variant?: StatusChipVariant;
  showDot?: boolean;
  className?: string;
}

const variantStyles: Record<StatusChipVariant, { bg: string; text: string; dot: string }> = {
  success: {
    bg: 'bg-success-soft',
    text: 'text-success-ink',
    dot: 'bg-success',
  },
  warning: {
    bg: 'bg-warning-soft',
    text: 'text-warning-ink',
    dot: 'bg-warning',
  },
  danger: {
    bg: 'bg-danger-soft',
    text: 'text-danger-ink',
    dot: 'bg-danger',
  },
  info: {
    bg: 'bg-info-soft',
    text: 'text-info-ink',
    dot: 'bg-info',
  },
  neutral: {
    bg: 'bg-surface-sunken',
    text: 'text-ink-secondary',
    dot: 'bg-ink-muted',
  },
};

export function StatusChip({
  children,
  variant = 'neutral',
  showDot = true,
  className = '',
}: StatusChipProps) {
  const styles = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium ${styles.bg} ${styles.text} ${className}`}
    >
      {showDot && <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />}
      {children}
    </span>
  );
}
