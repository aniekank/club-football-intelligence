'use client';

import { useMemo, useState } from 'react';
import { ChartTable } from './primitives';
import { cn } from '@/lib/cn';
import type { Shot } from '@/domain/types';

/**
 * A season's shots on one half-pitch.
 *
 * The per-match shot map answers "what happened in this game". This answers the
 * more interesting question — "where does this player or club actually shoot
 * from, and which of those chances go in" — which needs hundreds of shots, not
 * twenty-five. The product was holding 19,076 of them and exposing none at this
 * grain.
 *
 * ── Half a pitch, not a whole one ──────────────────────────────────────────
 * Every shot is attacking the same goal, so the defensive half is empty space.
 * Cropping to the attacking half doubles the scale at which the penalty area —
 * where almost every shot happens — is drawn.
 *
 * ── Encoding ───────────────────────────────────────────────────────────────
 * Position is where the shot was taken. Marker AREA is xG (radius scales with
 * its square root, so a 0.4 chance looks twice a 0.1 one rather than four
 * times). A filled mark is a goal; an outline is not. Colour is a single hue
 * throughout — with hundreds of overlapping marks, an all-pairs-legal palette
 * would cap at three categories and goals-versus-misses is better carried by
 * fill anyway.
 */

const PITCH_W = 68;
const HALF_L = 60; // attacking half plus a little of the middle third

export interface ShotFilters {
  situation: string;
  bodyPart: string;
  outcome: string;
}

const SITUATIONS = [
  { value: 'all', label: 'All play' },
  { value: 'open_play', label: 'Open play' },
  { value: 'corner', label: 'Corners' },
  { value: 'free_kick', label: 'Free kicks' },
  { value: 'set_piece', label: 'Set pieces' },
  { value: 'penalty', label: 'Penalties' },
  { value: 'fast_break', label: 'Fast breaks' },
];

const BODY_PARTS = [
  { value: 'all', label: 'Any' },
  { value: 'right_foot', label: 'Right foot' },
  { value: 'left_foot', label: 'Left foot' },
  { value: 'head', label: 'Head' },
];

const OUTCOMES = [
  { value: 'all', label: 'All shots' },
  { value: 'goal', label: 'Goals only' },
  { value: 'ontarget', label: 'On target' },
];

