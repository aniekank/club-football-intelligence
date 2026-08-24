'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

type Theme = 'system' | 'dark' | 'light' | 'linx' | 'carbon';

/**
 * Swatch colours live HERE, as data, not as CSS classes.
 *
 * The first attempt put them in `.swatch-{id}` rules and applied them with a
 * template literal — `swatch-${t.id}`. Tailwind's content scanner only ever
 * sees literal strings, so it never found those class names and tree-shook
 * every rule out of the build. The custom properties resolved to nothing and
 * all five swatches rendered as empty rings: no error, no warning, just blank.
 *
 * These necessarily MIRROR tokens.css — only one theme's properties are live at
 * a time, so five simultaneous previews cannot be read from the cascade. Keep
 * them in step with each block's `--surface-canvas` and `--brand`.
 */
const THEMES: { id: Theme; label: string; hint: string; bg: string; fg: string }[] = [
  // System is the one swatch whose halves are two GROUNDS rather than
  // ground-and-accent, because that is honestly what it is: whichever the OS says.
  { id: 'system', label: 'System', hint: 'Follow the operating system', bg: '#0a0d12', fg: '#f4f4f1' },
  { id: 'dark', label: 'Dark', hint: 'Dark', bg: '#0a0d12', fg: '#c8f751' },
  { id: 'light', label: 'Light', hint: 'Light', bg: '#f4f4f1', fg: '#6f9410' },
  { id: 'linx', label: 'Linx', hint: 'Linx — warm red and gold', bg: '#140708', fg: '#f0a52a' },
  { id: 'carbon', label: 'Carbon', hint: 'Carbon — red, black and shield yellow', bg: '#0a0a0b', fg: '#e2231a' },
];

/**
 * Theme control. Writes `data-theme` on <html>, which the token layer keys off.
 *
 * ── Why this is a row of swatches and not a cycling button ─────────────────
 * It used to be one button showing the CURRENT theme, which meant every other
 * option was invisible: reaching a third palette took three blind clicks, and
 * nothing on screen suggested it existed. A control that hides its own options
 * is not a control, it is a guess.
 *
 * Each swatch previews the theme it selects — its real canvas colour with its
 * real accent — so the choice is made by looking rather than by trying. "System"
 * is drawn split, because that is honestly what it is: whichever the OS says.
 *
 * "system" removes the attribute entirely rather than resolving it to a value —
 * that is what lets the prefers-color-scheme media query take over and keeps the
 * page following the OS if the reader changes it later. The other three are
 * explicit, stored, and never inferred.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem('cfi-theme') as Theme | null;
    if (stored && stored !== 'system' && THEMES.some((t) => t.id === stored)) setTheme(stored);
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

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-[0.125rem] rounded-sm border border-border-subtle p-[0.125rem]"
    >
      {THEMES.map((t) => {
        const active = t.id === theme;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t.hint}
            title={t.hint}
            onClick={() => apply(t.id)}
            className={cn(
              'group relative flex h-6 w-6 items-center justify-center rounded-xs',
              'transition-colors duration-fast ease-standard',
              active ? 'bg-surface-3' : 'hover:bg-surface-2',
            )}
          >
            {/*
              Half ground, half accent — deliberately not a small dot on a
              field. Dark and Linx are both near-black grounds, so the ACCENT is
              the only thing that separates them (lime against gold), and at
              14px an accent occupying a few pixels is invisible. Splitting the
              swatch gives each theme's accent half the area.
            */}
            <span
              aria-hidden="true"
              className={cn(
                'block h-4 w-4 overflow-hidden rounded-full ring-1',
                active ? 'ring-brand' : 'ring-border-strong group-hover:ring-ink-muted',
              )}
              style={{
                background: `linear-gradient(115deg, ${t.bg} 0 46%, ${t.fg} 46% 100%)`,
              }}
            />
          </button>
        );
      })}
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
  `var t=localStorage.getItem('cfi-theme');` +
  `if(t&&ok[t]){document.documentElement.setAttribute('data-theme',t);}` +
  `}catch(e){}})();`;
