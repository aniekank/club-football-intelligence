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
        {!snapshot || !forecasts.length ? (
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
