import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Shared chart anatomy.
 *
 * Built as inline SVG rather than a charting library, deliberately. A library's
 * defaults are somebody else's design system: default palettes that are not
 * CVD-validated, default grids that compete with the data, default tooltips
 * that ignore the token layer. Everything here reads the same custom properties
 * as the rest of the product, so a token change moves the charts too.
 *
 * House rules, applied consistently across every chart in this directory:
 *   • 2px strokes for data lines, recessive 1px hairlines for grid and axes
 *   • a 2px surface-coloured ring on any mark that can overlap another, so
 *     coincident points stay countable
 *   • axis and tick labels wear TEXT tokens, never a series colour — a coloured
 *     mark beside the label carries identity
 *   • a legend whenever there are two or more series, plus direct labels where
 *     they fit, so identity never rests on colour alone
 */

export const CHART_SERIES = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
  'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)',
] as const;

/** The two-sided case that dominates football: home and away. */
export const HOME_COLOR = 'var(--series-1)';
export const AWAY_COLOR = 'var(--series-2)';

export interface Margin { top: number; right: number; bottom: number; left: number }

export const DEFAULT_MARGIN: Margin = { top: 8, right: 12, bottom: 22, left: 32 };

/** Linear scale factory. Guards a zero-width domain, which otherwise yields NaN
 *  coordinates and an invisible chart with no error anywhere. */
export function scale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Nice round tick values covering a domain. */
export function ticks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

/** Responsive SVG frame with an accessible title and description. */
export function ChartFrame({
  width, height, title, description, children, className,
}: {
  width: number;
  height: number;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={description ? `${title}. ${description}` : title}
      // Width 100% with an AUTO height, not a fixed one. Setting both plus
      // preserveAspectRatio letterboxes the chart: it renders at its natural
      // aspect centred in the container, leaving dead space either side.
      style={{ width: '100%', height: 'auto' }}
      className={cn('block overflow-visible', className)}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      {description ? <desc>{description}</desc> : null}
      {children}
    </svg>
  );
}

/** Horizontal gridlines. Recessive by design: present enough to read a value
 *  against, quiet enough never to compete with the data. */
export function GridLines({
  values, y, x0, x1,
}: { values: number[]; y: (v: number) => number; x0: number; x1: number }) {
  return (
    <g aria-hidden="true">
      {values.map((v) => (
        <line
          key={v}
          x1={x0}
          x2={x1}
          y1={y(v)}
          y2={y(v)}
          stroke="var(--border-subtle)"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  );
}

export function AxisLeft({
  values, y, x, format = String,
}: {
  values: number[];
  y: (v: number) => number;
  x: number;
  format?: (v: number) => string;
}) {
  return (
    <g aria-hidden="true">
      {values.map((v) => (
        <text
          key={v}
          x={x - 6}
          y={y(v)}
          textAnchor="end"
          dominantBaseline="middle"
          className="figure"
          fontSize={10}
          fill="var(--text-muted)"
        >
          {format(v)}
        </text>
      ))}
    </g>
  );
}

export function AxisBottom({
  values, x, y, format = String,
}: {
  values: number[];
  x: (v: number) => number;
  y: number;
  format?: (v: number) => string;
}) {
  return (
    <g aria-hidden="true">
      {values.map((v) => (
        <text
          key={v}
          x={x(v)}
          y={y + 14}
          textAnchor="middle"
          className="figure"
          fontSize={10}
          fill="var(--text-muted)"
        >
          {format(v)}
        </text>
      ))}
    </g>
  );
}

/**
 * The legend. Present whenever there are two or more series — that is what
 * keeps identity off colour alone for a reader who cannot separate the hues.
 */
export function Legend({
  items, className,
}: {
  items: { label: string; color: string; value?: string }[];
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-2 text-xs">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: it.color }}
          />
          <span className="text-ink-secondary">{it.label}</span>
          {it.value ? <span className="figure text-ink">{it.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The always-available fallback: the same numbers as a table.
 *
 * Not an afterthought. It is what makes every chart here usable with a screen
 * reader, in forced-colours mode, and by anyone who simply wants the figures.
 */
export function ChartTable({
  caption, columns, rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer list-none text-2xs uppercase tracking-caps text-ink-muted transition-colors duration-fast ease-standard hover:text-ink-secondary">
        <span className="group-open:hidden">Show data</span>
        <span className="hidden group-open:inline">Hide data</span>
      </summary>
      <div className="scroll-x mt-2">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border-subtle text-2xs uppercase tracking-caps text-ink-muted">
              {columns.map((c) => (
                <th key={c} scope="col" className="px-2 py-1 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border-subtle/60">
                {r.map((cell, j) => (
                  <td key={j} className="figure px-2 py-1 text-ink-secondary">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
