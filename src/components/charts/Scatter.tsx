'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChartTable, scale, ticks } from './primitives';
import { formatValue, type FormatKind } from '@/lib/formatKind';
import { cn } from '@/lib/cn';

/**
 * The scatter — the workhorse this product was missing.
 *
 * Relationship between two continuous measures is the one question a table
 * cannot answer, and outliers are where the insight lives. Everything here
 * serves finding them.
 *
 * ── Why one colour and not a categorical palette ───────────────────────────
 * Colouring twenty clubs by qualification zone would need five or six hues, and
 * the validated palette clears the all-pairs CVD gate at THREE. Under the
 * all-pairs rule — which a scatter is, since any two marks can sit adjacent —
 * a fourth hue is not legal. So identity is carried by DIRECT LABELS, which a
 * twenty-club league can afford, and the single hue keeps every mark equally
 * readable. Player scatters have hundreds of points, so only the extremes are
 * labelled; the rest are found by hovering.
 *
 * ── The median crosshair is the analytical device ──────────────────────────
 * Raw position tells you little without a reference. Splitting on the median of
 * each axis turns the plot into four quadrants with plain-English meanings —
 * "creates a lot, concedes a lot" is a shape, not a number — and the quadrant
 * labels are generated from each metric's `higherIsBetter`, so they stay correct
 * when the axes change.
 */

export interface ScatterPoint {
  id: string;
  label: string;
  /** Short form for the on-chart label. */
  short: string;
  x: number;
  y: number;
  href?: string;
  /** Extra rows for the tooltip. */
  detail?: [string, string][];
}

export interface ScatterAxis {
  label: string;
  short: string;
  higherIsBetter: boolean;
  /** A serialisable kind, resolved to a formatter on this side of the
   *  boundary — functions cannot cross from a server component. */
  format: FormatKind;
}

