import { StatusChip } from '@/components/status-chip';
import type { ApplicationMatchTier } from '@/types/database';
import { MATCH_TIER_META } from './ai-matching-schema';

export function MatchBadge({
  tier,
  score,
  compact = false,
}: {
  tier: ApplicationMatchTier | null | undefined;
  score?: number | null | undefined;
  compact?: boolean | undefined;
}) {
  if (!tier) return null;

  const meta = MATCH_TIER_META[tier];
  const label = compact ? meta.shortLabel : meta.label;
  const showScore = tier !== 'unscored' && score != null && Number.isFinite(score);

  return (
    <StatusChip showDot={!compact} variant={meta.tone}>
      <span className="tabular-nums">
        {label}
        {showScore ? ` · ${Math.round(score)}%` : ''}
      </span>
    </StatusChip>
  );
}
