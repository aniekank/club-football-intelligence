import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { MatchCard } from '@/components/match/MatchCard';
import { LeagueTable } from '@/components/table/LeagueTable';
import { SeasonProjection } from '@/components/charts/SeasonProjection';
import { Card, CardHeader, Skeleton, EmptyState, Badge, StatTile, Figure } from '@/components/ui';
import { resolveActive, liveAcrossCompetitions } from '@/server/active';
import { formatDate, dayKey, pct, relativeTime, num } from '@/lib/format';
import type { Match } from '@/domain/types';

export const dynamic = 'force-dynamic';

export default function HomePage({
  searchParams,
}: {
  searchParams: { competition?: string };
}) {
  const { competition, snapshot, available, forecast } = resolveActive(searchParams.competition);
  const live = liveAcrossCompetitions();

  return (
    <AppShell competitions={available} activeId={competition.id}>
      <div className="mx-auto max-w-container px-4 py-6">
        {snapshot?.meta.degraded ? (
          <div className="mb-4 rounded-md border border-status-warning/30 bg-status-warning-faint px-4 py-3 text-sm">
            <p className="font-semibold text-status-warning">Showing cached data</p>
            <p className="mt-px text-ink-secondary">{snapshot.meta.degradedReason}</p>
          </div>
        ) : null}

        {/* Live across every loaded competition — a club plays in several at
            once, so this deliberately is not scoped to the active one. */}
        {live.length > 0 ? (
          <section className="mb-6">
            <h2 className="eyebrow mb-2">Live now</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {live.slice(0, 6).map(({ match, snapshot: snap }) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  home={snap.teams.find((t) => t.id === match.homeTeamId)}
                  away={snap.teams.find((t) => t.id === match.awayTeamId)}
                  showCompetition
                  competitionName={snap.competition.name}
                  href={`/matches/${match.id}?competition=${snap.competition.id}`}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!snapshot ? (
          <LoadingState />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="min-w-0 space-y-6">
              <FixtureFeed snapshot={snapshot} />
            </div>

            <aside className="space-y-6">
              <Card>
                <CardHeader
                  eyebrow="Season"
                  title={competition.name}
                  action={
                    <Badge tone={snapshot.meta.degraded ? 'warning' : 'neutral'}>
                      {relativeTime(snapshot.meta.fetchedAt)}
                    </Badge>
                  }
                />
                <div className="grid grid-cols-2 gap-2 p-4">
                  <StatTile
                    label="Matchweek"
                    value={
                      <>
                        {snapshot.season.currentMatchweek ?? 0}
                        <span className="text-ink-muted">/{snapshot.season.totalMatchweeks ?? '—'}</span>
                      </>
                    }
                  />
                  <StatTile
                    label="Played"
                    value={snapshot.matches.filter((m) => m.status === 'FINISHED').length}
                    sub={`of ${snapshot.matches.length}`}
                  />
                </div>
              </Card>

              {forecast && forecast.remainingFixtures > 0 ? (
                <Card>
                  <CardHeader
                    eyebrow={`${forecast.runs.toLocaleString()} simulated seasons`}
                    title="Projected finish"
                    description="Where the model expects each club to end up, and how wide the range is."
                  />
                  <div className="p-4">
                    <SeasonProjection
                      forecasts={forecast.forecasts}
                      teams={snapshot.teams}
                      limit={8}
                    />
                  </div>
                </Card>
              ) : null}

              <Card>
                <CardHeader eyebrow="Standings" title="Table" action={
                  <Link
                    href={`/table?competition=${competition.id}`}
                    className="text-xs font-medium text-ink-secondary underline-offset-2 hover:text-ink hover:underline"
                  >
                    Full table
                  </Link>
                } />
                <div className="mt-3">
                  <CompactTable snapshot={snapshot} />
                </div>
              </Card>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/** Fixtures grouped by day: recent results first, then what is coming. */
function FixtureFeed({ snapshot }: { snapshot: NonNullable<ReturnType<typeof resolveActive>['snapshot']> }) {
  const now = Date.now();
  const relevant = snapshot.matches
    .filter((m) => {
      const t = Date.parse(m.kickoff);
      return t > now - 8 * 86_400_000 && t < now + 14 * 86_400_000;
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  if (!relevant.length) {
    return (
      <Card>
        <CardHeader eyebrow="Fixtures" title="Nothing scheduled" />
        <EmptyState
          title="No fixtures in this window"
          description="This competition has no matches in the last week or the next fortnight."
        />
      </Card>
    );
  }

  const byDay = new Map<string, Match[]>();
  for (const m of relevant) {
    const key = dayKey(m.kickoff);
    byDay.set(key, [...(byDay.get(key) ?? []), m]);
  }

  return (
    <Card>
      <CardHeader
        eyebrow="Fixtures & results"
        title={snapshot.competition.name}
        description="The last week and the fortnight ahead."
      />
      <div className="space-y-5 p-4">
        {[...byDay].map(([day, matches]) => (
          <section key={day}>
            <h3 className="eyebrow mb-2">{formatDate(day)}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {matches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  home={snapshot.teams.find((t) => t.id === m.homeTeamId)}
                  away={snapshot.teams.find((t) => t.id === m.awayTeamId)}
                  href={`/matches/${m.id}?competition=${snapshot.competition.id}`}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}

function CompactTable({ snapshot }: { snapshot: NonNullable<ReturnType<typeof resolveActive>['snapshot']> }) {
  if (!snapshot.standings.length) {
    return <EmptyState title="No table for this format" />;
  }
  return (
    <LeagueTable
      competition={snapshot.competition}
      standings={snapshot.standings.slice(0, 8)}
      teams={snapshot.teams}
      compact
    />
  );
}

function LoadingState() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