const WIDTH = 720;
const HEIGHT = 460;
const M = { top: 20, right: 24, bottom: 48, left: 68 };

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function Scatter({
  points, x: xAxis, y: yAxis, labelMode = 'all', highlightId,
}: {
  points: ScatterPoint[];
  x: ScatterAxis;
  y: ScatterAxis;
  /** 'all' labels every mark; 'extremes' labels only the outliers. */
  labelMode?: 'all' | 'extremes';
  highlightId?: string;
}) {
  const [active, setActive] = useState<ScatterPoint | null>(null);
  const fx = (v: number) => formatValue(xAxis.format, v);
  const fy = (v: number) => formatValue(yAxis.format, v);

  const geom = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    // A little headroom so a mark never sits on the frame.
    const pad = (lo: number, hi: number) => {
      const span = hi - lo || Math.abs(hi) || 1;
      return [lo - span * 0.08, hi + span * 0.08] as [number, number];
    };
    const xDomain = pad(Math.min(...xs), Math.max(...xs));
    const yDomain = pad(Math.min(...ys), Math.max(...ys));
    return {
      x: scale(xDomain, [M.left, WIDTH - M.right]),
      y: scale(yDomain, [HEIGHT - M.bottom, M.top]),
      xTicks: ticks(xDomain[0], xDomain[1], 5),
      yTicks: ticks(yDomain[0], yDomain[1], 4),
      xMed: median(xs),
      yMed: median(ys),
    };
  }, [points]);

  if (!geom || !points.length) {
    return (
      <p className="px-4 py-8 text-center text-sm text-ink-muted">
        No data for this pair of metrics.
      </p>
    );
  }

  const { x, y, xTicks, yTicks, xMed, yMed } = geom;

  // Distance from the median in each axis, normalised — used to pick which
  // marks are worth labelling when there are too many to label all.
  const spread = (vals: number[], med: number) =>
    Math.max(...vals.map((v) => Math.abs(v - med))) || 1;
  const xSpread = spread(points.map((p) => p.x), xMed);
  const ySpread = spread(points.map((p) => p.y), yMed);
  const outlierScore = (p: ScatterPoint) =>
    Math.hypot((p.x - xMed) / xSpread, (p.y - yMed) / ySpread);

  const labelled = new Set(
    labelMode === 'all'
      ? points.map((p) => p.id)
      : [...points].sort((a, b) => outlierScore(b) - outlierScore(a)).slice(0, 10).map((p) => p.id),
  );

  /**
   * Quadrant captions, derived so they stay true when the axes change.
   *
   * Named after WHICH measure is the good one rather than with metric
   * shorthand: "strong on xG/g" beats "xG/g only", which reads like a filter
   * rather than a description.
   */
  const quadrant = (right: boolean, top: boolean) => {
    const xGood = right === xAxis.higherIsBetter;
    const yGood = top === yAxis.higherIsBetter;
    if (xGood && yGood) return 'strong on both';
    if (!xGood && !yGood) return 'weak on both';
    return `strong on ${xGood ? xAxis.short : yAxis.short} only`;
  };

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ width: '100%', height: 'auto' }}
          role="img"
          aria-label={`Scatter plot of ${yAxis.label} against ${xAxis.label} for ${points.length} entries. Reference lines mark the median of each axis.`}
          className="block overflow-visible"
        >
          {/* A SINGLE text node. `{a} vs {b}` renders three, and Next hoists
              <title> elements, so the split fails hydration with "expected
              server HTML to contain a matching text node". */}
          <title>{`${yAxis.label} vs ${xAxis.label}`}</title>

          {/* Grid, recessive. */}
          <g aria-hidden="true">
            {yTicks.map((v) => (
              <line key={`y${v}`} x1={M.left} x2={WIDTH - M.right} y1={y(v)} y2={y(v)}
                stroke="var(--border-subtle)" strokeWidth={1} shapeRendering="crispEdges" />
            ))}
            {xTicks.map((v) => (
              <line key={`x${v}`} x1={x(v)} x2={x(v)} y1={M.top} y2={HEIGHT - M.bottom}
                stroke="var(--border-subtle)" strokeWidth={1} shapeRendering="crispEdges" />
            ))}
          </g>

          {/* The median crosshair — the thing that makes position mean something. */}
          <g aria-hidden="true">
            <line x1={x(xMed)} x2={x(xMed)} y1={M.top} y2={HEIGHT - M.bottom}
              stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={M.left} x2={WIDTH - M.right} y1={y(yMed)} y2={y(yMed)}
              stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={M.left + 4} y={y(yMed) - 5} fontSize={9}
              fill="var(--text-muted)" className="figure">
              {`median ${fy(yMed)}`}
            </text>
          </g>

          {/* Quadrant captions, corner-anchored and deliberately quiet. */}
          <g aria-hidden="true" fontSize={9} fill="var(--text-muted)">
            <text x={WIDTH - M.right - 4} y={M.top + 10} textAnchor="end">{quadrant(true, true)}</text>
            <text x={M.left + 4} y={M.top + 10}>{quadrant(false, true)}</text>
            <text x={WIDTH - M.right - 4} y={HEIGHT - M.bottom - 4} textAnchor="end">{quadrant(true, false)}</text>
            <text x={M.left + 4} y={HEIGHT - M.bottom - 4}>{quadrant(false, false)}</text>
          </g>

          {/* Axes */}
          <g aria-hidden="true" fontSize={10} fill="var(--text-muted)" className="figure">
            {yTicks.map((v) => (
              <text key={`yl${v}`} x={M.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
                {fy(v)}
              </text>
            ))}
            {xTicks.map((v) => (
              <text key={`xl${v}`} x={x(v)} y={HEIGHT - M.bottom + 16} textAnchor="middle">
                {fx(v)}
              </text>
            ))}
          </g>
          <text x={WIDTH / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
            {`${xAxis.label} →`}
          </text>
          <text x={16} y={HEIGHT / 2} textAnchor="middle" fontSize={11} fill="var(--text-secondary)"
            transform={`rotate(-90 16 ${HEIGHT / 2})`}>
            {`${yAxis.label} →`}
          </text>

          {/* Marks. A 2px surface ring keeps overlapping points countable. */}
          {points.map((p) => {
            const isActive = active?.id === p.id;
            const isHighlight = highlightId === p.id;
            return (
              <g key={p.id}>
                <circle
                  cx={x(p.x)}
                  cy={y(p.y)}
                  r={isActive || isHighlight ? 7 : 5}
                  fill={isHighlight ? 'var(--brand)' : 'var(--series-1)'}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                  opacity={active && !isActive ? 0.4 : 1}
                  className="cursor-pointer transition-opacity duration-fast ease-standard"
                  onMouseEnter={() => setActive(p)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(p)}
                  onBlur={() => setActive(null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.label}. ${xAxis.label} ${fx(p.x)}, ${yAxis.label} ${fy(p.y)}.`}
                />
                {labelled.has(p.id) ? (
                  <text
                    x={x(p.x)}
                    y={y(p.y) - 9}
                    textAnchor="middle"
                    fontSize={9}
                    fill={isActive || isHighlight ? 'var(--text-primary)' : 'var(--text-muted)'}
                    className="pointer-events-none"
                  >
                    {p.short}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute left-1/2 top-2 z-popover -translate-x-1/2 rounded-md border border-border-subtle bg-surface-3 px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold">{active.label}</p>
            <p className="text-ink-secondary">
              <span className="figure">{fx(active.x)}</span> {xAxis.short} ·{' '}
              <span className="figure">{fy(active.y)}</span> {yAxis.short}
            </p>
            {active.detail?.map(([k, v]) => (
              <p key={k} className="text-ink-muted">
                {k} <span className="figure">{v}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-2xs text-ink-muted">
        <span>
          {points.length} shown · dashed lines mark the median of each axis
          {labelMode === 'extremes' ? ' · only outliers are labelled' : ''}
        </span>
        {active?.href ? (
          <Link href={active.href} className={cn('underline-offset-2 hover:text-ink hover:underline')}>
            Open {active.label} →
          </Link>
        ) : null}
      </figcaption>

      <ChartTable
        caption={`${yAxis.label} against ${xAxis.label}`}
        columns={['', xAxis.short, yAxis.short]}
        rows={[...points]
          .sort((a, b) => b.y - a.y)
          .map((p) => [p.label, fx(p.x), fy(p.y)])}
      />
    </figure>
  );
}
