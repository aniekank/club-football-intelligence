import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { PercentileBars } from '@/components/charts/PercentileBars';
import { SeasonShotMap } from '@/components/charts/SeasonShotMap';
import { CoverageNote, CoverageSentence } from '@/components/players/CoverageNote';
import { Card, CardHeader, Crest, Figure, StatTile, EmptyState, Badge } from '@/components/ui';
import { resolveActive } from '@/server/active';
import { buildPlayerView } from '@/server/players';
import { num, int, signed } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Metrics shown per role — a centre-back's profile is not a striker's. */
const PROFILE: Record<string, string[]> = {
  GK: ['saves', 'passAccuracy', 'touches', 'ballRecoveries'],
  DF: ['tackles', 'interceptions', 'clearances', 'aerialsWon', 'duelsWon', 'ballRecoveries', 'passesFinalThird', 'passAccuracy'],
  MF: ['keyPasses', 'passesFinalThird', 'progressiveCarries', 'xA', 'tackles', 'interceptions', 'ballRecoveries', 'duelsWon', 'touches'],
  FW: ['xG', 'goals', 'shots', 'shotsOnTarget', 'touchesInBox', 'xA', 'keyPasses', 'dribblesCompleted', 'bigChancesCreated'],
};

export default function PlayerPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { competition?: string; season?: string };
}) {
  const { competition, snapshot, available, editions, edition } = resolveActive(searchParams.competition, searchParams.season);
  const view = snapshot ? buildPlayerView(snapshot, params.id) : undefined;
  if (snapshot && !view) notFound();

  // Every shot this player took, across every ingested match.
  const shots = snapshot
    ? snapshot.matches.flatMap((m) => m.shots.filter((sh) => sh.playerId === params.id))
    : [];

  const coverage = snapshot?.meta.playerStatsCoverage;

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container space-y-6 px-4 py-6">
        {!view ? (
          <EmptyState title="Loading player" />
        ) : (
          <>
            <Card>
              <div className="flex flex-wrap items-center gap-4 p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={view.player.photoUrl ?? ''}
                  alt=""
                  aria-hidden="true"
                  width={64}
                  height={64}
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-full bg-surface-2 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="eyebrow flex items-center gap-2">
                    {view.team ? (
                      <Link
                        href={`/teams/${view.team.id}?competition=${competition.id}`}
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        <Crest url={view.team.crestUrl} code={view.team.code} name={view.team.name} size={14} />
                        {view.team.shortName}
                      </Link>
                    ) : null}
                    · {view.player.detailedPosition}
                    {view.player.nationality ? ` · ${view.player.nationality}` : ''}
                  </p>
                  <h1 className="mt-1 truncate font-display text-3xl leading-tight">
                    {view.player.name}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    {view.player.shirtNumber !== null ? (
                      <Figure>#{view.player.shirtNumber}</Figure>
                    ) : null}
                    {view.player.age !== null ? <span>· {view.player.age} years</span> : null}
                    {view.player.marketValueEur !== null ? (
                      <span>· €{num(view.player.marketValueEur, 1)}m</span>
                    ) : null}
                    <CoverageNote coverage={coverage} />
                  </div>
                </div>
                {view.stats.averageRating !== null ? (
                  <div className="text-right">
                    <p className="eyebrow">Rating</p>
                    <p className="figure text-4xl font-bold leading-none">
                      {num(view.stats.averageRating, 2)}
                    </p>
                    <p className="text-2xs text-ink-muted">minutes-weighted</p>
                  </div>
                ) : null}
              </div>
              <div className="border-t border-border-subtle px-5 py-2">
                <CoverageSentence coverage={coverage} />
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <StatTile label="Minutes" value={int(view.stats.minutes)} sub={`${view.stats.appearances} ${view.stats.appearances === 1 ? 'app' : 'apps'}, ${view.stats.starts} ${view.stats.starts === 1 ? 'start' : 'starts'}`} />
              <StatTile label="Goals" value={int(view.stats.goals)} />
              <StatTile label="Assists" value={int(view.stats.assists)} />
              <StatTile label="xG" value={num(view.stats.xG, 2)} />
              <StatTile label="xA" value={num(view.stats.xA, 2)} />
              <StatTile
                label="Goals − xG"
                value={signed(view.per90.goalsMinusXg ?? 0, 2)}
                sub={(view.per90.goalsMinusXg ?? 0) >= 0 ? 'outperforming' : 'underperforming'}
                tone={(view.per90.goalsMinusXg ?? 0) >= 0 ? 'positive' : 'negative'}
              />
            </div>

            <Card>
              <CardHeader
                eyebrow={`vs ${view.peerCount} ${view.player.position}s in the division`}
                title="Profile"
                description="Percentile rank against positional peers with 45+ minutes."
              />
              <div className="max-w-3xl p-4">
                <PercentileBars
                  percentiles={view.percentiles}
                  per90={view.per90}
                  peerCount={view.peerCount}
                  position={view.player.position}
                  metrics={PROFILE[view.player.position] ?? PROFILE.MF!}
                />
              </div>
            </Card>

            {shots.length ? (
              <Card>
                <CardHeader
                  eyebrow="Shooting"
                  title="Where the shots come from"
                  description="Filter by situation, body part or outcome."
                />
                <div className="mx-auto max-w-2xl p-4">
                  <SeasonShotMap shots={shots} subjectLabel={view.player.name} />
                </div>
              </Card>
            ) : null}

            <Card>
              <CardHeader eyebrow="Detail" title="Per 90 and totals" />
              <div className="scroll-x">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-2xs uppercase tracking-caps text-ink-muted">
                      <th scope="col" className="px-4 py-2 text-left font-semibold">Metric</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">Total</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">Per 90</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Pctl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DETAIL_ROWS.map((r) => {
                      const total = (view.stats as unknown as Record<string, number>)[r.key];
                      if (total === undefined) return null;
                      const p90 = view.per90[r.key];
                      const pctl = view.percentiles[r.key];
                      return (
                        <tr key={r.key} className="border-b border-border-subtle/60">
                          <td className="px-4 py-2 text-ink-secondary">{r.label}</td>
                          <td className="px-2 py-2 text-right"><Figure>{num(total, r.digits ?? 0)}</Figure></td>
                          <td className="px-2 py-2 text-right">
                            <Figure tone="secondary">{p90 !== undefined ? num(p90, 2) : '—'}</Figure>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {/* Absent, not zero — a metric the source does not
                                supply must never render as a 0th percentile. */}
                            <Figure tone="muted">{pctl !== undefined ? pctl : '—'}</Figure>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

const DETAIL_ROWS: { key: string; label: string; digits?: number }[] = [
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'xG', label: 'Expected goals', digits: 2 },
  { key: 'xA', label: 'Expected assists', digits: 2 },
  { key: 'shots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'Shots on target' },
  { key: 'keyPasses', label: 'Chances created' },
  { key: 'bigChancesCreated', label: 'Big chances created' },
  { key: 'passesCompleted', label: 'Passes completed' },
  { key: 'passesFinalThird', label: 'Passes into final third' },
  { key: 'dribblesCompleted', label: 'Dribbles completed' },
  { key: 'touchesInBox', label: 'Touches in box' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'interceptions', label: 'Interceptions' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'ballRecoveries', label: 'Recoveries' },
  { key: 'duelsWon', label: 'Duels won' },
  { key: 'aerialsWon', label: 'Aerial duels won' },
  { key: 'saves', label: 'Saves' },
  { key: 'cleanSheets', label: 'Clean sheets' },
];