export function SeasonShotMap({
  shots, subjectLabel,
}: {
  shots: Shot[];
  subjectLabel: string;
}) {
  const [situation, setSituation] = useState('all');
  const [bodyPart, setBodyPart] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [active, setActive] = useState<Shot | null>(null);

  const filtered = useMemo(
    () =>
      shots.filter((s) => {
        if (situation !== 'all' && s.situation !== situation) return false;
        if (bodyPart !== 'all' && s.bodyPart !== bodyPart) return false;
        if (outcome === 'goal' && s.outcome !== 'goal') return false;
        if (outcome === 'ontarget' && s.outcome !== 'goal' && s.outcome !== 'saved') return false;
        return true;
      }),
    [shots, situation, bodyPart, outcome],
  );

  const goals = filtered.filter((s) => s.outcome === 'goal').length;
  const xg = filtered.reduce((n, s) => n + s.xG, 0);

  if (!shots.length) return null;

  // Source x is 0 (own goal) to 100 (opposition goal); crop to the attacking end.
  const place = (s: Shot) => ({
    cx: HALF_L - ((100 - s.x) / 100) * (2 * HALF_L),
    cy: (s.y / 100) * PITCH_W,
  });
  const radius = (v: number) => 0.7 + Math.sqrt(Math.max(v, 0)) * 3.4;

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap gap-3">
        <Picker label="Situation" value={situation} onChange={setSituation} options={SITUATIONS} />
        <Picker label="Body part" value={bodyPart} onChange={setBodyPart} options={BODY_PARTS} />
        <Picker label="Outcome" value={outcome} onChange={setOutcome} options={OUTCOMES} />
      </div>

      <div className="relative">
        <svg
          viewBox={`-1 -1 ${HALF_L + 2} ${PITCH_W + 2}`}
          style={{ width: '100%', height: 'auto' }}
          role="img"
          aria-label={`Shot map for ${subjectLabel}: ${filtered.length} shots, ${goals} goals, ${xg.toFixed(1)} expected goals.`}
          className="block"
        >
          <title>{`Shot map — ${subjectLabel}`}</title>

          <g stroke="var(--border-default)" strokeWidth={0.3} fill="none" aria-hidden="true">
            <rect x={0} y={0} width={HALF_L} height={PITCH_W} />
            <rect x={HALF_L - 16.5} y={PITCH_W / 2 - 20.15} width={16.5} height={40.3} />
            <rect x={HALF_L - 5.5} y={PITCH_W / 2 - 9.16} width={5.5} height={18.32} />
            <circle cx={HALF_L - 11} cy={PITCH_W / 2} r={0.4} fill="var(--border-default)" />
            {/* The D */}
            <path d={`M ${HALF_L - 16.5} ${PITCH_W / 2 - 7.3} A 9.15 9.15 0 0 0 ${HALF_L - 16.5} ${PITCH_W / 2 + 7.3}`} />
          </g>

          {/* Misses first, so goals sit on top of the crowd. */}
          {[...filtered]
            .sort((a, b) => Number(a.outcome === 'goal') - Number(b.outcome === 'goal'))
            .map((s) => {
              const { cx, cy } = place(s);
              const isGoal = s.outcome === 'goal';
              const isActive = active?.id === s.id;
              return (
                <circle
                  key={s.id}
                  cx={cx}
                  cy={cy}
                  r={radius(s.xG)}
                  fill={isGoal ? 'var(--series-1)' : 'transparent'}
                  fillOpacity={isGoal ? 0.55 : 0}
                  stroke={isActive ? 'var(--text-primary)' : 'var(--series-1)'}
                  strokeWidth={isGoal ? 0.5 : 0.35}
                  strokeOpacity={isGoal ? 1 : 0.55}
                  className="cursor-pointer"
                  onMouseEnter={() => setActive(s)}
                  onMouseLeave={() => setActive(null)}
                />
              );
            })}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-md border border-border-subtle bg-surface-3 px-3 py-2 text-xs shadow-lg">
            <p className="figure font-semibold">{active.xG.toFixed(2)} xG</p>
            <p className="text-ink-secondary">
              {active.outcome.replace(/_/g, ' ')} · {active.bodyPart.replace(/_/g, ' ')}
            </p>
            <p className="text-ink-muted">{active.situation.replace(/_/g, ' ')}</p>
          </div>
        ) : null}
      </div>

      <figcaption className="mt-3 space-y-1">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <Stat label="Shots" value={String(filtered.length)} />
          <Stat label="Goals" value={String(goals)} />
          <Stat label="xG" value={xg.toFixed(2)} />
          <Stat
            label="Conversion"
            value={filtered.length ? `${((goals / filtered.length) * 100).toFixed(0)}%` : '—'}
          />
          <Stat
            label="xG per shot"
            value={filtered.length ? (xg / filtered.length).toFixed(3) : '—'}
          />
        </div>
        <p className="text-2xs text-ink-muted">
          Marker area is expected-goal value. Filled markers are goals.
          {filtered.length !== shots.length ? ` Filtered from ${shots.length} shots.` : ''}
        </p>
      </figcaption>

      <ChartTable
        caption={`Every shot for ${subjectLabel}`}
        columns={['xG', 'Body', 'Situation', 'Outcome']}
        rows={[...filtered]
          .sort((a, b) => b.xG - a.xG)
          .slice(0, 60)
          .map((s) => [
            s.xG.toFixed(2),
            s.bodyPart.replace(/_/g, ' '),
            s.situation.replace(/_/g, ' '),
            s.outcome.replace(/_/g, ' '),
          ])}
      />
    </figure>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="eyebrow">{label}</span>
      <span className="figure font-semibold">{value}</span>
    </span>
  );
}

/**
 * Local state, not a URL param.
 *
 * Deliberately different from the Explore page. There, the filters ARE the
 * view and a link should carry them. Here they are a lens on one subject's
 * page, changed often and rarely worth sharing on their own — a round trip per
 * click would be worse than the loss of shareability.
 */
function Picker({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-8 rounded-sm border border-border-subtle bg-surface-1 px-2 text-xs',
          'transition-colors duration-fast ease-standard hover:border-border focus-visible:shadow-focus',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
