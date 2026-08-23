import { cn } from '@/lib/cn';

/**
 * The wordmark. Display serif for "Club Football", mono for "INTELLIGENCE" —
 * the editorial/terminal pairing the whole product is built on, stated once at
 * the top of every page.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className="font-display text-lg font-semibold leading-none tracking-tight">
        Club Football
      </span>
      <span className="figure text-2xs font-semibold uppercase tracking-caps text-brand">
        Intelligence
      </span>
    </span>
  );
}
