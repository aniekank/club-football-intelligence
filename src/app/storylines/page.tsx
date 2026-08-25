import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, Figure, EmptyState } from '@/components/ui';
import { Disclosure } from '@/components/ui/Disclosure';
import { StoryCard } from '@/components/ai/StoryCard';
import { generateInsights } from '@/ai/narratives';
import { groupByTheme, KIND_LABEL } from '@/ai/themes';
import { narrativeContext } from '@/server/narrative';
import { resolveActive } from '@/server/active';
import { entitySuffix, insightHref } from '@/lib/entityLink';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Storylines' };

/**
 * Every story the engine has, arranged as an argument rather than a feed.
 *
 * ── The problem with a storyline grid ──────────────────────────────────────
 * The lobby used to carry six story cards at once, all the same size, all open.
 * Six equally-weighted claims read as none: there is no lead, so the reader
 * skims and takes nothing. The lobby now rotates ONE at a time, which fixed the
 * weighting and created a new gap — the other twelve stories had nowhere to
 * live.
 *
 * ── One lead, four questions ───────────────────────────────────────────────
 * This page opens with the single most consequential story at full size, then
 * folds the rest into the four things a reader is actually asking: what is
 * being decided, who is running hot or living on luck, which games move the
 * table, and who decides them. The first section is open because collapsing
 * everything is as thoughtless as showing everything.
 *
 * ── The arithmetic travels with the claim ──────────────────────────────────
 * Every card carries the numbers it was built from. These narratives are
 * assembled, not generated — the whole reason to build them deterministically
 * is that each one is checkable, and hiding the working would throw that away.
 */
export default function StorylinesPage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string };
}) {
  const { competition, snapshot, available, forecast, editions, edition } =
    resolveActive(searchParams.competition, searchParams.season);
  const suffix = entitySuffix(competition.id, searchParams.season);

  const ctx = narrativeContext(snapshot, forecast?.forecasts ?? []);
  const insights = ctx ? generateInsights(ctx) : [];
  const [lead, ...rest] = insights;
  const grouped = groupByTheme(rest);

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="eyebrow">
            {competition.name}
            {snapshot ? ` · ${snapshot.season.label}` : ''}
          </p>
          <Link
            href={`/ask${suffix}`}
            className="text-xs font-medium text-ink-secondary underline-offset-2 hover:text-ink hover:underline"
          >
            Ask a question
          </Link>
        </div>

        {!lead ? (
          <Card>
            <EmptyState
              title="No storylines yet"
              description="Nothing has been played in this competition, so there is nothing to say about it that would not be invented."
            />
          </Card>
        ) : (
          <>
            {/* The lead. Full width, its numbers at hero size, one way in. */}
            <Card className="lit-edge relative isolate overflow-hidden">
              <div className="p-6 md:p-8">
                <p className="eyebrow">{KIND_LABEL[lead.kind]}</p>
                <h1 className="mt-2 max-w-prose font-display text-4xl leading-tight sm:text-5xl">
                  {lead.title}
                </h1>
                <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-secondary">
                  {lead.body}
                </p>

                {lead.metrics.length ? (
                  <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4 border-t border-border-subtle pt-4">
                    {lead.metrics.map((m) => (
                      <span key={m.label} className="min-w-0">
                        <span className="eyebrow block">{m.label}</span>
                        <Figure className="mt-1 block font-display text-3xl leading-none">
                          {m.value}
                        </Figure>
                      </span>
                    ))}
                  </div>
                ) : null}

                <LeadLink insight={lead} suffix={suffix} />
              </div>
            </Card>

            {grouped.map(({ theme, insights: stories }, i) => (
              <Disclosure
                key={theme.id}
                title={theme.label}
                hint={`${stories.length} · ${(stories[0] as (typeof stories)[number]).title}`}
                defaultOpen={i === 0}
              >
                <p className="mb-4 max-w-prose text-sm text-ink-secondary">{theme.blurb}</p>
                <ul className="grid gap-3 md:grid-cols-2">
                  {stories.map((s) => (
                    <li key={s.id}>
                      <StoryCard insight={s} suffix={suffix} />
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ))}

            <p className="max-w-prose text-2xs leading-relaxed text-ink-muted">
              These are assembled, not written. Every sentence is built from
              numbers in the loaded season — the metrics under each story are
              the ones it was derived from — so a claim here can be checked
              rather than trusted. Nothing on this page is generated prose.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

/** Where the lead story points, when it points anywhere. */
function LeadLink({
  insight, suffix,
}: {
  insight: Parameters<typeof StoryCard>[0]['insight'];
  suffix: string;
}) {
  const href = insightHref(insight.entityType, insight.entityId, suffix);
  if (!href) return null;
  const label =
    insight.entityType === 'match' ? 'Open the match'
    : insight.entityType === 'player' ? 'Open the player'
    : 'Open the club';
  return (
    <Link
      href={href}
      className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-ink underline-offset-4 hover:underline"
    >
      {label}
      <span aria-hidden="true">→</span>
    </Link>
  );
}
