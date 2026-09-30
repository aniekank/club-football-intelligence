import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, Figure, EmptyState, EstimateMark, Crest } from '@/components/ui';
import { Disclosure } from '@/components/ui/Disclosure';
import { SeasonProjection } from '@/components/charts/SeasonProjection';
import { OutcomeSpread, TitleSwing } from '@/components/charts/OutcomeSpread';
import { BumpChart } from '@/components/charts/BumpChart';
import { buildProgression } from '@/analytics/progression';
import { resolveActive } from '@/server/active';
import { entitySuffix } from '@/lib/entityLink';
import { pct } from '@/lib/format';
import type { DatasetSnapshot, SeasonForecast } from '@/domain/types';
import { buildBracketView, type BracketTie } from '@/analytics/bracket';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Season' };

/**
 * The season, given a room of its own.
 *
 * ── Why this is a page and not a card ──────────────────────────────────────
 * Eight thousand simulated seasons were being rendered as eight small tiles in
 * a sidebar. That is not a summary of the model, it is a receipt for it: the
 * whole reason to run a Monte Carlo is the SPREAD, and a spread cannot be shown
 * in a 120px tile. Everything the simulation actually knows — the range of
 * outcomes, how they overlap, which way the season has moved — needs width.
 *
 * ── One answer, then the evidence ──────────────────────────────────────────
 * The page opens with the single sentence a reader came for and one number.
 * Everything beneath it is the working, and everything beneath THAT is folded.
 * A reader who wanted the answer has it in one line; a reader who wants to
 * argue with it can open every step.
 *
 * That ordering is the point. The previous layout gave a title race, a
 * projection chart, a table and five storylines equal billing on one screen,
 * which asks the reader to work out what matters. This decides.
 */
