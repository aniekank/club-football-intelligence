import { LeagueTable } from '@/components/table/LeagueTable';
import { Card, CardHeader, EmptyState, Skeleton, Badge } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';
import { resolveActive } from '@/server/active';
import { LeagueBriefing } from '@/components/ai/LeagueBriefing';
import { generateInsights } from '@/ai/narratives';
import { predictMatch } from '@/analytics/poisson';
import { minutesFloor } from '@/server/players';
import type { Team, VenueKind } from '@/domain/types';
import { hasConferences } from '@/domain/competitions';
import { relativeTime } from '@/lib/format';
import { entitySuffix } from '@/lib/entityLink';

export const dynamic = 'force-dynamic';

export default function TablePage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string; sort?: string; dir?: string };
}) {
  const { competition, snapshot, available, editions, edition, forecast } = resolveActive(searchParams.competition, searchParams.season);
  const suffix = entitySuffix(competition.id, searchParams.season);

  /**
   * The briefing is generated per COMPETITION, which is what makes it take the
   * shape of the data: the same engine over the Championship and over the
   * Champions League produces different sections, because one has players and
   * a relegation fight and the other has neither.
   */
  const insights = snapshot
    ? generateInsights({
        snapshot,
        forecasts: forecast?.forecasts ?? [],
        predict: (home: Team, away: Team, venueKind: VenueKind) =>
          predictMatch(home, away, { venueKind }),
        minutesFloor: minutesFloor(snapshot),
      })
    : [];

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
                ? snapshot.competition.titleDecidedByPlayoff
                  // Topping this table wins a seeding, not a trophy, and the
                  // page must not imply otherwise.
                  ? `Regular season · the title is decided by play-off`
                  : snapshot.season.isCurrent
                    ? `Matchweek ${snapshot.season.currentMatchweek ?? 0} of ${snapshot.season.totalMatchweeks ?? '—'}`
                    : `Final table · ${snapshot.season.totalMatchweeks ?? 0} matchweeks`
                : undefined
            }
            action={
              snapshot ? (
                <Badge tone={snapshot.meta.degradedKind === 'stale-cache' ? 'warning' : 'neutral'}>
                  {snapshot.meta.degradedKind === 'stale-cache'
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
            ) : hasConferences(snapshot.competition) ? (
              /*
                One table per conference or group. A combined ranking would be
                wrong: a play-off place is earned against your own conference,
                and a group is won against your own group.

                `showModel={false}` is a correctness fix, not a layout choice.
                The season simulation ranks ONE global table and reports
                P(finish 1st overall). Under a partitioned table that number
                does not mean what the column label says — it read as "64% to
                win the Eastern Conference" when it was really the probability
                of topping all thirty clubs, and as a flat 0% for every club in
                a completed Club World Cup group that somebody plainly won.
                Suppressed until the simulator can rank within a group.
              */
              <div className="space-y-6">
                {(snapshot.competition.conferences ?? []).map((conference) => {
                  const rows = snapshot.standings.filter((r) => r.groupId === conference);
                  if (!rows.length) return null;
                  return (
                    <section key={conference}>
                      <h3 className="px-3 pb-2 font-display text-xl">{conference}</h3>
                      <LeagueTable
                        competition={snapshot.competition}
                        standings={rows}
                        teams={snapshot.teams}
                        suffix={suffix}
                        showModel={false}
                        sortable
                        sort={searchParams.sort}
                        dir={searchParams.dir}
                      />
                    </section>
                  );
                })}
                <p className="px-3 text-xs text-ink-muted">
                  Projections are not shown for a competition played in groups.
                  The season model ranks one combined table, so its numbers would
                  not describe the group you are looking at.
                </p>
              </div>
            ) : (
              <LeagueTable
                competition={snapshot.competition}
                standings={snapshot.standings}
                teams={snapshot.teams}
                suffix={suffix}
                sortable
                sort={searchParams.sort}
                dir={searchParams.dir}
              />
            )}
          </div>
        </Card>

        {snapshot ? (
          <LeagueBriefing insights={insights} snapshot={snapshot} suffix={suffix} />
        ) : null}
      </div>
    </AppShell>
  );
}
