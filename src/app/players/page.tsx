import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { CoverageNote, CoverageSentence } from '@/components/players/CoverageNote';
import { Card, CardHeader, Crest, Figure, EmptyState } from '@/components/ui';
import { resolveActive } from '@/server/active';
import { leaderboard, METRIC_LABELS, PEER_MINUTES_FLOOR } from '@/server/players';
import { num, int } from '@/lib/format';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Players' };

/** The boards worth showing. Totals where volume is the point; per-90 where
 *  rate is the point and a minutes floor keeps cameos out. */
const BOARDS: { metric: string; per90?: boolean; title: string; digits: number }[] = [
  { metric: 'goals', title: 'Goals', digits: 0 },
  { metric: 'assists', title: 'Assists', digits: 0 },
  { metric: 'xG', title: 'Expected goals', digits: 2 },
  { metric: 'xA', title: 'Expected assists', digits: 2 },
  { metric: 'keyPasses', title: 'Chances created', digits: 0 },
  { metric: 'xG', per90: true, title: 'xG per 90', digits: 2 },
  { metric: 'tackles', per90: true, title: 'Tackles per 90', digits: 2 },
  { metric: 'ballRecoveries', per90: true, title: 'Recoveries per 90', digits: 2 },
];

export default function PlayersPage({
  searchParams,
}: {
  searchParams: { competition?: string };
}) {
  const { competition, snapshot, available } = resolveActive(searchParams.competition);
  const coverage = snapshot?.meta.playerStatsCoverage;
  const hasPlayers = Boolean(snapshot?.meta.capabilities.hasPlayerStats);

  return (
    <AppShell competitions={available} activeId={competition.id}>
      <div className="mx-auto max-w-container space-y-6 px-4 py-6">
        <header className="max-w-prose">
          <p className="eyebrow">{competition.name}</p>
          <h1 className="mt-1 text-3xl">Players</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CoverageNote coverage={coverage} />
          </div>
          <div className="mt-2">
            <CoverageSentence coverage={coverage} />
          </div>
        </header>

        {!snapshot ? (
          <EmptyState title="Loading" />
        ) : !hasPlayers ? (
          // Capability-gated: a source without player data hides these boards
          // rather than rendering a page of zeroes.
          <Card>
            <EmptyState
              title="No player data for this competition"
              description="The active source does not supply per-player statistics here."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {BOARDS.map((b) => {
              const rows = leaderboard(snapshot, b.metric, { per90: b.per90, limit: 10 });
              if (!rows.length) return null;
              const max = rows[0]?.value ?? 1;
              return (
                <Card key={`${b.metric}-${b.per90 ? 'p90' : 'tot'}`}>
                  <CardHeader
                    eyebrow={b.per90 ? `per 90 · ${PEER_MINUTES_FLOOR}+ minutes` : 'total'}
                    title={b.title}
                  />
                  <ol className="p-3">
                    {rows.map((r, i) => (
                      <li key={r.player.id}>
                        <Link
                          href={`/players/${r.player.id}?competition=${competition.id}`}
                          className={cn(
                            'group grid grid-cols-[1.25rem_1fr_auto] items-center gap-2 rounded-sm px-1 py-1.5',
                            'transition-colors duration-fast ease-standard hover:bg-surface-2',
                          )}
                        >
                          <Figure tone="muted" className="text-2xs">{i + 1}</Figure>
                          <span className="flex min-w-0 items-center gap-2">
                            <Crest
                              url={r.team?.crestUrl ?? null}
                              code={r.team?.code ?? '?'}
                              name={r.team?.name ?? ''}
                              size={14}
                            />
                            <span className="truncate text-sm">{r.player.name}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            {/* A bar relative to the leader: makes the shape of
                                the board readable without reading ten numbers. */}
                            <span
                              aria-hidden="true"
                              className="hidden h-1 w-12 overflow-hidden rounded-full bg-surface-inset sm:block"
                            >
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${(r.value / max) * 100}%`, background: 'var(--seq-500)' }}
                              />
                            </span>
                            <Figure className="w-10 text-right text-xs font-semibold">
                              {num(r.value, b.digits)}
                            </Figure>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
