'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { PALETTES, resolvedBySystem, type Theme } from '@/lib/themes';

/**
 * Theme control: an auto switch, then the palettes.
 *
 * ── Why "system" left the swatch row ───────────────────────────────────────
 * It used to be the first of five swatches, and on a dark-mode machine the
 * first two produced identical pages — because "follow the OS" and "dark" ARE
 * the same page when the OS is dark. A control whose first two options do
 * nothing distinguishable reads as broken, and the fix was not a better
 * swatch: they were never the same kind of thing. Four of these are palettes;
 * auto is a question about where the choice comes from.
 *
 * So auto is a labelled switch with a rule after it, and while it is on, the
 * palette it currently resolves to is marked underneath. That is the part the
 * old arrangement could not show at all — which of two identical-looking
 * swatches was actually doing the work.
 *
 * ── Why a row of swatches and not a cycling button ─────────────────────────
 * It was once a single button showing the CURRENT theme, which made every other
 * option invisible: reaching a third palette took three blind clicks and
 * nothing on screen suggested it existed. A control that hides its own options
 * is not a control, it is a guess. Each swatch previews the theme it selects —
 * its real canvas colour with its real accent — so the choice is made by
 * looking rather than by trying.
 *
 * "Auto" REMOVES the attribute rather than resolving it to a value. That is
 * what lets `prefers-color-scheme` take over and keeps the page following the
 * OS if the reader changes it later; the four palettes are explicit, stored,
 * and never inferred.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [prefersDark, setPrefersDark] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem('cfi-theme') as Theme | null;
    if (stored && stored !== 'system' && PALETTES.some((p) => p.id === stored)) setTheme(stored);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setPrefersDark(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') {
      root.removeAttribute('data-theme');
      window.localStorage.removeItem('cfi-theme');
    } else {
      root.setAttribute('data-theme', next);
      window.localStorage.setItem('cfi-theme', next);
    }
  }

  const auto = theme === 'system';
  const resolved = resolvedBySystem(prefersDark);

  return (
    <div className="flex items-center gap-[0.125rem] rounded-sm border border-border-subtle p-[0.125rem]">
      <button
        type="button"
        aria-pressed={auto}
        title={`Follow the operating system — currently ${resolved}`}
        onClick={() => apply('system')}
        className={cn(
          'rounded-xs px-[0.375rem] py-1 text-2xs font-semibold uppercase tracking-caps',
          'transition-colors duration-fast ease-standard',
          auto ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink',
        )}
      >
        Auto
      </button>

      <span aria-hidden="true" className="mx-[0.125rem] h-4 w-px bg-border-subtle" />

      <div role="radiogroup" aria-label="Colour theme" className="flex items-center gap-[0.125rem]">
        {PALETTES.map((p) => {
          const active = !auto && p.id === theme;
          /* Auto is on and this is where it landed. Marked, not selected — the
             reader has not chosen this palette, the machine has. */
          const isResolved = auto && p.id === resolved;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={p.hint}
              title={isResolved ? `${p.hint} — what Auto is showing now` : p.hint}
              onClick={() => apply(p.id)}
              className={cn(
                'group relative flex h-6 w-6 items-center justify-center rounded-xs',
                'transition-colors duration-fast ease-standard',
                active ? 'bg-surface-3' : 'hover:bg-surface-2',
              )}
            >
              {/*
                Half ground, half accent — deliberately not a small dot on a
                field. Dark, Linx and Carbon are all near-black grounds, so the
                ACCENT is the only thing that separates them, and at 14px an
                accent occupying a few pixels is invisible. Splitting the swatch
                gives each palette's accent half the area.
              */}
              <span
                aria-hidden="true"
                className={cn(
                  'block h-4 w-4 overflow-hidden rounded-full ring-1',
                  active ? 'ring-brand'
                    : isResolved ? 'ring-ink-muted'
                    : 'ring-border-strong group-hover:ring-ink-muted',
                )}
                style={{ background: `linear-gradient(115deg, ${p.bg} 0 46%, ${p.fg} 46% 100%)` }}
              />
              {isResolved ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-1/2 h-px w-3 -translate-x-1/2 bg-ink-muted"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Applies the stored theme BEFORE first paint. Without this the page renders in
 * the OS theme and then snaps to the chosen one — a visible flash on every
 * navigation, and the single most common way a theme toggle feels cheap.
 */
export const themeScript = `(function(){try{` +
  // ?theme=<name> forces a theme for this view and persists it. Exists
  // so a headless browser (and a human doing QA) can pin the appearance without
  // reaching into localStorage — verifying a palette should not require
  // trusting that it works.
  `var q=new URLSearchParams(location.search).get('theme');` +
  `var ok={light:1,dark:1,linx:1,carbon:1};` +
  `if(q&&ok[q]){localStorage.setItem('cfi-theme',q);}` +
  `if(q==='system'){localStorage.removeItem('cfi-theme');}` +
  `var t=localStorage.getItem('cfi-theme');` +
  `if(t&&ok[t]){document.documentElement.setAttribute('data-theme',t);}` +
  `}catch(e){}})();`;
