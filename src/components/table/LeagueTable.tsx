import Link from 'next/link';
import { cn } from '@/lib/cn';
import { SortHeader } from './SortHeader';
import { findTeamMetric, teamRows } from '@/lib/metrics';
import { Figure, FormRun, TeamLabel, EstimateMark } from '@/components/ui';
import { int, num, pct, signed } from '@/lib/format';
import { zonesAreProvisional } from '@/domain/competitions';
import type { Competition, StandingRow, Team, ZoneKind } from '@/domain/types';

/**
 * The league table.
 *
 * The surface a club-football product lives or dies on, so the details matter:
 *
 *  • The qualification band is a LEFT RAIL, not a tinted row. A tinted row
 *    fights the text for contrast and turns unreadable in dark mode; a 3px rail
 *    reads instantly and costs the content nothing.
 *  • Colour never carries the meaning alone. Every banded row also gets a text
 *    label in its status column, and a legend sits beneath the table.
 *  • Figures are mono and tabular, so columns stay in vertical register and a
 *    score ticking over never reflows the row.
 *  • Progressive disclosure by breakpoint: rank, club, played, goal difference
 *    and points are always visible; W/D/L, goals, form and the model columns
 *    appear as the viewport allows. The table scrolls inside its own container
 *    so the page body never scrolls sideways.
 *  • Tiebreaker notes are footnoted ONLY where a neighbour is level on points.
 *    Otherwise the note is noise, and noise on every row buries the real ones.
 */

const BAND_TOKEN: Record<ZoneKind, string> = {
  champion: 'var(--band-champion)',
  'ucl-league-phase': 'var(--band-ucl)',
  'ucl-qualifying': 'var(--band-ucl)',
  'uel-league-phase': 'var(--band-uel)',
  'uel-qualifying': 'var(--band-uel)',
  'conference-qualifying': 'var(--band-conference)',
  promotion: 'var(--band-champion)',
  'promotion-playoff': 'var(--band-relegation-playoff)',
  'relegation-playoff': 'var(--band-relegation-playoff)',
  relegation: 'var(--band-relegation)',
  'knockout-direct': 'var(--band-ucl)',
  'knockout-playoff': 'var(--band-relegation-playoff)',
  eliminated: 'var(--band-relegation)',
};

