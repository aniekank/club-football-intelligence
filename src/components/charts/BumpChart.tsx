'use client';

import { useState } from 'react';
import { Figure } from '@/components/ui';
import { ChartTable } from './primitives';
import { cn } from '@/lib/cn';
import type { ClubProgression, Progression } from '@/analytics/progression';
import type { ZoneKind } from '@/domain/types';

/**
 * The season as movement — every club's position, matchweek by matchweek.
 *
 * ── Why a bump chart ───────────────────────────────────────────────────────
 * A table says where clubs are. It cannot say how they got there, and "how they
 * got there" is most of what a season IS: the side that led until March, the
 * one that climbed out of the bottom three in six weeks. Position over time
 * with crossing lines shows exactly that, and the CROSSINGS are the story —
 * every one is an overtake that actually happened.
 *
 * ── The axis is inverted, necessarily ──────────────────────────────────────
 * First is at the top. Drawn conventionally a title charge would descend, which
 * is wrong in the one way a chart of league positions can be wrong.
 *
 * ── Colour is the ZONE, not the club ───────────────────────────────────────
 * Twenty clubs cannot have twenty hues: the validated palette clears the
 * all-pairs colour-vision gate at three, so a twenty-hue scheme would be
 * illegible to some readers and unmemorable to everyone. Instead each line
 * takes the colour of the zone the club currently sits in — the same band
 * tokens the league table already uses — so the chart inherits a vocabulary the
 * reader has met. Green lines climbing past red ones IS the season.
 *
 * Identity comes from direct labels and from hovering, which is what the
 * scatter does for the same reason.
 *
 * ── Faint by default, sharp on hover ───────────────────────────────────────
 * All twenty at full strength is a plate of spaghetti. They are drawn quietly
 * so the SHAPE of the season reads first, and any single line comes forward on
 * hover or focus. The reader chooses the subject; the chart does not choose for
 * them.
 */

const BAND: Record<ZoneKind, string> = {
  champion: 'var(--band-champion)',
  'ucl-league-phase': 'var(--band-ucl)',
  'ucl-qualifying': 'var(--band-ucl)',
  'uel-league-phase': 'var(--band-uel)',
  'uel-qualifying': 'var(--band-uel)',
  'conference-qualifying': 'var(--band-conference)',
  'knockout-direct': 'var(--band-ucl)',
  'knockout-playoff': 'var(--band-relegation-playoff)',
  eliminated: 'var(--band-relegation)',
  promotion: 'var(--band-champion)',
  'promotion-playoff': 'var(--band-relegation-playoff)',
  'relegation-playoff': 'var(--band-relegation-playoff)',
  relegation: 'var(--band-relegation)',
};

const W = 860;
const H = 420;
const M = { top: 18, right: 116, bottom: 34, left: 34 };

