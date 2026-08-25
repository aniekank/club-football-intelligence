import { Figure, TeamLabel } from '@/components/ui';
import { ChartTable } from './primitives';
import { cn } from '@/lib/cn';
import type { SeasonForecast, Team } from '@/domain/types';

/**
 * What happens to each club, as one bar of certainty.
 *
 * ── One bar per club, not one chart per outcome ────────────────────────────
 * The probabilities the simulation produces are usually shown as separate
 * columns — title %, top four %, relegation % — which asks the reader to
 * assemble a club's season in their head from three numbers in three places.
 * A single bar split across the outcomes shows it whole: a club that is mostly
 * pale mid-table with a sliver of green is a completely different season from
 * one split evenly between green and red, and no column arrangement makes that
 * as legible as adjacency does.
 *
 * ── The bands are NESTED, so they are made disjoint first ──────────────────
 * `top4` includes the title, and `europeanQualification` includes top four.
 * Stacking them raw would count a title-winning simulation three times and
 * produce bars well over 100%. Each band here is the probability of finishing
 * in that range and NO higher, which is what a stacked bar means.
 *
 * ── Mid-table is drawn, not omitted ────────────────────────────────────────
 * The remainder — no European place, no relegation — is most of most clubs'
 * seasons and is the honest majority of the bar. Leaving it out would let four
 * small probabilities fill the width and imply every club is in a race.
 */

interface Band {
  key: string;
  label: string;
  colour: string;
  of: (f: SeasonForecast) => number;
}

const BANDS: Band[] = [
  { key: 'title', label: 'Win it', colour: 'var(--band-champion)', of: (f) => f.winTitle },
  {
    key: 'top4', label: 'Top four', colour: 'var(--band-ucl)',
    // Disjoint: top four but NOT the title.
    of: (f) => Math.max(f.top4 - f.winTitle, 0),
  },
  {
    key: 'europe', label: 'Europe', colour: 'var(--band-uel)',
    of: (f) => Math.max(f.europeanQualification - f.top4, 0),
  },
  {
    key: 'mid', label: 'Mid-table', colour: 'var(--border-default)',
    of: (f) => Math.max(1 - f.europeanQualification - f.relegation, 0),
  },
  { key: 'down', label: 'Relegated', colour: 'var(--band-relegation)', of: (f) => f.relegation },
];

export function OutcomeSpread({
  forecasts, teams,
}: {
  forecasts: SeasonForecast[];
  teams: Team[];
}) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rows = [...forecasts]
    .sort((a, b) => a.projectedRank.mean - b.projectedRank.mean)
    .flatMap((f) => {
      const team = byId.get(f.teamId);
      return team ? [{ f, team }] : [];
    });

  if (!rows.length) return null;

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {BANDS.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-[0.375rem] text-2xs">
            <span
              aria-hidden="true"
              className="h-[0.375rem] w-[0.375rem] rounded-full"
              style={{ background: b.colour }}
            />
            {b.label}
          </span>
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map(({ f, team }) => (
          <li key={f.teamId} className="grid grid-cols-[9rem_1fr] items-center gap-3">
            <TeamLabel
              name={team.shortName}
              code={team.code}
              crestUrl={team.crestUrl}
              size={16}
              nameClassName="text-sm"
            />
            <span
              className="flex h-[0.625rem] w-full overflow-hidden rounded-pill bg-surface-inset"
              role="img"
              aria-label={
                `${team.name}: ${BANDS.map((b) => `${b.label} ${Math.round(b.of(f) * 100)}%`).join(', ')}`
              }
            >
              {BANDS.map((b) => {
                const p = b.of(f);
                if (p <= 0.001) return null;
                return (
                  <span
                    key={b.key}
                    title={`${b.label} ${Math.round(p * 100)}%`}
                    className="h-full"
                    style={{ width: `${p * 100}%`, background: b.colour }}
                  />
                );
              })}
            </span>
          </li>
        ))}
      </ul>

      <figcaption className="mt-3 text-2xs leading-relaxed text-ink-muted">
        Each bar is one club&rsquo;s whole season across 8,000 simulations. The
        bands are made disjoint before stacking — &ldquo;top four&rdquo; here
        means top four and not the title — because the source probabilities nest
        and stacking them raw would take a club past 100%.
      </figcaption>

      <ChartTable
        caption="Simulated outcomes by club"
        columns={['Club', ...BANDS.map((b) => b.label)]}
        rows={rows.map(({ f, team }) => [
          team.name,
          ...BANDS.map((b) => `${Math.round(b.of(f) * 100)}%`),
        ])}
      />
    </figure>
  );
}

/**
 * Who the season has moved toward, and away from.
 *
 * `titleProbabilityDelta` is current minus start-of-season, and it was computed
 * from the first commit and rendered nowhere. It is the most direct answer to
 * "what has actually changed" — a club up thirty points of title probability
 * has had a season, whatever their current position says.
 */
export function TitleSwing({
  forecasts, teams, limit = 6,
}: {
  forecasts: SeasonForecast[];
  teams: Team[];
  limit?: number;
}) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const moved = [...forecasts]
    .filter((f) => Math.abs(f.titleProbabilityDelta) >= 0.01)
    .sort((a, b) => Math.abs(b.titleProbabilityDelta) - Math.abs(a.titleProbabilityDelta))
    .slice(0, limit)
    .flatMap((f) => {
      const team = byId.get(f.teamId);
      return team ? [{ f, team }] : [];
    });

  if (!moved.length) {
    return (
      <p className="text-sm text-ink-muted">
        No club&rsquo;s title chance has moved by even a point since the season
        began — which this early is exactly what should happen.
      </p>
    );
  }

  const max = Math.max(...moved.map((m) => Math.abs(m.f.titleProbabilityDelta)));

  return (
    <ul className="space-y-2">
      {moved.map(({ f, team }) => {
        const d = f.titleProbabilityDelta;
        const width = (Math.abs(d) / max) * 50;
        return (
          <li key={f.teamId} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3">
            <TeamLabel
              name={team.shortName}
              code={team.code}
              crestUrl={team.crestUrl}
              size={16}
              nameClassName="text-sm"
            />
            {/* Diverging from the centre: gains right, losses left. A one-sided
                bar would need a sign read from the label to be understood. */}
            <span className="relative flex h-[0.375rem] w-full overflow-hidden rounded-pill bg-surface-inset">
              <span
                className="absolute top-0 h-full"
                style={{
                  left: d >= 0 ? '50%' : `${50 - width}%`,
                  width: `${width}%`,
                  background: d >= 0 ? 'var(--status-good)' : 'var(--status-critical)',
                }}
              />
              <span aria-hidden="true" className="absolute left-1/2 top-0 h-full w-px bg-border-strong" />
            </span>
            <Figure
              className={cn(
                'text-right text-xs',
                d > 0 && 'text-status-good',
                d < 0 && 'text-status-critical',
              )}
            >
              {d > 0 ? '+' : ''}{Math.round(d * 100)}
            </Figure>
          </li>
        );
      })}
    </ul>
  );
}
