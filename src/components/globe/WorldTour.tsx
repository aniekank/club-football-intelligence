'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Globe, type GlobePoint } from './Globe';
import { Figure, Crest, LiveDot } from '@/components/ui';
import { LocalTime } from '@/components/ui/LocalTime';
import { cn } from '@/lib/cn';
import { pct } from '@/lib/format';
import type { TourStop } from '@/server/tour';

/**
 * The next football on earth, one place at a time.
 *
 * ── Why a globe is the right lead for THIS product ─────────────────────────
 * Every other surface here is scoped to a competition: pick a league, read its
 * table, open its fixtures. That is how the data is shaped and it is not how
 * the reader's evening is shaped — the next match that matters might be in São
 * Paulo, and the one after it in Riyadh. A globe is the only presentation that
 * is honestly league-agnostic, because on a sphere a Brasileirão fixture and a
 * Premier League fixture are just two places, and the thing they have in common
 * is the clock.
 *
 * So the tour is ordered by time, not by importance: whatever is live, then
 * whatever kicks off next, wherever that is. The camera goes there.
 *
 * ── The rules that make an auto-advancing hero acceptable ──────────────────
 * The same ones the storyline spotlight follows, for the same reasons. It
 * pauses on hover and on keyboard focus; there is an explicit play/pause and
 * dots that jump directly; the change is announced politely rather than
 * silently swapped; and under `prefers-reduced-motion` it does not advance at
 * all — the reader steps it themselves, and the globe holds still.
 */

const DWELL_MS = 8000;

export function WorldTour({ stops, suffix }: { stops: TourStop[]; suffix: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const go = useCallback((next: number) => {
    setIndex(() => {
      const n = stops.length;
      return ((next % n) + n) % n;
    });
    setTick((t) => t + 1);
  }, [stops.length]);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (reduced || !playing || paused || stops.length < 2) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % stops.length), DWELL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, playing, paused, stops.length]);

  if (!stops.length) return null;

  const stop = stops[index] as TourStop;
  const next = stops[(index + 1) % stops.length] as TourStop;
  const points: GlobePoint[] = stops.map((s) => ({ key: s.matchId, lat: s.lat, lon: s.lon }));
  const where = [stop.venue, stop.city].filter(Boolean).join(', ') || stop.country;
  const played = stop.homeScore !== null && stop.awayScore !== null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Next matches around the world"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="lit-edge overflow-hidden rounded-lg border border-border-subtle bg-surface-1"
    >
      <div className="grid gap-0 md:grid-cols-[minmax(0,20rem)_1fr] lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div
          style={{ ['--comp-active' as string]: `var(--comp-${stop.accentKey})` }}
          className="relative aspect-square w-full border-b border-border-subtle md:border-b-0 md:border-r"
        >
          <Globe
            points={points}
            activeIndex={index}
            label={`A globe centred on ${where}, ${stop.country}, where ${stop.home.name} play ${stop.away.name}.`}
            className="absolute inset-0"
          />
        </div>

        <div className="flex min-w-0 flex-col justify-between">
          {/* Polite, atomic: a screen reader is told the whole new stop once,
              rather than being read six separate field changes. */}
          <div aria-live="polite" aria-atomic="true" className="flex min-w-0 flex-1 flex-col justify-center p-5">
            <div key={tick + index} className="animate-fade-up">
              <p className="eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="shrink-0 text-[var(--comp-active)]">{stop.competitionName}</span>
                {/* Some grounds have very long names — "Prince Sultan bin
                    Abdulaziz Sports City Stadium" — and an eyebrow that wraps
                    to three lines pushes the fixture off the top of the card.
                    The full name is still in the title. */}
                <span className="min-w-0 max-w-[22rem] truncate text-ink-muted" title={where}>
                  {where}
                </span>
                {stop.status === 'LIVE' || stop.status === 'HALFTIME' ? (
                  <span className="inline-flex items-center gap-[0.375rem] text-brand">
                    <LiveDot /> Live
                  </span>
                ) : played ? (
                  <span className="text-ink-muted">
                    Played · <Figure>{stop.kickoff.slice(0, 10)}</Figure>
                  </span>
                ) : (
                  <Figure tone="muted"><LocalTime iso={stop.kickoff} /></Figure>
                )}
              </p>

              <Link
                href={`/matches/${stop.matchId}${suffix}`}
                className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md transition-opacity duration-fast ease-standard hover:opacity-90"
              >
                <Side team={stop.home} align="end" />
                {played ? (
                  <Figure className="text-xl font-semibold">
                    {stop.homeScore}–{stop.awayScore}
                  </Figure>
                ) : (
                  <Figure tone="muted" className="text-xs">v</Figure>
                )}
                <Side team={stop.away} align="start" />
              </Link>

              {/* A finished match gets no model bar. The ratings behind it are
                  season-to-date, so a "prediction" for a game already played
                  is hindsight wearing a probability. */}
              {played ? null : <Odds stop={stop} />}
              <Record stop={stop} />
              <Watch stop={stop} />

              {/* Where the camera goes next. A tour that does not say where it
                  is heading is a slideshow; one that does is a journey, and it
                  costs one line. */}
              {stops.length > 1 ? (
                <p className="mt-4 text-2xs text-ink-muted">
                  Next: {next.city ?? next.country} — {next.home.shortName} v{' '}
                  {next.away.shortName}
                </p>
              ) : null}
            </div>
          </div>

          <Controls
            stops={stops}
            index={index}
            playing={playing}
            paused={paused}
            reduced={reduced}
            onGo={go}
            onToggle={() => setPlaying((p) => !p)}
            tick={tick}
          />
        </div>
      </div>
    </section>
  );
}