export function LeagueTable({
  competition, standings, teams, showModel = true, highlightTeamId, compact = false,
  sort, dir, sortable = false,
}: {
  competition: Competition;
  standings: StandingRow[];
  teams: Team[];
  showModel?: boolean;
  highlightTeamId?: string;
  /** Active sort column and direction, from the URL. */
  sort?: string;
  dir?: string;
  sortable?: boolean;
  /**
   * Sidebar variant: rank, club, played, goal difference, points. Genuinely
   * fewer COLUMNS rather than the full table scrolling inside a narrow column —
   * a horizontally clipped table in a sidebar reads as broken even when the
   * scroll works, and nobody scrolls it.
   */
  compact?: boolean;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));

  /**
   * Re-order by an arbitrary metric when asked.
   *
   * The RANK column keeps showing the club's real league position, not its row
   * number — sorting by xG must not imply a club is "3rd" when it is 11th. The
   * left-hand band rail follows the true rank for the same reason. Sorting is a
   * lens over the table, never a rewriting of it.
   */
  const ordered = (() => {
    if (!sortable || !sort) return standings;
    const metric = findTeamMetric(sort);
    if (!metric) return standings;
    const rowByTeam = new Map(teamRows({ teams, standings } as never).map((r) => [r.team.id, r]));
    const sign = dir === 'asc' ? 1 : -1;
    return [...standings].sort((a, b) => {
      const ra = rowByTeam.get(a.teamId);
      const rb = rowByTeam.get(b.teamId);
      const va = ra ? metric.get(ra) : null;
      const vb = rb ? metric.get(rb) : null;
      // Rows with no value for this metric sink to the bottom either way,
      // rather than being treated as zero and jumping to one end.
      if (va === null && vb === null) return a.rank - b.rank;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va - vb) * sign || a.rank - b.rank;
    });
  })();

  const Col = ColFactory(sortable && !compact);
  const hasXG = !compact && standings.some((r) => r.xGFor !== null);
  const hasModel = !compact && showModel && standings.some((r) => r.titleProbability !== null);
  const anyNote = standings.some((r) => r.tiebreakerNote);

  // Only show the bands this table actually uses, in finishing order.
  const usedZones = new Map<ZoneKind, string>();
  for (const row of standings) {
    if (!row.zone) continue;
    const zone = competition.zones.find((z) => z.kind === row.zone);
    if (zone && !usedZones.has(row.zone)) usedZones.set(row.zone, zone.label);
  }

  return (
    <div>
      <div className={compact ? undefined : 'scroll-x'}>
        <table className={cn('w-full border-collapse text-sm', !compact && 'min-w-[42rem]')}>
          <caption className="sr-only">
            {competition.name} table. Ranked by {competition.tiebreakers.join(', then ')}.
          </caption>
          <thead>
            <tr className="border-b border-border text-2xs uppercase tracking-caps text-ink-muted">
              <Th className="w-10 pl-3 text-left">#</Th>
              <Th className="text-left">Club</Th>
              <Col k="played" label="Pl" className="w-10" />
              {compact ? null : <Col k="wins" label="W" className="hidden w-10 sm:table-cell" />}
              {compact ? null : <Th className="hidden w-10 sm:table-cell">D</Th>}
              {compact ? null : <Th className="hidden w-10 sm:table-cell">L</Th>}
              {compact ? null : <Th className="hidden w-12 lg:table-cell">GF</Th>}
              {compact ? null : <Th className="hidden w-12 lg:table-cell">GA</Th>}
              <Col k="goalDifference" label="GD" className="w-12" />
              <Col k="points" label="Pts" className="w-12 font-bold text-ink" />
              {hasXG ? (
                <Col k="xGFor" label="xG" className="hidden w-16 xl:table-cell" title="Expected goals for" />
              ) : null}
              {hasXG ? (
                <Col k="xGAgainst" label="xGA" better={false} className="hidden w-16 xl:table-cell" title="Expected goals against" />
              ) : null}
              {compact ? null : <Th className="hidden w-32 md:table-cell text-left">Form</Th>}
              {hasModel ? <Col k="titleProbability" label="Title" className="w-20" /> : null}
              {hasModel ? (
                <Col k="relegationProbability" label="Rel" better={false} className="hidden w-20 lg:table-cell" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => {
              const team = teamById.get(row.teamId);
              const band = row.zone ? BAND_TOKEN[row.zone] : null;
              const highlighted = highlightTeamId === row.teamId;

              return (
                <tr
                  key={row.teamId}
                  className={cn(
                    'group border-b border-border-subtle transition-colors duration-fast ease-standard',
                    'hover:bg-surface-2',
                    highlighted && 'bg-surface-2',
                  )}
                >
                  <td className="relative py-2 pl-3 pr-1">
                    {band ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-[3px]"
                        style={{ background: band }}
                      />
                    ) : null}
                    <Figure tone="secondary" className="text-xs">
                      {row.rank}
                    </Figure>
                  </td>

                  <td className="min-w-0 py-2 pr-2">
                    <div className="flex items-center gap-2">
                      {team ? (
                        <Link
                          href={`/teams/${team.id}?competition=${competition.id}`}
                          className="min-w-0 rounded-sm underline-offset-2 hover:underline"
                        >
                          <TeamLabel
                            name={team.shortName}
                            code={team.code}
                            crestUrl={team.crestUrl}
                            nameClassName="font-medium"
                          />
                        </Link>
                      ) : (
                        // Never crash on a lookup miss — render the id.
                        <span className="text-ink-muted">{row.teamId}</span>
                      )}
                      {row.tiebreakerNote ? (
                        <abbr
                          title={row.tiebreakerNote}
                          className="cursor-help text-2xs text-ink-muted no-underline"
                        >
                          *
                        </abbr>
                      ) : null}
                    </div>
                  </td>

                  <Td>{int(row.played)}</Td>
                  {compact ? null : <Td className="hidden sm:table-cell">{int(row.won)}</Td>}
                  {compact ? null : <Td className="hidden sm:table-cell">{int(row.drawn)}</Td>}
                  {compact ? null : <Td className="hidden sm:table-cell">{int(row.lost)}</Td>}
                  {compact ? null : <Td className="hidden lg:table-cell">{int(row.goalsFor)}</Td>}
                  {compact ? null : <Td className="hidden lg:table-cell">{int(row.goalsAgainst)}</Td>}
                  <Td>
                    <Figure
                      tone={row.goalDifference > 0 ? 'positive' : row.goalDifference < 0 ? 'negative' : 'muted'}
                    >
                      {signed(row.goalDifference)}
                    </Figure>
                  </Td>
                  <td className="px-1 py-2 text-center">
                    <Figure className="font-bold">{int(row.points)}</Figure>
                  </td>

                  {hasXG ? <Td className="hidden xl:table-cell">{num(row.xGFor, 1)}</Td> : null}
                  {hasXG ? <Td className="hidden xl:table-cell">{num(row.xGAgainst, 1)}</Td> : null}

                  {compact ? null : (
                    <td className="hidden px-1 py-2 md:table-cell">
                      <FormRun form={row.form} />
                    </td>
                  )}

                  {hasModel ? (
                    <td className="px-1 py-2">
                      <ProbabilityCell value={row.titleProbability} tone="good" />
                    </td>
                  ) : null}
                  {hasModel ? (
                    <td className="hidden px-1 py-2 lg:table-cell">
                      <ProbabilityCell value={row.relegationProbability} tone="critical" />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend — the band colours never stand alone. */}
      {usedZones.size > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle px-3 py-3">
          {[...usedZones].map(([kind, label]) => (
            <span key={kind} className="inline-flex items-center gap-2 text-xs text-ink-secondary">
              <span
                aria-hidden="true"
                className="h-3 w-[3px] rounded-full"
                style={{ background: BAND_TOKEN[kind] }}
              />
              {label}
            </span>
          ))}
        </div>
      ) : null}

      {compact ? null : (
      <div className="space-y-1 px-3 pb-3 text-xs text-ink-muted">
        {anyNote ? (
          <p>* Level on points — separated by the tiebreaker shown on hover.</p>
        ) : null}
        {zonesAreProvisional(competition) ? (
          <p>
            European places are provisional: they shift with domestic cup winners and
            UEFA coefficient spots.
          </p>
        ) : null}
        {hasModel ? (
          <p>
            Title and relegation chances are Monte Carlo estimates over the remaining
            fixtures<EstimateMark /> A shown 0% means it did not occur in 8,000
            simulated seasons — not that it is impossible.
          </p>
        ) : null}
      </div>
      )}
    </div>
  );
}

/**
 * A probability with an inline magnitude bar.
 *
 * The bar is a redundant encoding of the same number, which is the point: it
 * makes the column scannable at a glance without the reader parsing 20
 * percentages, while the figure keeps it exact.
 */
function ProbabilityCell({
  value, tone,
}: { value: number | null; tone: 'good' | 'critical' }) {
  if (value === null) return <span className="block text-center text-ink-muted">—</span>;

  const color = tone === 'good' ? 'var(--status-good)' : 'var(--status-critical)';
  return (
    <div className="flex flex-col items-end gap-1 pr-2">
      <Figure
        className={cn('text-xs', value < 0.005 && 'text-ink-muted')}
      >
        {pct(value)}
      </Figure>
      <span
        aria-hidden="true"
        className="h-[3px] w-full overflow-hidden rounded-full bg-surface-inset"
      >
        <span
          className="block h-full rounded-full transition-[width] duration-slow ease-decelerate"
          style={{ width: `${Math.max(value * 100, value > 0 ? 2 : 0)}%`, background: color }}
        />
      </span>
    </div>
  );
}

/**
 * A column head that is sortable or not depending on the surface.
 *
 * One component rather than a conditional at every header — the compact sidebar
 * table and the full page table share these columns, and only one of them wants
 * sorting.
 */
function ColFactory(sortable: boolean) {
  return function Col({
    k, label, className, title, better = true,
  }: { k: string; label: string; className?: string; title?: string; better?: boolean }) {
    if (!sortable) {
      return <Th className={className} title={title}>{label}</Th>;
    }
    return (
      <SortHeader columnKey={k} label={label} higherIsBetter={better} className={className} title={title} />
    );
  };
}

function Th({
  children, className, title,
}: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <th
      scope="col"
      title={title}
      className={cn('px-1 py-2 text-center font-semibold', className)}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-1 py-2 text-center', className)}>
      <Figure tone="secondary">{children}</Figure>
    </td>
  );
}
