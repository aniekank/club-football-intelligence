import { Figure } from '@/components/ui';
import { ChartTable } from './primitives';
import { METRIC_LABELS } from '@/server/players';

/**
 * Percentile ranks against positional peers.
 *
 * Horizontal bars rather than a radar. A radar looks more impressive and reads
 * worse: its area is a function of the arbitrary ORDER of the axes, so the same
 * player appears "bigger" or "smaller" depending on how the metrics were
 * arranged, and comparing two of them is close to meaningless. Bars share one
 * baseline and one scale, which is the entire job.
 *
 * The palette is a SEQUENTIAL ramp, not the categorical one — these are all the
 * same measure (a percentile), differing only in magnitude. Using categorical
 * hues would imply the metrics are unrelated kinds rather than one scale.
 */
export function PercentileBars({
  percentiles, per90, peerCount, position, metrics,
}: {
  percentiles: Record<string, number>;
  per90: Record<string, number>;
  peerCount: number;
  position: string;
  metrics: string[];
}) {
  const rows = metrics
    .filter((m) => percentiles[m] !== undefined)
    .map((m) => ({ key: m, pct: percentiles[m] as number, raw: per90[m] ?? 0 }));

  if (!rows.length) {
    return (
      <p className="text-sm text-ink-muted">
        Not enough comparable players yet to rank this profile.
      </p>
    );
  }

  // Four steps, so a bar's colour reinforces its length without inventing
  // categories. Deliberately coarse: a 62nd and a 68th percentile are not
  // meaningfully different and should not look it.
  const shade = (p: number) =>
    p >= 75 ? 'var(--seq-600)' : p >= 50 ? 'var(--seq-500)' : p >= 25 ? 'var(--seq-300)' : 'var(--seq-200)';

  return (
    <figure className="m-0">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3">
            <span className="truncate text-xs text-ink-secondary">
              {METRIC_LABELS[r.key] ?? r.key}
            </span>
            <span className="relative block h-4 overflow-hidden rounded-sm bg-surface-inset" aria-hidden="true">
              <span
                className="block h-full rounded-sm transition-[width] duration-slow ease-decelerate"
                style={{ width: `${Math.max(r.pct, 1.5)}%`, background: shade(r.pct) }}
              />
              {/* Median marker: the reference that makes a bar readable without
                  counting gridlines. */}
              <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
            </span>
            <span className="flex items-baseline gap-2 text-right">
              <Figure className="w-8 text-xs font-semibold">{r.pct}</Figure>
              <Figure tone="muted" className="w-[3rem] text-2xs">{r.raw.toFixed(2)}</Figure>
            </span>
            <span className="sr-only">
              {METRIC_LABELS[r.key] ?? r.key}: {r.pct}th percentile among {position}s,
              {' '}{r.raw.toFixed(2)} per 90.
            </span>
          </li>
        ))}
      </ul>

      <figcaption className="mt-3 text-2xs text-ink-muted">
        Percentile against {peerCount} {position}s with 45+ minutes. The line marks
        the median. The right-hand figure is the per-90 rate.
      </figcaption>

      <ChartTable
        caption="Percentile ranks and per-90 rates"
        columns={['Metric', 'Per 90', 'Percentile']}
        rows={rows.map((r) => [METRIC_LABELS[r.key] ?? r.key, r.raw.toFixed(2), r.pct])}
      />
    </figure>
  );
}
