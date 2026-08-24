import { LeagueTable } from '@/components/table/LeagueTable';
import { Card, CardHeader, EmptyState, Skeleton, Badge } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';
import { resolveActive } from '@/server/active';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function TablePage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string };
}) {
  const { competition, snapshot, available, editions, edition } = resolveActive(searchParams.competition, searchParams.season);

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
            eyebrow={`${competition.country} · ${snapshot?.season.label ?? ''}`}
            title={competition.name}
            description={
              snapshot
                ? snapshot.season.isCurrent
                  ? `Matchweek ${snapshot.season.currentMatchweek ?? 0} of ${snapshot.season.totalMatchweeks ?? '—'}`
                  : `Final table · ${snapshot.season.totalMatchweeks ?? 0} matchweeks`
                : undefined
            }
            action={
              snapshot ? (
                <Badge tone={snapshot.meta.degraded ? 'warning' : 'neutral'}>
                  {snapshot.meta.degraded
                    ? 'Stale'
                    : snapshot.season.isCurrent
                      ? relativeTime(snapshot.meta.fetchedAt)
                      : 'Final'}
                </Badge>
              ) : null
            }
          />
          <div className="mt-4">
            {!snapshot ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : snapshot.standings.length === 0 ? (
              <EmptyState
                title="No table yet"
                description="This competition has not started, or its format has no league table."
              />
            ) : (
              <LeagueTable
                competition={snapshot.competition}
                standings={snapshot.standings}
                teams={snapshot.teams}
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
