import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { MatchCard } from '@/components/match/MatchCard';
import { LeagueTable } from '@/components/table/LeagueTable';
import { SeasonShotMap } from '@/components/charts/SeasonShotMap';
import { EmbossedCrest } from '@/components/team/EmbossedCrest';
import {
  Card, CardHeader, Crest, Figure, StatTile, FormRun, Badge, EmptyState, EstimateMark,
} from '@/components/ui';
import { resolveActive } from '@/server/active';
import { teamAcrossCompetitions } from '@/server/teams';
import { pct, num, signed, int, ordinal } from '@/lib/format';
import { zoneForRank } from '@/domain/competitions';
import { entitySuffix } from '@/lib/entityLink';

export const dynamic = 'force-dynamic';

export default function TeamPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { competition?: string; season?: string };
}) {
  const { competition, snapshot, available, forecast, editions, edition } = resolveActive(searchParams.competition, searchParams.season);
  const suffix = entitySuffix(competition.id, searchParams.season);
  const team = snapshot?.teams.find((t) => t.id === params.id);
  if (snapshot && !team) notFound();

  const standing = snapshot?.standings.find((r) => r.teamId === params.id);
  const teamForecast = forecast?.forecasts.find((f) => f.teamId === params.id);

  // The club-football difference: a team plays several competitions at once, so
  // the page is a fusion of them rather than a view of one.
  const elsewhere = team ? teamAcrossCompetitions(team, competition.id) : [];

  const matches = snapshot?.matches
    .filter((m) => m.homeTeamId === params.id || m.awayTeamId === params.id)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff)) ?? [];
  const played = matches.filter((m) => m.status === 'FINISHED');
  const upcoming = matches.filter((m) => m.status === 'SCHEDULED').slice(0, 5);
  const recent = played.slice(-5).reverse();

  const zone = standing ? zoneForRank(competition, standing.rank) : null;
  const shots = snapshot
    ? snapshot.matches.flatMap((m) => m.shots.filter((sh) => sh.teamId === params.id))
    : [];

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container space-y-6 px-4 py-6">
        {!snapshot || !team ? (
          <EmptyState title="Loading club" />
        ) : (
          <>
            {/*
              The club hero.

              `isolate` + `overflow-hidden` are load-bearing: the embossed mark
              is deliberately larger than the card and bleeds off its right
              edge, which is what makes it read as a surface the card was cut
              from rather than a picture placed inside it.
            */}
            <Card className="relative isolate overflow-hidden">
              {team.primaryColor ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-20"
                  style={{
                    background: `linear-gradient(105deg, ${team.primaryColor}2e 0%, transparent 58%)`,
                  }}
                />
              ) : null}
              {/*
                Pushed mostly off the card and kept quiet. At full strength it
                sat behind the position readout and won — the relief is meant to
                be the texture of the surface, not a second subject competing
                with the number the reader came for.

                `right-[-5rem]` is an arbitrary value on purpose: this design
                system REPLACES Tailwind's spacing scale with a deliberate 8pt
                set of 0-10, so `-right-24` is not a class here. It compiles to
                nothing, and an absolutely-positioned element with no inset
                falls back to its static position — which put the mark in the
                top-left corner rather than off the right edge.
              */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-[-5rem] top-1/2 -z-10 -translate-y-1/2"
              >
                <EmbossedCrest url={team.crestUrl} size={280} opacity={0.28} />
              </span>
              <div className="relative flex flex-wrap items-center gap-4 p-5">
                <Crest url={team.crestUrl} code={team.code} name={team.name} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">
                    {team.country} · {competition.name}
                  </p>
                  <h1 className="mt-1 truncate font-display text-3xl leading-tight">
                    {team.name}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span className="figure">{team.code}</span>
                    {team.venue ? <span>· {team.venue}</span> : null}
                    {team.manager ? <span>· {team.manager.name}</span> : null}
                  </div>
                </div>
                {standing ? (
                  <div className="text-right">
                    <p className="eyebrow">Position</p>
                    <p className="figure text-4xl font-bold leading-none">{standing.rank}</p>
                    {zone ? (
                      <Badge
                        tone={
                          zone.kind === 'relegation' || zone.kind === 'eliminated'
                            ? 'critical'
                            : zone.kind === 'champion'
                            ? 'brand'
                            : 'info'
                        }
                        className="mt-2"
                      >
                        {zone.shortLabel}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* A club plays its league, a cup and Europe in the same week. This
                  strip is the club-football feature the tournament chassis had no
                  concept of. */}
              {elsewhere.length ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-5 py-3">
                  <span className="eyebrow">Also in</span>
                  {elsewhere.map((e) => (
                    <Link
                      key={e.competition.id}
                      // Deliberately WITHOUT the season suffix: this crosses into
                      // another competition, where the current season's key is
                      // meaningless. Its live edition is the right destination.
                      href={`/teams/${team.id}?competition=${e.competition.id}`}
                      style={{ ['--comp-active' as string]: `var(--comp-${e.competition.accentKey})` }}
                      className="inline-flex items-center gap-2 rounded-sm border border-border-subtle px-2 py-1 text-xs transition-colors duration-fast ease-standard hover:border-border hover:bg-surface-2"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full"
                        style={{ background: 'var(--comp-active)' }}
                      />
                      {e.competition.shortName}
                      {e.rank ? (
                        <Figure tone="muted" className="text-2xs">{ordinal(e.rank)}</Figure>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : null}
            </Card>

            {standing ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                <StatTile label="Played" value={int(standing.played)} />
                <StatTile label="Points" value={int(standing.points)} sub={`${standing.won}W ${standing.drawn}D ${standing.lost}L`} />
                <StatTile
                  label="Goal difference"
                  value={signed(standing.goalDifference)}
                  sub={`${standing.goalsFor} scored, ${standing.goalsAgainst} against`}
                  tone={standing.goalDifference > 0 ? 'positive' : standing.goalDifference < 0 ? 'negative' : 'default'}
                />
                {standing.xGFor !== null ? (
                  <StatTile
                    label="Expected goals"
                    value={num(standing.xGFor, 1)}
                    sub={`${num(standing.xGAgainst, 1)} against`}
                  />
                ) : null}
                {standing.expectedPoints !== null ? (
                  <StatTile
                    label="Points vs expected"
                    value={signed(standing.points - standing.expectedPoints, 1)}
                    sub={`${num(standing.expectedPoints, 1)} expected`}
                    tone={standing.points >= standing.expectedPoints ? 'positive' : 'negative'}
                    estimate
                  />
                ) : null}
                <div className="rounded-md border border-border-subtle bg-surface-1 px-3 py-3">
                  <p className="eyebrow">Form</p>
                  <div className="mt-2"><FormRun form={standing.form} /></div>
                </div>
              </div>
            ) : null}

            {teamForecast ? (
              <Card>
                <CardHeader
                  eyebrow={`${forecast?.runs.toLocaleString()} simulated seasons`}
                  title="Where the season ends"
                />
                <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
                  <StatTile label="Win the league" value={pct(teamForecast.winTitle, 1)} estimate />
                  <StatTile label="Top four" value={pct(teamForecast.top4, 1)} estimate />
                  <StatTile label="European place" value={pct(teamForecast.europeanQualification, 1)} estimate />
                  <StatTile
                    label="Relegation"
                    value={pct(teamForecast.relegation, 1)}
                    tone={teamForecast.relegation > 0.2 ? 'negative' : 'default'}
                    estimate
                  />
                  <StatTile
                    label="Projected points"
                    value={int(teamForecast.projectedPoints.p50)}
                    sub={`likely ${teamForecast.projectedPoints.p10}–${teamForecast.projectedPoints.p90}`}
                    estimate
                  />
                  <StatTile
                    label="Projected finish"
                    value={ordinal(Math.round(teamForecast.projectedRank.mean))}
                    sub={`range ${teamForecast.projectedRank.p10}–${teamForecast.projectedRank.p90}`}
                    estimate
                  />
                  <StatTile label="Power rating" value={int(teamForecast.powerRating)} sub={`#${teamForecast.powerRank} in the division`} />
                  <StatTile
                    label="Attack / defence"
                    value={`${Math.round(team.attackRating)} / ${Math.round(team.defenseRating)}`}
                    sub="75 is league average"
                    estimate
                  />
                </div>
              </Card>
            ) : null}

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader eyebrow="Results" title="Recent" />
                <div className="space-y-2 p-4">
                  {recent.length === 0 ? (
                    <EmptyState title="No matches played yet" />
                  ) : (
                    recent.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        home={snapshot.teams.find((t) => t.id === m.homeTeamId)}
                        away={snapshot.teams.find((t) => t.id === m.awayTeamId)}
                        href={`/matches/${m.id}${suffix}`}
                      />
                    ))
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader eyebrow="Fixtures" title="Next up" />
                <div className="space-y-2 p-4">
                  {upcoming.length === 0 ? (
                    <EmptyState title="No scheduled fixtures" />
                  ) : (
                    upcoming.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        home={snapshot.teams.find((t) => t.id === m.homeTeamId)}
                        away={snapshot.teams.find((t) => t.id === m.awayTeamId)}
                        href={`/matches/${m.id}${suffix}`}
                      />
                    ))
                  )}
                </div>
              </Card>
            </div>

            {shots.length ? (
              <Card>
                <CardHeader
                  eyebrow="Shooting"
                  title="Where the chances come from"
                  description="Every shot taken, filterable by situation, body part and outcome."
                />
                <div className="mx-auto max-w-2xl p-4">
                  <SeasonShotMap shots={shots} subjectLabel={team.name} />
                </div>
              </Card>
            ) : null}

            {snapshot.standings.length ? (
              <Card>
                <CardHeader eyebrow="Context" title="In the table" />
                <div className="mt-3">
                  <LeagueTable
                    competition={snapshot.competition}
                    standings={aroundRank(snapshot.standings, standing?.rank ?? 1)}
                    teams={snapshot.teams}
                suffix={suffix}
                    highlightTeamId={team.id}
                  />
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * The slice of the table around a club — the neighbours are the context that
 * matters, not positions 1 through 20. Clamped so a club at either end still
 * gets a full window rather than a truncated one.
 */
function aroundRank<T extends { rank: number }>(rows: T[], rank: number, span = 3): T[] {
  const start = Math.max(0, Math.min(rank - 1 - span, rows.length - (span * 2 + 1)));
  return rows.slice(Math.max(0, start), Math.max(0, start) + span * 2 + 1);
}