function Side({ team, align }: { team: TourStop['home']; align: 'start' | 'end' }) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-2',
        align === 'end' ? 'justify-end text-right' : 'justify-start',
      )}
    >
      {align === 'end' ? null : (
        <Crest url={team.crestUrl} code={team.code} name={team.name} size={28} />
      )}
      <span className="min-w-0 truncate font-display text-lg leading-tight">{team.shortName}</span>
      {align === 'end' ? (
        <Crest url={team.crestUrl} code={team.code} name={team.name} size={28} />
      ) : null}
    </span>
  );
}

/**
 * The model's three-way split as one bar.
 *
 * Three numbers in a row make the reader do the comparison; one bar shows the
 * shape of the fixture before a digit is read. The draw is deliberately the
 * neutral middle band rather than a third hue — it is not a third team.
 */
function Odds({ stop }: { stop: TourStop }) {
  const bands = [
    { key: 'home', label: stop.home.shortName, p: stop.odds.home, colour: 'var(--series-1)' },
    { key: 'draw', label: 'Draw', p: stop.odds.draw, colour: 'var(--border-strong)' },
    { key: 'away', label: stop.away.shortName, p: stop.odds.away, colour: 'var(--series-2)' },
  ];

  return (
    <div className="mt-4">
      <span
        className="flex h-[0.375rem] w-full overflow-hidden rounded-pill bg-surface-inset"
        role="img"
        aria-label={bands.map((b) => `${b.label} ${pct(b.p)}`).join(', ')}
      >
        {bands.map((b) => (
          <span key={b.key} style={{ width: `${b.p * 100}%`, background: b.colour }} />
        ))}
      </span>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
        {bands.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-[0.375rem]">
            <span
              aria-hidden="true"
              className="h-[0.375rem] w-[0.375rem] rounded-full"
              style={{ background: b.colour }}
            />
            {b.label} <Figure className="text-ink-secondary">{pct(b.p)}</Figure>
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * The head-to-head, or an honest note that there isn't one.
 *
 * Two clubs who have not met in the loaded data have no record, and printing
 * "0-0-0" would state a fact about their history rather than about this
 * product's memory of it.
 */
function Record({ stop }: { stop: TourStop }) {
  if (!stop.record) {
    return (
      <p className="mt-4 text-2xs text-ink-muted">
        No previous meeting in the seasons loaded here.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="eyebrow">Head to head</span>
        <span className="text-sm">
          <Figure className="font-semibold">{stop.record.home}</Figure>
          <span className="text-ink-muted"> {stop.home.code} · </span>
          <Figure className="font-semibold">{stop.record.draw}</Figure>
          <span className="text-ink-muted"> drawn · </span>
          <Figure className="font-semibold">{stop.record.away}</Figure>
          <span className="text-ink-muted"> {stop.away.code}</span>
        </span>
      </p>
      {stop.meetings.length ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
          {stop.meetings.slice(0, 3).map((m) => (
            <li key={m.kickoff} className="inline-flex items-baseline gap-[0.375rem]">
              <Figure className="text-ink-secondary">{m.homeScore}–{m.awayScore}</Figure>
              <span>{m.kickoff.slice(0, 4)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Watch({ stop }: { stop: TourStop }) {
  if (!stop.watch.length) return null;
  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      <p className="eyebrow mb-2">Watch</p>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {stop.watch.map((p) => (
          <li key={p.playerId} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {p.name}
              <span className="ml-2 text-2xs uppercase tracking-caps text-ink-muted">
                {p.teamId === stop.home.id ? stop.home.code : stop.away.code}
              </span>
            </span>
            <span className="shrink-0 text-2xs text-ink-muted">
              <Figure>{p.goals}</Figure>G <Figure>{p.assists}</Figure>A
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Controls({
  stops, index, playing, paused, reduced, onGo, onToggle, tick,
}: {
  stops: TourStop[];
  index: number;
  playing: boolean;
  paused: boolean;
  reduced: boolean;
  onGo: (n: number) => void;
  onToggle: () => void;
  tick: number;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border-subtle px-5 py-3">
      {reduced ? (
        <div className="flex gap-1">
          <Step label="Previous match" onClick={() => onGo(index - 1)}>‹</Step>
          <Step label="Next match" onClick={() => onGo(index + 1)}>›</Step>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? 'Pause the tour' : 'Play the tour'}
          className="rounded-sm border border-border-subtle px-2 py-1 text-2xs font-semibold uppercase tracking-caps text-ink-muted transition-colors duration-fast ease-standard hover:border-border hover:text-ink"
        >
          {playing ? '❚❚' : '▶'}
        </button>
      )}

      <div className="flex flex-1 items-center gap-[0.375rem]" role="tablist" aria-label="Match">
        {stops.map((s, i) => {
          const active = i === index;
          return (
            <button
              key={s.matchId}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${s.home.shortName} v ${s.away.shortName}, ${s.city ?? s.country}`}
              onClick={() => onGo(i)}
              className="group relative h-4 flex-1 min-w-[1rem]"
            >
              <span
                className={cn(
                  'absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-pill transition-colors duration-normal ease-standard',
                  active ? 'bg-brand' : 'bg-border-default group-hover:bg-border-strong',
                )}
              />
              {active && playing && !paused && !reduced ? (
                <span
                  key={tick}
                  aria-hidden="true"
                  className="absolute inset-x-0 top-1/2 h-[3px] origin-left -translate-y-1/2 rounded-pill bg-brand-hover animate-dwell"
                  style={{ animationDuration: `${DWELL_MS}ms` }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <Figure tone="muted" className="shrink-0 text-2xs">
        {index + 1}/{stops.length}
      </Figure>
    </div>
  );
}

function Step({
  label, onClick, children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded-sm border border-border-subtle text-ink-muted transition-colors duration-fast ease-standard hover:border-border hover:text-ink"
    >
      {children}
    </button>
  );
}
