import { Figure } from '@/components/ui';
import { ChartTable } from '@/components/charts/primitives';
import type { ClubSeasonRank } from '@/domain/types';

/**
 * Where a club has finished, season by season.
 *
 * ── The axis is INVERTED, and that is the whole chart ──────────────────────
 * First place is at the top. A conventional y-axis would put 1st at the bottom
 * and a title-winning season would read as a trough, which is wrong in the one
 * way a chart of league positions can be wrong. Everything else here follows
 * from that: the line rises when the club improves.
 *
 * ── Position is not comparable across divisions ────────────────────────────
 * 8th in the Premier League and 8th in the Championship are different
 * achievements, so a segment's colour follows the competition and a division
 * change is drawn as a break rather than a slope. Joining them with a straight
 * line would draw promotion as a collapse and relegation as a climb.
 *
 * ── Why not a bar chart ────────────────────────────────────────────────────
 * Finishing position is a series over time, and the question a reader has is
 * about TRAJECTORY — are they climbing, drifting, yo-yoing. A line answers
 * that at a glance; twenty bars make the eye do the differencing.
 */
export function SeasonHistory({ seasons }: { seasons: ClubSeasonRank[] }) {
  if (seasons.length < 2) return null;

  const W = 720;
  const H = 220;
  const M = { top: 16, right: 16, bottom: 28, left: 34 };

  const maxTeams = Math.max(...seasons.map((s) => s.outOf || 20), 20);
  const x = (i: number) =>
    M.left + (i / Math.max(1, seasons.length - 1)) * (W - M.left - M.right);
  // Inverted: position 1 sits at the top of the plot.
  const y = (pos: number) =>
    M.top + ((pos - 1) / Math.max(1, maxTeams - 1)) * (H - M.top - M.bottom);

  // A competition change breaks the line — see the note above.
  const runs: { competition: string; points: { i: number; s: ClubSeasonRank }[] }[] = [];
  seasons.forEach((s, i) => {
    const last = runs[runs.length - 1];
    if (last && last.competition === s.competitionName) last.points.push({ i, s });
    else runs.push({ competition: s.competitionName, points: [{ i, s }] });
  });

  const competitions = [...new Set(seasons.map((s) => s.competitionName))];
  const hue = (name: string) => `var(--series-${(competitions.indexOf(name) % 8) + 1})`;

  const best = seasons.reduce((a, b) => (b.position < a.position ? b : a));
  const worst = seasons.reduce((a, b) => (b.position > a.position ? b : a));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label={`Finishing position by season, from ${seasons[0]!.season} to ${seasons[seasons.length - 1]!.season}. Best ${best.position} in ${best.season}; worst ${worst.position} in ${worst.season}.`}
        className="block overflow-visible"
      >
        <title>{`Finishing position, ${seasons[0]!.season} to ${seasons[seasons.length - 1]!.season}`}</title>

        {/* Reference lines a football reader actually uses. */}
        <g aria-hidden="true">
          {[1, 4, 17].map((pos) => (
            <g key={pos}>
              <line
                x1={M.left} x2={W - M.right} y1={y(pos)} y2={y(pos)}
                stroke="var(--border-subtle)" strokeWidth={1} shapeRendering="crispEdges"
              />
              <text
                x={M.left - 6} y={y(pos)} textAnchor="end" dominantBaseline="middle"
                fontSize={9} fill="var(--text-muted)" className="figure"
              >
                {pos}
              </text>
            </g>
          ))}
        </g>

        {runs.map((run) => (
          <g key={`${run.competition}-${run.points[0]!.i}`}>
            {run.points.length > 1 ? (
              <polyline
                points={run.points.map((p) => `${x(p.i)},${y(p.s.position)}`).join(' ')}
                fill="none"
                stroke={hue(run.competition)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {run.points.map((p) => (
              <circle
                key={p.i}
                cx={x(p.i)}
                cy={y(p.s.position)}
                r={3.5}
                fill={hue(run.competition)}
                stroke="var(--surface-1)"
                strokeWidth={1.5}
              >
                <title>{`${p.s.season}: ${p.s.position} of ${p.s.outOf} in the ${p.s.competitionName}, ${p.s.points} points`}</title>
              </circle>
            ))}
          </g>
        ))}

        {/* Only the ends are labelled — twenty season labels is a picket fence. */}
        <g aria-hidden="true" fontSize={9} fill="var(--text-muted)" className="figure">
          <text x={M.left} y={H - 8}>{seasons[0]!.season}</text>
          <text x={W - M.right} y={H - 8} textAnchor="end">
            {seasons[seasons.length - 1]!.season}
          </text>
        </g>
      </svg>

      <figcaption className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span className="inline-flex items-baseline gap-[0.375rem]">
            <span className="eyebrow">Best</span>
            <Figure className="font-semibold">{best.position}</Figure>
            <span className="text-2xs text-ink-muted">{best.season}</span>
          </span>
          <span className="inline-flex items-baseline gap-[0.375rem]">
            <span className="eyebrow">Worst</span>
            <Figure className="font-semibold">{worst.position}</Figure>
            <span className="text-2xs text-ink-muted">{worst.season}</span>
          </span>
          <span className="inline-flex items-baseline gap-[0.375rem]">
            <span className="eyebrow">Seasons</span>
            <Figure className="font-semibold">{seasons.length}</Figure>
          </span>
        </div>

        {competitions.length > 1 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {competitions.map((c) => (
              <span key={c} className="inline-flex items-center gap-[0.375rem] text-2xs">
                <span
                  aria-hidden="true"
                  className="h-[0.375rem] w-[0.375rem] rounded-full"
                  style={{ background: hue(c) }}
                />
                {c}
              </span>
            ))}
          </div>
        ) : null}

        <p className="text-2xs text-ink-muted">
          First place is at the top. A change of division breaks the line, because
          8th in one is not 8th in another.
        </p>
      </figcaption>

      <ChartTable
        caption="Finishing position by season"
        columns={['Season', 'Competition', 'Pos', 'Pts']}
        rows={[...seasons].reverse().map((s) => [
          s.season, s.competitionName, `${s.position} of ${s.outOf}`, String(s.points),
        ])}
      />
    </figure>
  );
}
