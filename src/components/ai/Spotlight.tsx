'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Figure } from '@/components/ui';
import { cn } from '@/lib/cn';
import { StoryCard } from './StoryCard';
import type { Insight } from '@/domain/types';

/**
 * The rotating spotlight — one story at a time, sliding through.
 *
 * ── Why rotate at all ──────────────────────────────────────────────────────
 * The engine produces a dozen stories and a page can only lead with one. A
 * static list makes every story equally weighted and equally ignored; a
 * spotlight gives each one the whole width for a few seconds, which is the only
 * way the fifth-best story ever gets read.
 *
 * ── The rules that make auto-rotation acceptable ───────────────────────────
 * Content that moves on its own is hostile unless it can be stopped, so:
 *
 *   • It PAUSES on hover and on keyboard focus. Reading a card should never be
 *     a race against a timer you did not start.
 *   • There is an explicit play/pause control, and dots that jump directly.
 *   • Under `prefers-reduced-motion` it does not rotate at ALL — it renders
 *     every story stacked and static. Not "the same carousel, faster": a reader
 *     who asked for less motion should not be handed moving content with a
 *     shorter transition.
 *   • `aria-live="polite"` announces the change, and the region is labelled, so
 *     a screen reader is told what happened rather than silently re-read.
 *
 * ── The motion itself ──────────────────────────────────────────────────────
 * Outgoing story slides out and fades; incoming slides in from the opposite
 * side. Direction follows intent — forward moves left, backward moves right —
 * so the gesture matches the mental model of a strip of cards. 24px of travel,
 * which is enough to read as movement and not so much that the eye has to
 * chase it.
 */

const DWELL_MS = 7000;

export function Spotlight({ insights, suffix }: { insights: Insight[]; suffix: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [paused, setPaused] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [reduced, setReduced] = useState(false);
  // Re-keys the card so the enter animation replays on every change.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const go = useCallback((next: number, direction: 1 | -1) => {
    setDir(direction);
    setIndex((i) => {
      const n = insights.length;
      return ((next % n) + n) % n;
    });
    setTick((t) => t + 1);
  }, [insights.length]);

  const advance = useCallback(() => go(index + 1, 1), [go, index]);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (reduced || !playing || paused || insights.length < 2) return;
    timer.current = setInterval(advance, DWELL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, playing, paused, advance, insights.length]);

  if (!insights.length) return null;

  /* Reduced motion: no rotation, no timer, everything visible at once. */
  if (reduced) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {insights.slice(0, 4).map((i) => (
          <StoryCard key={i.id} insight={i} suffix={suffix} />
        ))}
      </div>
    );
  }

  const current = insights[index] as Insight;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Storylines"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="relative"
    >
      <div aria-live="polite" aria-atomic="true" className="min-h-[9.5rem]">
        <div
          key={tick}
          className={cn(
            'will-change-transform',
            dir === 1 ? 'animate-slide-in-right' : 'animate-slide-in-left',
          )}
        >
          <StoryCard insight={current} suffix={suffix} featured />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause storylines' : 'Play storylines'}
          className="rounded-sm border border-border-subtle px-2 py-1 text-2xs font-semibold uppercase tracking-caps text-ink-muted transition-colors duration-fast ease-standard hover:border-border hover:text-ink"
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <div className="flex flex-1 items-center gap-[0.375rem]" role="tablist" aria-label="Storyline">
          {insights.map((ins, i) => {
            const active = i === index;
            return (
              <button
                key={ins.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={ins.title}
                onClick={() => go(i, i > index ? 1 : -1)}
                className="group relative h-4 flex-1 min-w-[1rem]"
              >
                <span
                  className={cn(
                    'absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-pill transition-colors duration-normal ease-standard',
                    active ? 'bg-brand' : 'bg-border-default group-hover:bg-border-strong',
                  )}
                />
                {/* The dwell timer, drawn. A progress bar that fills over the
                    same seconds the card is held makes the rotation feel
                    deliberate rather than arbitrary — and shows a paused
                    carousel is paused, without a second indicator. */}
                {active && playing && !paused ? (
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
          {index + 1}/{insights.length}
        </Figure>
      </div>
    </section>
  );
}
