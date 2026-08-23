'use client';

import { useState } from 'react';
import { Legend, ChartTable, HOME_COLOR, AWAY_COLOR } from './primitives';
import type { Shot } from '@/domain/types';

/**
 * The shot map.
 *
 * One pitch, both sides on it, each attacking their own end — home into the
 * left goal, away into the right. Two stacked half-pitches would double the
 * vertical space and force the reader to compare across a gap; a single pitch
 * makes territory and chance quality directly comparable at a glance, and it is
 * the orientation every football viewer already has in their head.
 *
 * Encoding, chosen deliberately:
 *  • POSITION is where the shot was taken — the primary, most accurate channel.
 *  • AREA is xG. Radius scales with the square root of xG so a 0.4 chance looks
 *    twice the size of a 0.1 one; scaling radius linearly would make it look
 *    four times bigger and systematically overstate big chances.
 *  • FILL marks a goal, an outline marks everything else. That is a redundant,
 *    non-colour channel, so goals remain findable without relying on hue.
 *  • Every mark carries a 2px surface-coloured ring, because shots cluster hard
 *    around the penalty spot and coincident marks must stay countable.
 */

// Real pitch proportions. Getting this wrong is not cosmetic: a square pitch
// squashes the penalty area and makes every shot look closer to goal than it
// was, which is exactly the judgement a shot map exists to support.
const PITCH_W = 68;    // touchline to touchline
const HALF_L = 52.5;   // halfway line to goal line

export function ShotMap({
  shots, homeTeamId, homeName, awayName,
}: {
  shots: Shot[];
  homeTeamId: string;
  homeName: string;
  awayName: string;
}) {
  const [active, setActive] = useState<Shot | null>(null);

  // Board is two facing halves: home attacks right-to-left into the left goal,
  // away attacks left-to-right into the right goal.
  const width = 2 * HALF_L;
  const height = PITCH_W;

  const place = (s: Shot) => {
    const isHome = s.teamId === homeTeamId;
    // Source x is 0 (own goal) to 100 (opposition goal); only the attacking
    // third or so is ever populated. Map onto this side's half.
    const depth = ((100 - s.x) / 100) * (2 * HALF_L); // distance from the goal
    return isHome
      ? { cx: depth, cy: (s.y / 100) * PITCH_W }
      : { cx: width - depth, cy: PITCH_W - (s.y / 100) * PITCH_W };
  };

  // sqrt so AREA, not radius, tracks xG.
  const radius = (xg: number) => 0.9 + Math.sqrt(Math.max(xg, 0)) * 4.2;

  const homeShots = shots.filter((s) => s.teamId === homeTeamId);
  const awayShots = shots.filter((s) => s.teamId !== homeTeamId);
  const goalsFor = (list: Shot[]) => list.filter((s) => s.outcome === 'goal').length;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`-2 -2 ${width + 4} ${height + 4}`}
          width="100%"
          role="img"
          aria-label={`Shot map. ${homeName} ${homeShots.length} shots, ${awayShots.length} for ${awayName}. Marker size is expected-goal value; filled markers are goals.`}
          className="block"
        >
          <title>Shot map</title>

          {/* Pitch. Recessive: it is a reference frame, not content. */}
          <g stroke="var(--border-default)" strokeWidth={0.4} fill="none" aria-hidden="true">
            <rect x={0} y={0} width={width} height={height} rx={0.5} />
            <line x1={width / 2} y1={0} x2={width / 2} y2={height} />
            <circle cx={width / 2} cy={height / 2} r={9.15} />
            <circle cx={width / 2} cy={height / 2} r={0.4} fill="var(--border-default)" />
            {/* Penalty areas at both ends */}
            <rect x={0} y={height / 2 - 20.15} width={16.5} height={40.3} />
            <rect x={width - 16.5} y={height / 2 - 20.15} width={16.5} height={40.3} />
            <rect x={0} y={height / 2 - 9.16} width={5.5} height={18.32} />
            <rect x={width - 5.5} y={height / 2 - 9.16} width={5.5} height={18.32} />
          </g>

          {/* Away first so the home side's marks sit on top of any overlap. */}
          {[...awayShots, ...homeShots].map((s) => {
            const { cx, cy } = place(s);
            const isHome = s.teamId === homeTeamId;
            const color = isHome ? HOME_COLOR : AWAY_COLOR;
            const isGoal = s.outcome === 'goal';
            const isActive = active?.id === s.id;
            return (
              <circle
                key={s.id}
                cx={cx}
                cy={cy}
                r={radius(s.xG)}
                fill={isGoal ? color : 'transparent'}
                // Goals cluster hard around the penalty spot; a solid fill
                // merges them into one blob, so they are translucent with a
                // full-strength outline that keeps each one countable.
                fillOpacity={isGoal ? 0.55 : 0}
                stroke={isActive ? 'var(--text-primary)' : color}
                strokeWidth={0.8}
                opacity={active && !isActive ? 0.35 : 1}
                className="cursor-pointer transition-opacity duration-fast ease-standard"
                onMouseEnter={() => setActive(s)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                role="button"
                aria-label={`${isHome ? homeName : awayName}, minute ${s.minute}, ${s.xG.toFixed(2)} xG, ${s.outcome.replace(/_/g, ' ')}`}
              />
            );
          })}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-border-subtle bg-surface-3 px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold">
              {active.minute}&apos; · {active.teamId === homeTeamId ? homeName : awayName}
            </p>
            <p className="text-ink-secondary">
              <span className="figure">{active.xG.toFixed(2)}</span> xG ·{' '}
              {active.outcome.replace(/_/g, ' ')} · {active.bodyPart.replace(/_/g, ' ')}
            </p>
            <p className="text-ink-muted">{active.situation.replace(/_/g, ' ')}</p>
          </div>
        ) : null}
      </div>

      <figcaption className="mt-3 space-y-2">
        <Legend
          items={[
            { label: `${homeName} (${goalsFor(homeShots)}/${homeShots.length})`, color: HOME_COLOR },
            { label: `${awayName} (${goalsFor(awayShots)}/${awayShots.length})`, color: AWAY_COLOR },
          ]}
        />
        <p className="text-2xs text-ink-muted">
          Marker area is expected-goal value. Filled markers are goals; outlines are
          attempts that did not score.
        </p>
      </figcaption>

      <ChartTable
        caption="Every shot with location and expected-goal value"
        columns={['Min', 'Team', 'xG', 'Body', 'Situation', 'Outcome']}
        rows={[...shots]
          .sort((a, b) => a.minute - b.minute)
          .map((s) => [
            `${s.minute}'`,
            s.teamId === homeTeamId ? homeName : awayName,
            s.xG.toFixed(2),
            s.bodyPart.replace(/_/g, ' '),
            s.situation.replace(/_/g, ' '),
            s.outcome.replace(/_/g, ' '),
          ])}
      />
    </figure>
  );
}
