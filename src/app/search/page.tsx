import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, EmptyState, Crest, Badge } from '@/components/ui';
import { resolveActive } from '@/server/active';
import { search } from '@/ai/resolver';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Search' };

export default function SearchPage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string; q?: string };
}) {
  const { competition, snapshot, available, editions, edition } =
    resolveActive(searchParams.competition, searchParams.season);
  const query = (searchParams.q ?? '').trim();
  const seasonParam = searchParams.season ?? '';

  const hits = snapshot && query
    ? search(snapshot, query, competition.id, seasonParam)
    : [];

  const teamById = new Map((snapshot?.teams ?? []).map((t) => [t.id, t]));

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <header>
          <p className="eyebrow">{competition.name} · {snapshot?.season.label ?? ''}</p>
          <h1 className="mt-1 text-3xl">Search</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Clubs, players and competitions in this edition. Typos are fine.
          </p>
        </header>

        <form action="/search" method="get" className="flex gap-2">
          <input type="hidden" name="competition" value={competition.id} />
          {seasonParam ? <input type="hidden" name="season" value={seasonParam} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Leicster, Mahrez, MCI…"
            aria-label="Search clubs and players"
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-4 py-3 text-base placeholder:text-ink-muted focus-visible:shadow-focus"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-brand-ink transition-colors duration-fast ease-standard hover:bg-brand-hover"
          >
            Search
          </button>
        </form>

        {!query ? null : !snapshot ? (
          <EmptyState title="Loading data" />
        ) : hits.length === 0 ? (
          <Card>
            <EmptyState
              title={`Nothing matching "${query}"`}
              description="This searches the active edition only — a player from another season or competition will not appear here."
            />
          </Card>
        ) : (
          <Card>
            <ul>
              {hits.map((h) => {
                const team = h.kind === 'player' ? undefined : teamById.get(h.id);
                return (
                  <li key={`${h.kind}-${h.id}`} className="border-b border-border-subtle/60 last:border-0">
                    <Link
                      href={h.href}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3',
                        'transition-colors duration-fast ease-standard hover:bg-surface-2',
                      )}
                    >
                      {h.kind === 'team' && team ? (
                        <Crest url={team.crestUrl} code={team.code} name={team.name} size={24} />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs bg-surface-2 text-2xs text-ink-muted"
                        >
                          {h.kind === 'player' ? '#' : '◆'}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{h.label}</span>
                        <span className="block truncate text-xs text-ink-muted">{h.sublabel}</span>
                      </span>
                      <Badge tone="neutral">{h.kind}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
