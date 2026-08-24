import { cn } from '@/lib/cn';

/**
 * The masthead lockup: the house above, the product below.
 *
 * "Club Football" in the display serif and "INTELLIGENCE" in mono is the
 * editorial/terminal pairing the whole product is built on, stated once at the
 * top of every page. Above it sits the house name.
 *
 * ── Why the parent line is so quiet ────────────────────────────────────────
 * A parent brand over a product is an ENDORSEMENT, not a competitor: it should
 * be read second and never fight the name of the thing you actually opened.
 * So it takes the smallest type in the system, wide letterspacing, and muted
 * ink — the visual register of a publisher's imprint rather than a logo.
 *
 * ── The rule is doing real work ────────────────────────────────────────────
 * A hairline running from the house name to the right edge of the wordmark is
 * the oldest masthead device there is, and it earns its place twice here. It
 * ties the two lines into one object rather than two stacked labels, and it
 * measures itself against the wordmark below — the flex child stretches to the
 * lockup's own width — so the whole mark reads as deliberately set rather than
 * as a line of text that happens to sit above another.
 *
 * The leading between the lines is deliberately tight for the same reason. Give
 * them room and they become two things.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex flex-col items-stretch gap-[0.2rem]', className)}>
      <span className="flex items-center gap-2">
        <span className="whitespace-nowrap text-[0.5625rem] font-semibold uppercase leading-none tracking-[0.2em] text-ink-muted">
          Task Enterprises
        </span>
        {/* Fades out rather than stopping. A flat hairline against a near-black
            header is either invisible or a hard bar; a gradient reads as a rule
            at the name and dissolves before it reaches the edge, which is what
            keeps it a flourish instead of a divider. */}
        <span
          aria-hidden="true"
          className="h-px min-w-[1rem] flex-1"
          style={{
            background: 'linear-gradient(90deg, var(--border-strong) 0%, transparent 100%)',
          }}
        />
      </span>

      <span className="inline-flex items-baseline gap-2">
        <span className="font-display text-lg font-semibold leading-none tracking-tight">
          Club Football
        </span>
        <span className="figure text-2xs font-semibold uppercase tracking-caps text-brand">
          Intelligence
        </span>
      </span>
    </span>
  );
}
