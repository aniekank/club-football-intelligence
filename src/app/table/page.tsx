import { LeagueTable } from '@/components/table/LeagueTable';
import Link from 'next/link';
import { Card, CardHeader, EmptyState, Skeleton, Badge } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';
import { resolveActive, liveAcrossCompetitions } from '@/server/active';
import { StorylinesDoor } from '@/components/ai/StorylinesDoor';
import { Coverage } from '@/components/data/Coverage';
import { BumpChart } from '@/components/charts/BumpChart';
import { buildProgression, mostMoved } from '@/analytics/progression';
import { Disclosure } from '@/components/ui/Disclosure';
import { generateInsights, generateBriefing } from '@/ai/narratives';
import { narrativeContext } from '@/server/narrative';
import { hasConferences } from '@/domain/competitions';
import { relativeTime } from '@/lib/format';
import { entitySuffix } from '@/lib/entityLink';

export const dynamic = 'force-dynamic';

export default function TablePage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string; sort?: string; dir?: string; cols?: string };
}) {
  const { competition, snapshot, available, editions, edition, forecast } = resolveActive(searchParams.competition, searchParams.season);
  const suffix = entitySuffix(competition.id, searchParams.season);

  /**
   * Table depth lives in the URL, not in component state.
   *
   * It survives a reload, it is shareable — "here is the full breakdown" is a
   * link — and it works with JavaScript off, which a client-side toggle would
   * not. The default is `essential`: a fifteen-column table is a data dump, and
   * the reader who wants the breakdown can say so in one click.
   */
  const detail = searchParams.cols === 'full' ? 'full' as const : 'essential' as const;
  const depthHref = (next: 'essential' | 'full') => {
    const q = new URLSearchParams();
    q.set('competition', competition.id);
    if (searchParams.season) q.set('season', searchParams.season);
    if (searchParams.sort) q.set('sort', searchParams.sort);
    if (searchParams.dir) q.set('dir', searchParams.dir);
    if (next === 'full') q.set('cols', 'full');
    return `/table?${q.toString()}`;
  };

  /**
   * The briefing is generated per COMPETITION, which is what makes it take the
   * shape of the data: the same engine over the Championship and over the
   * Champions League produces different sections, because one has players and
   * a relegation fight and the other has neither.
   */
  /**
   * Position history, recomputed per matchweek.
   *
   * No feed publishes one, so it is rebuilt by running the standings engine
   * over a growing prefix of the season — which also means the history obeys
   * THIS competition's tiebreakers rather than a vendor's.
   */
  const progression = snapshot ? buildProgression(snapshot) : null;
  const movers = progression ? mostMoved(progression, 3) : [];

  /**
   * One context, built by the shared function.
   *
   * This page was the third place assembling the narrative engine's input by
   * hand. The engine takes its model as an argument rather than importing one
   * precisely so a fixture named on one page and the same fixture opened on
   * another cannot disagree — and that buys nothing if the argument is built
   * three times.
   */
  const narrativeCtx = narrativeContext(snapshot, forecast?.forecasts ?? []);
  const insights = narrativeCtx ? generateInsights(narrativeCtx) : [];

  /**
   * The briefing moved here from the home page.
   *
   * It is a sentence about ONE competition — "Brighton lead the Premier League
   * after 1, level with Arsenal" — and it was sitting on a screen whose job is
   * football everywhere. This is that competition's page; it is the first thing
   * the sentence should be next to.
   */
  const live = liveAcrossCompetitions();
  const liveElsewhere = Object.entries(
    live.reduce<Record<string, number>>((acc, l) => {
      const name = l.snapshot.competition.name;
      if (name !== competition.name) acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([competitionName, count]) => ({ competitionName, count }));
  const briefing = narrativeCtx ? generateBriefing(narrativeCtx, liveElsewhere) : null;

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container px-4 py-6">
        {briefing ? (
          <Card className="mb-6">
            <div className="p-5">
              <p className="eyebrow">Where it stands</p>
              <h2 className="mt-1 font-display text-2xl leading-tight">{briefing.headline}</h2>
              <p className="mt-2 max-w-prose text-ink-secondary">{briefing.body}</p>
              {briefing.bullets.length ? (
                <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                  {briefing.bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-sm text-ink-secondary">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-comp" />
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        ) : null}

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
                <span className="flex items-center gap-2">
                  {/* A link, not a button: the depth is in the URL, so this
                      works with JavaScript off and can be shared as-is. */}
                  <Link
                    href={depthHref(detail === 'full' ? 'essential' : 'full')}
                    className="rounded-sm border border-border-subtle px-2 py-1 text-2xs font-semibold uppercase tracking-caps text-ink-muted transition-colors duration-fast ease-standard hover:border-border hover:text-ink"
                  >
                    {detail === 'full' ? 'Fewer columns' : 'Full breakdown'}
                  </Link>
                <Badge tone={snapshot.meta.degradedKind === 'stale-cache' ? 'warning' : 'neutral'}>
                  {snapshot.meta.degradedKind === 'stale-cache'
                    ? 'Stale'
                    : snapshot.season.isCurrent
                      ? relativeTime(snapshot.meta.fetchedAt)
                      : 'Final'}
                </Badge>
                </span>
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
                        detail={detail}
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
                detail={detail}
                sort={searchParams.sort}
                dir={searchParams.dir}
              />
            )}
          </div>
        </Card>

        {progression ? (
          <Disclosure
            title="How the season has moved"
            hint={
              movers.length
                ? `${movers[0]!.shortName} ${movers[0]!.movement > 0 ? '+' : ''}${movers[0]!.movement}`
                : `${progression.matchweeks.length} matchweeks`
            }
            defaultOpen={progression.matchweeks.length >= 6}
          >
            <BumpChart progression={progression} />
          </Disclosure>
        ) : null}

        {snapshot ? (
          <StorylinesDoor insights={insights} href={`/storylines${suffix}`} />
        ) : null}

        {snapshot ? (
          <Disclosure
            title="What this competition carries"
            hint={`${
              Object.entries(snapshot.meta.capabilities)
                .filter(([k, v]) => k.startsWith('has') && v === true).length
            } of 9 data types`}
          >
            <Coverage meta={snapshot.meta} />
          </Disclosure>
        ) : null}
      </div>
    </AppShell>
  );
}
