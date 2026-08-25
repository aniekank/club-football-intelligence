import Link from 'next/link';
import { Figure } from '@/components/ui';
import { KIND_LABEL } from '@/ai/themes';
import type { Insight } from '@/domain/types';

/**
 * The way through to the storylines, from a page that is about something else.
 *
 * ── Why this replaced a briefing ───────────────────────────────────────────
 * The table page carried the whole narrative engine: a rotating spotlight plus
 * three grouped sections, with its own private grouping of the insight kinds.
 * That was a second storylines surface with a second opinion about how stories
 * are grouped — exactly the drift the theme map exists to prevent — sitting
 * underneath a page whose subject is the table.
 *
 * A page should be about one thing and say where the others are. This states
 * the count and the leading story, which is enough to decide, and hands the
 * subject to the page that owns it.
 */
export function StorylinesDoor({
  insights, href,
}: {
  insights: Insight[];
  href: string;
}) {
  const lead = insights[0];
  if (!lead) return null;

  return (
    <Link
      href={href}
      className="lit-edge group flex items-center gap-4 rounded-lg border border-border-subtle bg-surface-1 p-4 transition-[transform,border-color,box-shadow] duration-normal ease-standard hover:-translate-y-px hover:border-border hover:shadow-md"
    >
      <span className="min-w-0 flex-1">
        <span className="eyebrow flex items-center gap-2">
          Storylines
          <Figure tone="muted">{insights.length}</Figure>
        </span>
        <span className="mt-1 block truncate font-display text-lg leading-tight">
          {lead.title}
        </span>
        <span className="mt-1 block text-sm text-ink-secondary">
          {KIND_LABEL[lead.kind]} — and {insights.length - 1} more, grouped by what
          they decide.
        </span>
      </span>
      <span
        aria-hidden="true"
        className="shrink-0 text-ink-muted transition-transform duration-normal ease-standard group-hover:translate-x-1"
      >
        →
      </span>
    </Link>
  );
}
