import { Card, CardHeader, EmptyState } from '@/components/ui';
import { Disclosure } from '@/components/ui/Disclosure';
import { Spotlight } from './Spotlight';
import { InsightCard } from './InsightCard';
import { insightHref } from '@/lib/entityLink';
import type { Insight, DatasetSnapshot } from '@/domain/types';

/**
 * The league briefing — the presentation shaped by what the competition IS.
 *
 * The same component renders very differently across the thirty-six
 * competitions here, and that is the point rather than a side effect. Sections
 * appear because the data supports them, not because the layout has a slot:
 *
 *   • A continental competition has no player data at all, so "who decides it"
 *     is absent rather than an empty heading.
 *   • A knockout has no table, so nothing here talks about position.
 *   • A season three matches old has no meaningful form, and the engine
 *     declines to invent it, so the briefing is short and says why.
 *   • A league without xG cannot produce over/underperformance stories, and
 *     the section simply is not there.
 *
 * The alternative — a fixed grid with "no data" in five boxes — tells the
 * reader the product is broken when in fact the competition is different.
 *
 * ORDER is severity, which the engine already assigns: whatever is most live
 * leads. A title race in May outranks a form run; in August it does not, and
 * nothing here needs to know that because the engine decided it.
 */

const SECTIONS: { kinds: Insight['kind'][]; title: string; blurb: string }[] = [
  {
    kinds: ['fixture'],
    title: 'Games that move the table',
    blurb: 'Ranked by what is at stake for both clubs, how close the model makes it, and how near they are to each other.',
  },
  {
    kinds: ['player'],
    title: 'Who decides them',
    blurb: 'Goal involvements per 90. Each card states the window it is drawn from — player data covers the matches detail was fetched for, not always the whole season.',
  },
  {
    kinds: ['coach'],
    title: 'From the dugout',
    blurb: 'New appointments, and sides whose results and performances have come apart.',
  },
];

export function LeagueBriefing({
  insights, snapshot, suffix,
}: {
  insights: Insight[];
  snapshot: DatasetSnapshot;
  suffix: string;
}) {
  if (!insights.length) {
    return (
      <Card>
        <EmptyState
          title="Nothing to report yet"
          description={
            snapshot.standings.length
              ? 'Too few matches played for anything here to mean much. The engine would rather say nothing than name a trend from three games.'
              : 'This competition has no table, so the storylines that depend on one do not apply.'
          }
        />
      </Card>
    );
  }

  const used = new Set<string>();
  const take = (kinds: Insight['kind'][]) => {
    const picked = insights.filter((i) => kinds.includes(i.kind));
    picked.forEach((i) => used.add(i.id));
    return picked;
  };

  const sections = SECTIONS.map((s) => ({ ...s, items: take(s.kinds) })).filter(
    (s) => s.items.length > 0,
  );
  // Everything the sections did not claim leads the page, in severity order.
  const lead = insights.filter((i) => !used.has(i.id));

  return (
    <div className="space-y-6">
      {lead.length ? (
        <Card>
          <CardHeader
            eyebrow="Storylines"
            title="What is happening"
            description="Every claim is computed from the table and the match data — none of it is written."
          />
          <div className="p-4">
            <Spotlight insights={lead} suffix={suffix} />
          </div>
        </Card>
      ) : null}

      {/*
        The supporting sections are CLOSED by default.
        
        The spotlight above is the lead and gets the page; these are the
        evidence behind it, and stacking three open grids under it was the
        difference between a briefing and a data dump. Each summary carries its
        own count and leading item, so the reader decides whether to open it
        without having to open it first.
      */}
      {sections.map((s) => (
        <Disclosure
          key={s.title}
          title={s.title}
          hint={
            <span className="flex items-center gap-2">
              <span className="figure">{s.items.length}</span>
              <span className="hidden truncate sm:inline">{s.items[0]?.title}</span>
            </span>
          }
        >
          <p className="mb-3 max-w-prose text-sm text-ink-secondary">{s.blurb}</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {s.items.map((i, n) => (
              <div
                key={i.id}
                style={{ ['--reveal-i' as string]: n }}
                className="animate-fade-up stagger"
              >
                <InsightCard insight={i} href={insightHref(i.entityType, i.entityId, suffix) ?? undefined} />
              </div>
            ))}
          </div>
        </Disclosure>
      ))}
    </div>
  );
}