export default function SeasonPage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string };
}) {
  const { competition, snapshot, available, forecast, editions, edition } =
    resolveActive(searchParams.competition, searchParams.season);
  const suffix = entitySuffix(competition.id, searchParams.season);

  const forecasts = forecast?.forecasts ?? [];
  const byId = new Map((snapshot?.teams ?? []).map((t) => [t.id, t]));
  const leader = [...forecasts].sort((a, b) => b.winTitle - a.winTitle)[0];
  const leaderTeam = leader ? byId.get(leader.teamId) : undefined;
  const progression = snapshot ? buildProgression(snapshot) : null;

  const settled = leader && leader.winTitle >= 0.995;
  const runnerUp = [...forecasts].sort((a, b) => b.winTitle - a.winTitle)[1];

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container space-y-6 px-4 py-6">
        {snapshot && forecasts.length && competition.qualification ? (
          <QualificationRace snapshot={snapshot} forecasts={forecasts} runs={forecast?.runs ?? 8000} suffix={suffix} />
        ) : !snapshot || !forecasts.length ? (
          <Card>
            <CardHeader eyebrow="Season" title={competition.name} />
            <EmptyState
              title="Nothing to simulate yet"
              description="This competition has no table, or too few matches played for a projection to mean anything."
            />
          </Card>
        ) : (
          <>
            {/* The answer. One sentence, one number, nothing competing. */}
            <Card className="lit-edge relative isolate overflow-hidden">
              <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-8">
                <div className="min-w-0">
                  <p className="eyebrow">
                    {competition.name} · {snapshot.season.label} ·{' '}
                    {(forecast?.runs ?? 8000).toLocaleString()} simulated seasons
                  </p>
                  <h1 className="mt-2 max-w-prose font-display text-4xl leading-tight sm:text-5xl">
                    {leaderTeam
                      ? settled
                        ? `${leaderTeam.name} have won it`
                        : `${leaderTeam.name} are favourites`
                      : 'Too close to call'}
                  </h1>
                  {leader && leaderTeam && runnerUp ? (
                    <p className="mt-3 max-w-prose text-ink-secondary">
                      {settled
                        ? 'Settled — the remaining fixtures cannot change it.'
                        : `Ahead of ${byId.get(runnerUp.teamId)?.name ?? 'the field'} on ${pct(runnerUp.winTitle, 0)}. The model projects them to finish on ${Math.round(leader.projectedPoints.mean)} points, though a tenth of the simulations end below ${Math.round(leader.projectedPoints.p10)}.`}
                    </p>
                  ) : null}
                </div>

                {leader && leaderTeam ? (
                  <div className="flex items-center gap-4 md:flex-col md:items-end">
                    <Crest
                      url={leaderTeam.crestUrl}
                      code={leaderTeam.code}
                      name={leaderTeam.name}
                      size={56}
                    />
                    <div className="text-right">
                      <p className="eyebrow">Title chance</p>
                      <p className="figure text-5xl font-bold leading-none">
                        {pct(leader.winTitle, 0)}
                      </p>
                      <EstimateMark />
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            {/* The working: the spread the simulation exists to produce. */}
            <Card>
              <CardHeader
                eyebrow="The spread"
                title="Where every club finishes"
                description="The pale bar is the tenth to ninetieth percentile, the darker bar the middle half, the notch the median. Overlap between two clubs is the race."
              />
              <div className="p-4">
                <SeasonProjection
                  forecasts={forecasts}
                  teams={snapshot.teams}
                  limit={snapshot.teams.length}
                />
              </div>
            </Card>

            <Disclosure
              title="What happens to each club"
              hint="Title, Europe, relegation — as one bar"
            >
              <OutcomeSpread forecasts={forecasts} teams={snapshot.teams} />
            </Disclosure>

            <Disclosure
              title="Which way the season has moved"
              hint="Change in title chance since August"
            >
              <TitleSwing forecasts={forecasts} teams={snapshot.teams} />
            </Disclosure>

            {progression ? (
              <Disclosure title="How they got here" hint={`${progression.matchweeks.length} matchweeks`}>
                <BumpChart progression={progression} />
              </Disclosure>
            ) : null}

            <Disclosure title="How the projection is made" hint="Method and its limits">
              <div className="max-w-prose space-y-3 text-sm leading-relaxed text-ink-secondary">
                <p>
                  Every remaining fixture is played{' '}
                  <span className="figure">{(forecast?.runs ?? 8000).toLocaleString()}</span>{' '}
                  times with a bivariate-Poisson goal model, drawn from each
                  club&rsquo;s current attack and defence ratings and the
                  competition&rsquo;s own home advantage. The shared covariance
                  term matters: goals in a match are not independent, and
                  modelling them as if they were understates draws.
                </p>
                <p>
                  Each simulated season is then ranked with{' '}
                  <span className="text-ink">this competition&rsquo;s tiebreakers</span>,
                  not a generic one — which is why a club level on points can
                  hold a different title probability here than elsewhere.
                </p>
                <p className="text-ink-muted">
                  What it cannot do: injuries, transfers, a manager leaving, or
                  a club with nothing left to play for in May. A shown 0% means
                  it did not occur in {(forecast?.runs ?? 8000).toLocaleString()}{' '}
                  runs, not that it is impossible.
                </p>
                <p className="text-2xs text-ink-muted">
                  Ratings and the table behind them are on the{' '}
                  <Link href={`/table${suffix}`} className="underline underline-offset-2 hover:text-ink-secondary">
                    league page
                  </Link>.
                </p>
              </div>
            </Disclosure>
          </>
        )}
      </div>
    </AppShell>
  );
}


/**
 * The Season page for a group stage with a qualification rule (AFCON).
 *
 * There is no title to be favourite for. Ranking forty-eight nations on "title
 * chance" read as "Morocco are favourites, 30%" — the chance of topping a
 * combined table nobody plays. The question a group stage answers is who goes
 * through, group by group, so that is what this page shows.
 */
function QualificationRace({
  snapshot, forecasts, runs, suffix,
}: {
  snapshot: DatasetSnapshot;
  forecasts: SeasonForecast[];
  runs: number;
  suffix: string;
}) {
  const rule = snapshot.competition.qualification!;
  const byTeam = new Map(forecasts.map((f) => [f.teamId, f]));
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));
  const hosts = new Set((rule.hosts ?? []).map((h) => h.toLowerCase()));
  const groups = snapshot.competition.conferences ?? [];

  const q = (id: string) => byTeam.get(id)?.qualify ?? 0;
  const all = forecasts.filter((f) => f.qualify != null);
  const nearlyIn = all.filter((f) => (f.qualify as number) >= 0.9).length;
  const open = all.filter((f) => (f.qualify as number) > 0.2 && (f.qualify as number) < 0.8).length;
  // The group whose outcome is least settled: the most probability outside 0 and 1.
  const uncertainty = (g: string) =>
    snapshot.standings
      .filter((r) => r.groupId === g)
      .reduce((s, r) => s + q(r.teamId) * (1 - q(r.teamId)), 0);
  const tightest = [...groups].sort((a, b) => uncertainty(b) - uncertainty(a))[0];
  // Every chance is 0 or 1: the group stage is over and there is no race left.
  const settled = all.every((f) => (f.qualify as number) === 0 || (f.qualify as number) === 1);
  const through = all.filter((f) => f.qualify === 1).length;

  // A simulated bracket: who wins the whole thing.
  const bracket = buildBracketView(snapshot);
  const byChampion = forecasts.filter((f) => f.knockout).sort((a, b) => (b.knockout!.champion - a.knockout!.champion));
  const favourite = byChampion[0];
  const favouriteTeam = favourite ? teamById.get(favourite.teamId) : undefined;
  const championTeam = bracket?.champion ? teamById.get(bracket.champion) : undefined;

  return (
    <>
      <Card className="lit-edge relative isolate overflow-hidden">
        <div className="p-6 md:p-8">
          <p className="eyebrow">
            {snapshot.competition.name} · {snapshot.season.label} · {runs.toLocaleString()} simulated {bracket ? 'tournaments' : 'group stages'}
          </p>
          <h1 className="mt-2 max-w-prose font-display text-4xl leading-tight sm:text-5xl">
            {championTeam
              ? `${championTeam.name} won the ${snapshot.competition.name}`
              : favouriteTeam && favourite && favourite.knockout!.champion > 0
              ? `${favouriteTeam.name} are favourites, at ${pct(favourite.knockout!.champion, 0)}`
              : settled
              ? `The ${rule.prize} line-up is settled`
              : `The race for ${rule.bestThirds ? `the ${rule.prize}` : rule.prize}`}
          </h1>
          {championTeam ? (
            <p className="mt-3 max-w-prose text-ink-secondary">
              The tournament is complete. The bracket below shows every tie as it was played.
            </p>
          ) : favouriteTeam && favourite && byChampion[1] ? (
            <p className="mt-3 max-w-prose text-ink-secondary">
              Every remaining match, groups and knockout, played {runs.toLocaleString()} times.
              Next: {teamById.get(byChampion[1].teamId)?.name ?? '—'} on {pct(byChampion[1].knockout!.champion, 0)}
              {byChampion[2] ? `, then ${teamById.get(byChampion[2].teamId)?.name ?? '—'} on ${pct(byChampion[2].knockout!.champion, 0)}` : ''}.
              Level after extra time, a tie is settled by a coin flip — shoot-out skill is not in the data.
            </p>
          ) : settled ? (
            <p className="mt-3 max-w-prose text-ink-secondary">
              The group stage is over: {through} {through === 1 ? 'nation' : 'nations'} went through. Each group below shows who made it.
            </p>
          ) : (
          <p className="mt-3 max-w-prose text-ink-secondary">
            {nearlyIn} {nearlyIn === 1 ? 'nation is' : 'nations are'} at 90% or better to go through, and {open}{' '}
            {open === 1 ? 'place is' : 'places are'} genuinely open, between 20% and 80%.
            {tightest ? ` The most open group right now: ${tightest}.` : ''}
            {rule.hosts?.length ? ` ${rule.hosts.join(', ')} are already in as hosts.` : ''}
          </p>
          )}
        </div>
      </Card>

      {bracket ? <BracketCard bracket={bracket} teamById={teamById} suffix={suffix} /> : null}
      {byChampion.length && !championTeam ? (
        <Card>
          <CardHeader
            eyebrow="The knockout"
            title="How far each team goes"
            description={`Chance of reaching each round, from ${runs.toLocaleString()} simulated tournaments.`}
          />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-caps text-ink-muted">
                  <th scope="col" className="py-2 pr-2 font-semibold">Team</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">R16</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">QF</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">SF</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Final</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Win</th>
                </tr>
              </thead>
              <tbody>
                {byChampion.filter((f) => (f.qualify ?? 0) > 0).slice(0, 16).map((f) => (
                  <tr key={f.teamId} className="border-t border-border-subtle">
                    <td className="py-2 pr-2">
                      <Link href={`/teams/${f.teamId}${suffix}`} className="hover:underline">{teamById.get(f.teamId)?.name ?? f.teamId}</Link>
                    </td>
                    <td className="figure px-2 py-2 text-right">{pct(f.qualify ?? null, 0)}</td>
                    <td className="figure px-2 py-2 text-right">{pct(f.knockout!.quarterFinal, 0)}</td>
                    <td className="figure px-2 py-2 text-right">{pct(f.knockout!.semiFinal, 0)}</td>
                    <td className="figure px-2 py-2 text-right">{pct(f.knockout!.final, 0)}</td>
                    <td className="figure px-2 py-2 text-right font-semibold">{pct(f.knockout!.champion, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          eyebrow="Group by group"
          title="Chances of going through"
          description={rule.hosts?.length
            ? 'The top two of each group qualify. In a host\u2019s group the host is already in, so only the best of the other three goes through.'
            : `The top ${rule.perGroup} of each group${rule.bestThirds ? ` and the ${rule.bestThirds} best third-placed teams` : ''} go through.`}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const rows = snapshot.standings
              .filter((r) => r.groupId === g)
              .sort((a, b) => q(b.teamId) - q(a.teamId));
            return (
              <section key={g} className="rounded-md border border-border-subtle p-3">
                <h3 className="mb-2 font-display text-lg">{g}</h3>
                <ul className="space-y-2">
                  {rows.map((r) => {
                    const team = teamById.get(r.teamId);
                    const p = q(r.teamId);
                    const isHost = team ? hosts.has(team.name.toLowerCase()) : false;
                    return (
                      <li key={r.teamId} className="text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                          <Link href={`/teams/${r.teamId}${suffix}`} className="min-w-0 truncate hover:underline">
                            {team?.name ?? r.teamId}
                            {isHost ? <span className="ml-1 text-2xs uppercase tracking-caps text-ink-muted">host</span> : null}
                          </Link>
                          <span className="figure shrink-0 font-semibold">{pct(p, 0)}</span>
                        </div>
                        <div className="mt-1 h-[0.375rem] w-full rounded-full bg-surface-inset" aria-hidden="true">
                          <div
                            className="h-[0.375rem] rounded-full"
                            style={{ width: `${Math.max(0, Math.min(100, p * 100))}%`, background: 'var(--comp-' + snapshot.competition.accentKey + ', var(--comp-default))' }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="px-4 pb-4 text-xs text-ink-muted">
          Each group is simulated on its own with the remaining fixtures played {runs.toLocaleString()} times
          from the teams&rsquo; attack and defence ratings. Ratings start from every CAF result in the last cycle —
          the previous qualifiers, the 2025 finals and the World Cup qualifiers — because six games is too few to
          rate a national team on. A shown 0% means it did not occur in the simulations, not that it is impossible.
        </p>
      </Card>
    </>
  );
}


/**
 * The bracket, round by round. Real ties show their score; a tie not yet
 * reached shows what fills it ("Winner Group D", "Winner QF 2"). Before the
 * groups finish, the round of sixteen is "if it ended now" and says so.
 */
function BracketCard({
  bracket, teamById, suffix,
}: {
  bracket: NonNullable<ReturnType<typeof buildBracketView>>;
  teamById: Map<string, DatasetSnapshot['teams'][number]>;
  suffix: string;
}) {
  const side = (id: string | null, label: string, won: boolean) => {
    const team = id ? teamById.get(id) : undefined;
    return team ? (
      <Link href={`/teams/${team.id}${suffix}`} className={`min-w-0 truncate hover:underline ${won ? 'font-semibold text-ink' : 'text-ink-secondary'}`}>
        {team.name}
      </Link>
    ) : (
      <span className="min-w-0 truncate text-ink-muted">{label}</span>
    );
  };
  const score = (tie: BracketTie, home: boolean) => {
    const m = tie.match;
    if (!m || m.homeScore === null || m.awayScore === null) return null;
    const mine = (m.homeTeamId === (home ? tie.home : tie.away)) ? m.homeScore : m.awayScore;
    return <span className="figure shrink-0">{mine}</span>;
  };
  return (
    <Card>
      <CardHeader
        eyebrow="The bracket"
        title={bracket.provisional ? 'If the groups ended now' : 'The knockout'}
        description={bracket.provisional
          ? 'The round of sixteen from the current tables, with third-placed teams paired by CAF\u2019s fixed table. It changes as the groups do.'
          : 'Every tie, with the winner in bold. Shoot-out winners are marked (p).'}
      />
      <div className="grid gap-4 p-4 md:grid-cols-4">
        {bracket.rounds.map((round) => (
          <section key={round.label} className="flex flex-col justify-around gap-3">
            <h3 className="text-2xs font-semibold uppercase tracking-caps text-ink-muted">{round.label}</h3>
            {round.ties.map((tie, i) => (
              <div key={i} className="rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  {side(tie.home, tie.homeLabel, tie.winner !== null && tie.winner === tie.home)}
                  {score(tie, true)}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  {side(tie.away, tie.awayLabel, tie.winner !== null && tie.winner === tie.away)}
                  {score(tie, false)}
                </div>
                {tie.match?.shootoutWinnerTeamId ? (
                  <p className="mt-1 text-2xs text-ink-muted">
                    (p) {teamById.get(tie.match.shootoutWinnerTeamId)?.name ?? ''} on penalties
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>
    </Card>
  );
}