export function BumpChart({
  progression, highlightTeamId,
}: {
  progression: Progression;
  highlightTeamId?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const { clubs, matchweeks, size } = progression;

  const weeks = matchweeks;
  const x = (week: number) => {
    const i = weeks.indexOf(week);
    return M.left + (i / Math.max(1, weeks.length - 1)) * (W - M.left - M.right);
  };
  const y = (pos: number) =>
    M.top + ((pos - 1) / Math.max(1, size - 1)) * (H - M.top - M.bottom);

  const colourOf = (c: ClubProgression) => {
    const last = c.points[c.points.length - 1];
    return last?.zone ? BAND[last.zone] : 'var(--text-muted)';
  };

  const focused = active ?? highlightTeamId ?? null;

  return (
    <figure className="m-0">
      <div className="scroll-x">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', minWidth: '32rem', height: 'auto' }}
          role="img"
          aria-label={`League position by matchweek for ${clubs.length} clubs, matchweek ${weeks[0]} to ${weeks[weeks.length - 1]}.`}
          className="block overflow-visible"
        >
          <title>Position by matchweek</title>

          {/* Position gridlines a football reader uses. */}
          <g aria-hidden="true">
            {[1, 4, Math.max(size - 3, 5), size].filter((p, i, a) => a.indexOf(p) === i).map((pos) => (
              <g key={pos}>
                <line
                  x1={M.left} x2={W - M.right} y1={y(pos)} y2={y(pos)}
                  stroke="var(--border-subtle)" strokeWidth={1} shapeRendering="crispEdges"
                />
                <text
                  x={M.left - 8} y={y(pos)} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="var(--text-muted)" className="figure"
                >
                  {pos}
                </text>
              </g>
            ))}
          </g>

          {clubs.map((c) => {
            const isFocus = focused === c.teamId;
            const dim = focused !== null && !isFocus;
            const path = c.points.map((p) => `${x(p.matchweek)},${y(p.position)}`).join(' ');
            return (
              <g
                key={c.teamId}
                onMouseEnter={() => setActive(c.teamId)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(c.teamId)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                role="button"
                aria-label={`${c.name}: ${c.current} now, best ${c.best}, worst ${c.worst}.`}
                className="cursor-pointer focus:outline-none"
              >
                {/* A fat transparent hit line — 2px of stroke is not a target. */}
                <polyline points={path} fill="none" stroke="transparent" strokeWidth={12} />
                <polyline
                  points={path}
                  fill="none"
                  stroke={colourOf(c)}
                  strokeWidth={isFocus ? 3 : 1.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={dim ? 0.16 : isFocus ? 1 : 0.62}
                  className="transition-[stroke-width,opacity] duration-fast ease-standard"
                />
                {isFocus
                  ? c.points.map((p) => (
                      <circle
                        key={p.matchweek}
                        cx={x(p.matchweek)}
                        cy={y(p.position)}
                        r={3}
                        fill={colourOf(c)}
                        stroke="var(--surface-1)"
                        strokeWidth={1.5}
                      />
                    ))
                  : null}
                <text
                  x={W - M.right + 8}
                  y={y(c.current)}
                  dominantBaseline="middle"
                  fontSize={isFocus ? 11 : 10}
                  fill={dim ? 'var(--text-muted)' : isFocus ? 'var(--text-primary)' : 'var(--text-secondary)'}
                  opacity={dim ? 0.4 : 1}
                  className="pointer-events-none transition-opacity duration-fast ease-standard"
                >
                  {c.code}
                </text>
              </g>
            );
          })}

          <g aria-hidden="true" fontSize={9} fill="var(--text-muted)" className="figure">
            <text x={M.left} y={H - 10}>MW {weeks[0]}</text>
            <text x={W - M.right} y={H - 10} textAnchor="end">
              MW {weeks[weeks.length - 1]}
            </text>
          </g>
        </svg>
      </div>

      <figcaption className="mt-3 space-y-2">
        {focused ? (
          <FocusLine club={clubs.find((c) => c.teamId === focused)} />
        ) : (
          <p className="text-sm text-ink-secondary">
            Hover a line to follow one club. Position is recomputed after every
            completed matchweek using this competition&rsquo;s own tiebreakers.
          </p>
        )}
        <p className="text-2xs text-ink-muted">
          First place is at the top. Line colour is the zone each club sits in
          now — the same bands as the table — because twenty clubs cannot have
          twenty legible colours. A matchweek appears only once every fixture in
          it has been played.
        </p>
      </figcaption>

      <ChartTable
        caption="Position by matchweek"
        columns={['Club', 'Now', 'Best', 'Worst', 'Moved']}
        rows={clubs.map((c) => [
          c.name,
          String(c.current),
          String(c.best),
          String(c.worst),
          c.movement > 0 ? `+${c.movement}` : String(c.movement),
        ])}
      />
    </figure>
  );
}

function FocusLine({ club }: { club: ClubProgression | undefined }) {
  if (!club) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      <span className="font-semibold">{club.name}</span>
      <span className="inline-flex items-baseline gap-[0.375rem]">
        <span className="eyebrow">Now</span>
        <Figure className="font-semibold">{club.current}</Figure>
      </span>
      <span className="inline-flex items-baseline gap-[0.375rem]">
        <span className="eyebrow">High</span>
        <Figure>{club.best}</Figure>
      </span>
      <span className="inline-flex items-baseline gap-[0.375rem]">
        <span className="eyebrow">Low</span>
        <Figure>{club.worst}</Figure>
      </span>
      <span className="inline-flex items-baseline gap-[0.375rem]">
        <span className="eyebrow">Since MW{club.points[0]!.matchweek}</span>
        <Figure
          className={cn(
            'font-semibold',
            club.movement > 0 && 'text-status-good',
            club.movement < 0 && 'text-status-critical',
          )}
        >
          {club.movement > 0 ? `+${club.movement}` : club.movement}
        </Figure>
      </span>
    </p>
  );
}
