'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

/**
 * Theme control. Writes `data-theme` on <html>, which the token layer keys off.
 *
 * "system" removes the attribute entirely rather than resolving it to a value —
 * that is what lets the prefers-color-scheme media query take over and keeps the
 * page following the OS if the user changes it later.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem('cfi-theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') setTheme(stored);
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

  const next: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const label = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System';

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      className="flex h-8 items-center gap-2 rounded-sm border border-border-subtle px-2 text-2xs font-semibold uppercase tracking-caps text-ink-secondary transition-colors duration-fast ease-standard hover:border-border hover:text-ink"
      aria-label={`Theme: ${label}. Switch to ${next}.`}
    >
      <span aria-hidden="true">
        {theme === 'dark' ? '◐' : theme === 'light' ? '◑' : '◒'}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * Applies the stored theme BEFORE first paint. Without this the page renders in
 * the OS theme and then snaps to the chosen one — a visible flash on every
 * navigation, and the single most common way a theme toggle feels cheap.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('cfi-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
