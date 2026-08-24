import { AppShell } from '@/components/layout/AppShell';
import { MatchCard } from '@/components/match/MatchCard';
import { Card, CardHeader, EmptyState, Skeleton, Badge } from '@/components/ui';
import { resolveActive } from '@/server/active';
import { dayKey, formatDate } from '@/lib/format';
import type { Match } from '@/domain/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fixtures' };

export default function FixturesPage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string; view?: string };
}) {
  const { competition, snapshot, available, editions, edition } = resolveActive(searchParams.competition, searchParams.season);
  const showResults = searchParams.view === 'results';

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container px-4 py-6">
        <Card>
          <CardHeader
            eyebrow={snapshot?.season.label ?? ''}
            title={`${competition.name} ${showResults ? 'results' : 'fixtures'}`}
            action={
              <div className="flex gap-1">
                <Toggle href={`/fixtures?competition=${competition.id}`} active={!showResults}>
                  Fixtures
                </Toggle>
                <Toggle href={`/fixtures?competition=${competition.id}&view=results`} active={showResults}>
                  Results
                </Toggle>
              </div>
            }
          />
          <div className="p-4">
            {!snapshot ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : (
              <FixtureList snapshot={snapshot} showResults={showResults} />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Toggle({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={
        active
          ? 'rounded-sm bg-surface-3 px-3 py-1 text-xs font-semibold text-ink'
          : 'rounded-sm px-3 py-1 text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink'
      }
    >
      {children}
    </a>
  );
}

function FixtureList({
  snapshot, showResults,
}: {
  snapshot: NonNullable<ReturnType<typeof resolveActive>['snapshot']>;
  showResults: boolean;
}) {
  const relevant = snapshot.matches
    .filter((m) => (showResults ? m.status === 'FINISHED' : m.status !== 'FINISHED'))
    .sort((a, b) =>
      // Results read newest-first; fixtures read soonest-first.
      showResults ? b.kickoff.localeCompare(a.kickoff) : a.kickoff.localeCompare(b.kickoff),
    );

  if (!relevant.length) {
    return <EmptyState title={showResults ? 'No results yet' : 'No scheduled fixtures'} />;
  }

  const byDay = new Map<string, Match[]>();
  for (const m of relevant.slice(0, 120)) {
    const key = dayKey(m.kickoff);
    byDay.set(key, [...(byDay.get(key) ?? []), m]);
  }

  return (
    <div className="space-y-5">
      {[...byDay].map(([day, matches]) => (
        <section key={day}>
          <h3 className="eyebrow mb-2 flex items-center gap-2">
            {formatDate(day)}
            {matches[0]?.matchweek !== null && matches[0]?.matchweek !== undefined ? (
              <Badge tone="neutral">{matches[0].roundLabel}</Badge>
            ) : null}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
  );
}
