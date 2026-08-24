import { Badge } from '@/components/ui';
import type { StatsCoverage } from '@/domain/types';

/**
 * States the SCOPE of the player numbers.
 *
 * Match detail is fetched for a recent window, so these aggregates are partial
 * by construction. Showing a striker on "3 goals" when the real figure is nine
 * is worse than showing nothing, so the scope is stated wherever the numbers
 * appear — not buried in a methodology page nobody opens.
 */
export function CoverageNote({ coverage }: { coverage: StatsCoverage | undefined }) {
  if (!coverage) return null;
  if (coverage.complete) {
    return (
      <Badge tone="neutral" title={`All ${coverage.matchesPlayed} matches played this season are included.`}>
        Full season · {coverage.matchesPlayed} matches
      </Badge>
    );
  }
  return (
    <Badge
      tone="warning"
      title={`Detail was ingested for ${coverage.matchesCovered} of the ${coverage.matchesPlayed} matches played. These are NOT season totals.`}
    >
      Last {coverage.matchesCovered} of {coverage.matchesPlayed} matches
    </Badge>
  );
}

/** The same statement in prose, for the top of a page. */
export function CoverageSentence({ coverage }: { coverage: StatsCoverage | undefined }) {
  if (!coverage || coverage.complete) return null;
  return (
    <p className="text-xs text-ink-muted">
      These are <strong className="text-ink-secondary">not season totals</strong>. Player
      detail is ingested for a recent window, covering {coverage.matchesCovered} of the{' '}
      {coverage.matchesPlayed} matches played so far.
    </p>
  );
}
