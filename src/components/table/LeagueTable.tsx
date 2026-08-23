import { cn } from '@/lib/cn';
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
  competition, standings, teams, showModel = true, highlightTeamId,
}: {
  competition: Competition;
  standings: StandingRow[];
  teams: Team[];
  showModel?: boolean;
  highlightTeamId?: string;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const hasXG = standings.some((r) => r.xGFor !== null);
  const hasModel = showModel && standings.some((r) => r.titleProbability !== null);
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
      <div className="scroll-x">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <caption className="sr-only">
            {competition.name} table. Ranked by {competition.tiebreakers.join(', then ')}.
          </caption>
          <thead>
            <tr className="border-b border-border text-2xs uppercase tracking-caps text-ink-muted">
              <Th className="w-10 pl-3 text-left">#</Th>
              <Th className="text-left">Club</Th>
              <Th className="w-10">Pl</Th>
              <Th className="hidden w-10 sm:table-cell">W</Th>
              <Th className="hidden w-10 sm:table-cell">D</Th>
              <Th className="hidden w-10 sm:table-cell">L</Th>
              <Th className="hidden w-12 lg:table-cell">GF</Th>
              <Th className="hidden w-12 lg:table-cell">GA</Th>
              <Th className="w-12">GD</Th>
              <Th className="w-12 font-bold text-ink">Pts</Th>
              {hasXG ? (
                <Th className="hidden w-16 xl:table-cell" title="Expected goals for">
                  xG
                </Th>
              ) : null}
              {hasXG ? (
                <Th className="hidden w-16 xl:table-cell" title="Expected goals against">
                  xGA
                </Th>
              ) : null}
              <Th className="hidden w-32 md:table-cell text-left">Form</Th>
              {hasModel ? <Th className="w-20">Title</Th> : null}
              {hasModel ? <Th className="hidden w-20 lg:table-cell">Rel</Th> : null}
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => {
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
                        <TeamLabel
                          name={team.shortName}
                          code={team.code}
                          crestUrl={team.crestUrl}
                          nameClassName="font-medium"
                        />
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
                  <Td className="hidden sm:table-cell">{int(row.won)}</Td>
                  <Td className="hidden sm:table-cell">{int(row.drawn)}</Td>
                  <Td className="hidden sm:table-cell">{int(row.lost)}</Td>
                  <Td className="hidden lg:table-cell">{int(row.goalsFor)}</Td>
                  <Td className="hidden lg:table-cell">{int(row.goalsAgainst)}</Td>
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

                  <td className="hidden px-1 py-2 md:table-cell">
                    <FormRun form={row.form} />
                  </td>

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
