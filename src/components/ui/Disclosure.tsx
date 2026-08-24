import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A section the reader opens, rather than one the page forces on them.
 *
 * ── Why native `<details>` ─────────────────────────────────────────────────
 * It works with JavaScript disabled, it is keyboard-operable and announced
 * correctly without a single ARIA attribute, and browsers give it
 * find-in-page-opens-the-section for free. Every hand-rolled accordion in this
 * product would have to re-earn all four, and most re-earn none.
 *
 * ── The summary has to carry information ───────────────────────────────────
 * A collapsed section that says only "Key players" makes the reader open it to
 * find out whether it is worth opening — which is not progressive disclosure,
 * it is a guessing game with extra clicks. Every summary here takes a `hint`:
 * the count, the leading item, the headline number. Enough to decide.
 *
 * ── Open by default is a real decision ─────────────────────────────────────
 * `defaultOpen` exists because "collapse everything" is as thoughtless as
 * "show everything". The single most important section on a page should be
 * open; the supporting evidence behind it should not be.
 */
export function Disclosure({
  title, hint, children, defaultOpen = false, className,
}: {
  title: ReactNode;
  /** What is inside — a count, a leader, a number. Shown while collapsed. */
  hint?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        'group lit-edge rounded-lg border border-border-subtle bg-surface-1',
        className,
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3',
          'transition-colors duration-fast ease-standard hover:bg-surface-2',
          // Safari renders a disclosure triangle unless this is removed too.
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-border-subtle text-ink-muted',
            'transition-transform duration-normal ease-standard group-open:rotate-90',
          )}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
            <path d="M4.5 2.5 L8 6 L4.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-display text-base leading-tight">{title}</span>
        </span>

        {hint ? (
          <span className="shrink-0 text-2xs text-ink-muted group-open:hidden">{hint}</span>
        ) : null}
      </summary>

      {/* The content fades up on open. Collapsed content is not in the layout at
          all, so there is no height to animate — the fade is what stops it
          appearing as an abrupt jump. */}
      <div className="animate-fade-up border-t border-border-subtle p-4">{children}</div>
    </details>
  );
}
