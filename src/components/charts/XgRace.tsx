'use client';

import { useMemo, useState } from 'react';
import {
  ChartFrame, GridLines, AxisLeft, AxisBottom, Legend, ChartTable,
  scale, ticks, HOME_COLOR, AWAY_COLOR, DEFAULT_MARGIN,
} from './primitives';
import type { Shot } from '@/domain/types';

/**
 * The cumulative xG race.
 *
 * A STEP line, not a smoothed one, and that is the whole point: expected goals
 * accumulate in discrete jumps at the moment of each shot. Interpolating
 * between them draws xG arriving continuously through possession, which is not
 * what the metric measures and quietly misrepresents how a match unfolded. The
 * height of each step is the chance's quality, so a single riser tells you a
 * big chance happened without reading a number.
 *
 * Goals are marked on the line — the gap between the step chart and the actual
 * scoreline IS the story in most matches, and putting them on the same axis is
 * what lets a reader see it.
 */
export function XgRace({
  shots, homeTeamId, homeName, awayName, homeGoals, awayGoals, height = 200,
}: {
  shots: Shot[];
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  height?: number;
}) {
  const [hoverMinute, setHoverMinute] = useState<number | null>(null);

  const width = 640;
  const m = DEFAULT_MARGIN;
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;

  const { homeSteps, awaySteps, maxXg, maxMinute, goals } = useMemo(() => {
    const sorted = [...shots].sort((a, b) => a.minute - b.minute);
    const home: { minute: number; total: number }[] = [{ minute: 0, total: 0 }];
    const away: { minute: number; total: number }[] = [{ minute: 0, total: 0 }];
    const goalMarks: { minute: number; total: number; side: 'home' | 'away' }[] = [];
    let h = 0;
    let a = 0;

    for (const s of sorted) {
      const isHome = s.teamId === homeTeamId;
      if (isHome) {
        h += s.xG;
        home.push({ minute: s.minute, total: h });
      } else {
        a += s.xG;
        away.push({ minute: s.minute, total: a });
      }
      if (s.outcome === 'goal') {
        goalMarks.push({ minute: s.minute, total: isHome ? h : a, side: isHome ? 'home' : 'away' });
      }
    }
    const last = Math.max(90, ...sorted.map((s) => s.minute));
    home.push({ minute: last, total: h });
    away.push({ minute: last, total: a });
    return {
      homeSteps: home, awaySteps: away,
      maxXg: Math.max(0.5, h, a), maxMinute: last, goals: goalMarks,
    };
  }, [shots, homeTeamId]);

  const x = scale([0, maxMinute], [m.left, m.left + innerW]);
  const y = scale([0, maxXg * 1.08], [m.top + innerH, m.top]);
  const yTicks = ticks(0, maxXg * 1.08, 3);
  const xTicks = [0, 15, 30, 45, 60, 75, 90].filter((t) => t <= maxMinute);

  const stepPath = (pts: { minute: number; total: number }[]) =>
    pts
      .map((p, i) =>
        i === 0
          ? `M ${x(p.minute)} ${y(p.total)}`
          // Horizontal to the shot's minute, then vertical by its xG: the step.
          : `L ${x(p.minute)} ${y(pts[i - 1]!.total)} L ${x(p.minute)} ${y(p.total)}`,
      )
      .join(' ');

  const homeTotal = homeSteps[homeSteps.length - 1]?.total ?? 0;
  const awayTotal = awaySteps[awaySteps.length - 1]?.total ?? 0;

  const valueAt = (pts: { minute: number; total: number }[], minute: number) => {
    let v = 0;
    for (const p of pts) if (p.minute <= minute) v = p.total;
    return v;
  };

  return (
    <figure className="m-0">
      <ChartFrame
        width={width}
        height={height}
        title="Cumulative expected goals"
        description={`${homeName} ${homeTotal.toFixed(2)} xG, ${awayName} ${awayTotal.toFixed(2)} xG over ${maxMinute} minutes`}
      >
        <GridLines values={yTicks} y={y} x0={m.left} x1={m.left + innerW} />
        <AxisLeft values={yTicks} y={y} x={m.left} format={(v) => v.toFixed(1)} />
        <AxisBottom values={xTicks} x={x} y={m.top + innerH} format={(v) => `${v}'`} />

        {/* Half-time marker — context the reader always wants. */}
        {maxMinute > 45 ? (
          <line
            x1={x(45)} x2={x(45)} y1={m.top} y2={m.top + innerH}
            stroke="var(--border-default)" strokeWidth={1} strokeDasharray="2 3"
            aria-hidden="true"
          />
        ) : null}

        <path d={stepPath(awaySteps)} fill="none" stroke={AWAY_COLOR} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        <path d={stepPath(homeSteps)} fill="none" stroke={HOME_COLOR} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Goals. A 2px surface ring keeps two coincident goals countable. */}
        {goals.map((g, i) => (
          <circle
            key={i}
            cx={x(g.minute)}
            cy={y(g.total)}
            r={4}
            fill={g.side === 'home' ? HOME_COLOR : AWAY_COLOR}
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
        ))}

        {hoverMinute !== null ? (
          <g aria-hidden="true">
            <line
              x1={x(hoverMinute)} x2={x(hoverMinute)} y1={m.top} y2={m.top + innerH}
              stroke="var(--border-strong)" strokeWidth={1}
            />
            <circle cx={x(hoverMinute)} cy={y(valueAt(homeSteps, hoverMinute))} r={4}
              fill={HOME_COLOR} stroke="var(--surface-1)" strokeWidth={2} />
            <circle cx={x(hoverMinute)} cy={y(valueAt(awaySteps, hoverMinute))} r={4}
              fill={AWAY_COLOR} stroke="var(--surface-1)" strokeWidth={2} />
          </g>
        ) : null}

        {/* One transparent capture rect: a bigger hit target than the marks. */}
        <rect
          x={m.left} y={m.top} width={innerW} height={innerH}
          fill="transparent"
          onMouseMove={(e) => {
            const box = (e.target as SVGRectElement).getBoundingClientRect();
            const ratio = (e.clientX - box.left) / box.width;
            setHoverMinute(Math.round(Math.max(0, Math.min(1, ratio)) * maxMinute));
          }}
          onMouseLeave={() => setHoverMinute(null)}
        />
      </ChartFrame>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Legend
          items={[
            { label: homeName, color: HOME_COLOR, value: homeTotal.toFixed(2) },
            { label: awayName, color: AWAY_COLOR, value: awayTotal.toFixed(2) },
          ]}
        />
        {hoverMinute !== null ? (
          <span className="figure text-xs text-ink-secondary">
            {hoverMinute}&apos; · {valueAt(homeSteps, hoverMinute).toFixed(2)} –{' '}
            {valueAt(awaySteps, hoverMinute).toFixed(2)}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">
            Final score {homeGoals ?? '—'}–{awayGoals ?? '—'}
          </span>
        )}
      </figcaption>

      <ChartTable
        caption="Shots with expected-goal values"
        columns={['Min', 'Team', 'xG', 'Outcome']}
        rows={[...shots]
          .sort((a, b) => a.minute - b.minute)
          .map((s) => [
            `${s.minute}'`,
            s.teamId === homeTeamId ? homeName : awayName,
            s.xG.toFixed(2),
            s.outcome.replace(/_/g, ' '),
          ])}
      />
    </figure>
  );
}
