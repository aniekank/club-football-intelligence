import { Figure, TeamLabel } from '@/components/ui';
import { ChartTable } from './primitives';
import { pct } from '@/lib/format';
import type { SeasonForecast, Team } from '@/domain/types';

/**
 * Projected final points, as a range per club.
 *
 * The single most important decision here is showing the RANGE rather than the
 * mean. A Monte Carlo whose output is rendered as one number has thrown away
 * the only thing it was run for — a club projected to finish on 68 points with
 * a 20-point spread and one with a 6-point spread are completely different
 * situations, and a bare "68" says they are identical.
 *
 * The form is a horizontal range bar per club: the pale bar is the 10th-to-90th
 * percentile, the darker inner bar the interquartile range, and the notch the
 * median. Rows are sorted by median, so the chart doubles as a projected table.
 *
 * Not a fan chart over time: that would need per-matchweek trajectories, which
 * implies a precision about WHEN points arrive that the simulation does not
 * have. Drawing it would be a more impressive-looking chart making a weaker
 * claim.
 */
export function SeasonProjection({
  forecasts, teams, limit = 10,
}: {
  forecasts: SeasonForecast[];
  teams: Team[];
  limit?: number;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rows = [...forecasts]
    .sort((a, b) => b.projectedPoints.p50 - a.projectedPoints.p50)
    .slice(0, limit);

  if (!rows.length) return null;

  // A shared scale across all rows — a per-row scale would make every club's
  // uncertainty look identical, which is the opposite of the point.
  const lo = Math.min(...rows.map((r) => r.projectedPoints.p10));
  const hi = Math.max(...rows.map((r) => r.projectedPoints.p90));
  const span = Math.max(hi - lo, 1);
  const at = (v: number) => ((v - lo) / span) * 100;

  return (
    <figure className="m-0">
      <ul className="space-y-1">
        {rows.map((f) => {
          const team = teamById.get(f.teamId);
          const p = f.projectedPoints;
          return (
            <li key={f.teamId} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
              <span className="min-w-0 text-sm">
                {team ? (
                  <TeamLabel
                    name={team.shortName}
                    code={team.code}
                    crestUrl={team.crestUrl}
                    size={16}
                  />
                ) : (
                  <span className="text-ink-muted">{f.teamId}</span>
                )}
              </span>

              <span className="relative block h-5" aria-hidden="true">
                {/* p10–p90 */}
                <span
                  className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-seq-200/40"
                  style={{ left: `${at(p.p10)}%`, width: `${at(p.p90) - at(p.p10)}%` }}
                />
                {/* interquartile */}
                <span
                  className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-seq-500/70"
                  style={{ left: `${at(p.p25)}%`, width: `${Math.max(at(p.p75) - at(p.p25), 1)}%` }}
                />
                {/* median notch, ringed in the surface colour so it stays
                    visible where the two bars overlap */}
                <span
                  className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                  style={{
                    left: `${at(p.p50)}%`,
                    boxShadow: '0 0 0 2px var(--surface-1)',
                  }}
                />
              </span>

              <span className="flex items-baseline gap-2 text-right">
                <Figure className="text-sm font-semibold">{p.p50}</Figure>
                <Figure tone="muted" className="w-16 text-2xs">
                  {p.p10}–{p.p90}
                </Figure>
              </span>

              <span className="sr-only">
                {team?.name ?? f.teamId}: projected {p.p50} points, likely range {p.p10} to{' '}
                {p.p90}. Title chance {pct(f.winTitle)}.
              </span>
            </li>
          );
        })}
      </ul>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-6 rounded-full bg-seq-200/40" aria-hidden="true" />
          10th–90th percentile
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-full bg-seq-500/70" aria-hidden="true" />
          middle 50%
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-[3px] rounded-full bg-ink" aria-hidden="true" />
          median
        </span>
      </figcaption>

      <ChartTable
        caption="Projected final points by club"
        columns={['Club', 'p10', 'p25', 'Median', 'p75', 'p90', 'Title']}
        rows={rows.map((f) => {
          const p = f.projectedPoints;
          return [
            teamById.get(f.teamId)?.name ?? f.teamId,
            p.p10, p.p25, p.p50, p.p75, p.p90, pct(f.winTitle),
          ];
        })}
      />
    </figure>
  );
}
