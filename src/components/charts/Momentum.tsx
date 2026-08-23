'use client';

import { ChartFrame, Legend, HOME_COLOR, AWAY_COLOR } from './primitives';

/**
 * Match momentum — a diverging area around a zero baseline.
 *
 * Diverging is the correct form here because the data has genuine POLARITY: one
 * team's pressure is the other's absence of it, and the interesting question is
 * which way and how hard, not the magnitude alone. Two stacked one-sided charts
 * would hide exactly the thing worth seeing.
 *
 * The zero line is drawn in a neutral ink, not in either team's colour, so the
 * baseline never implies a side is "winning" at parity.
 */
export function Momentum({
  data, homeName, awayName, height = 96,
}: {
  data: { minute: number; value: number }[];
  homeName: string;
  awayName: string;
  height?: number;
}) {
  if (!data.length) return null;

  const width = 640;
  const pad = 4;
  const maxMinute = Math.max(90, ...data.map((d) => d.minute));
  const maxAbs = Math.max(20, ...data.map((d) => Math.abs(d.value)));

  const x = (m: number) => pad + (m / maxMinute) * (width - pad * 2);
  const mid = height / 2;
  const y = (v: number) => mid - (v / maxAbs) * (mid - pad);

  // One bar per sampled minute reads better than an area here: momentum is a
  // sampled series, and bars make the individual spells legible rather than
  // implying a smooth continuous curve between samples.
  const barW = Math.max(1.5, (width - pad * 2) / data.length - 0.6);

  return (
    <figure className="m-0">
      <ChartFrame
        width={width}
        height={height}
        title="Match momentum"
        description={`Pressure through the match. Bars above the line favour ${homeName}, below favour ${awayName}.`}
      >
        {data.map((d) => {
          const yv = y(d.value);
          const top = Math.min(yv, mid);
          const h = Math.abs(mid - yv);
          return (
            <rect
              key={d.minute}
              x={x(d.minute) - barW / 2}
              y={top}
              width={barW}
              height={Math.max(h, 0.5)}
              rx={1}
              fill={d.value >= 0 ? HOME_COLOR : AWAY_COLOR}
              opacity={0.85}
            />
          );
        })}

        {/* Neutral baseline — never either side's colour. */}
        <line
          x1={pad} x2={width - pad} y1={mid} y2={mid}
          stroke="var(--border-strong)" strokeWidth={1} shapeRendering="crispEdges"
          aria-hidden="true"
        />
        {maxMinute > 45 ? (
          <line
            x1={x(45)} x2={x(45)} y1={pad} y2={height - pad}
            stroke="var(--border-default)" strokeWidth={1} strokeDasharray="2 3"
            aria-hidden="true"
          />
        ) : null}
      </ChartFrame>

      <figcaption className="mt-2">
        <Legend
          items={[
            { label: `${homeName} pressure`, color: HOME_COLOR },
            { label: `${awayName} pressure`, color: AWAY_COLOR },
          ]}
        />
      </figcaption>
    </figure>
  );
}
