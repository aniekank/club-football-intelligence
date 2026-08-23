import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, Badge, Figure, EmptyState, Crest } from '@/components/ui';
import { ResponsibleGamblingBanner } from '@/components/betting/ResponsibleGambling';
import { resolveActive } from '@/server/active';
import { buildEdgeView, type MarketRow } from '@/server/edge';
import { pct, num, relativeTime } from '@/lib/format';
import { LocalTime } from '@/components/ui/LocalTime';
import { KELLY_FRACTION } from '@/analytics/betting';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Betting Edge' };

export default async function EdgePage({
  searchParams,
}: {
  searchParams: { competition?: string };
}) {
  const { competition, snapshot, available } = resolveActive(searchParams.competition);
  const view = snapshot ? await buildEdgeView(snapshot) : null;

  return (
    <AppShell competitions={available} activeId={competition.id}>
      <div className="mx-auto max-w-container space-y-6 px-4 py-6">
        <header className="max-w-prose">
          <p className="eyebrow">Model vs market</p>
          <h1 className="mt-1 text-3xl">Betting Edge</h1>
          <p className="mt-3 text-ink-secondary">
            The model&apos;s probabilities set against the sharpest available price, with
            the bookmaker&apos;s margin removed. Where they disagree, that disagreement is
            quantified — and where the disagreement is too large to believe, it is
            labelled as a problem with the model rather than an opportunity.
          </p>
        </header>

        <ResponsibleGamblingBanner />

        {!snapshot || !view ? (
          <EmptyState title="Loading" description="Fetching fixtures and prices." />
        ) : !view.hasOddsKey ? (
          <Card>
            <EmptyState
              title="No odds feed configured"
              description="Set ODDS_API_KEY to enable the model-versus-market comparison."
            />
          </Card>
        ) : (
          <>
            {!view.readiness.ready ? (
              <Card className="border-status-warning/30 bg-status-warning-faint">
                <div className="p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-status-warning">
                    <span aria-hidden="true">⚠</span> Edges withheld — the model is not ready
                  </p>
                  <p className="mt-1 max-w-prose text-sm text-ink-secondary">
                    {view.readiness.reason}
                  </p>
                  <p className="mt-2 max-w-prose text-sm text-ink-muted">
                    Prices and the model&apos;s current view are shown below so you can see
                    where they stand, but no value is flagged and no stake is suggested.
                  </p>
                </div>
              </Card>
            ) : null}

            {view.fixtures.length === 0 ? (
              <Card>
                <EmptyState
                  title="No priced fixtures"
                  description={`${view.skippedNoOdds} upcoming fixtures have no published market yet, and ${view.skippedUnusableMarkets} were rejected for implausible pricing.`}
                />
              </Card>
            ) : (
              <div className="space-y-4">
                {view.fixtures.map((f) => (
                  <Card key={f.match.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Crest url={f.home.crestUrl} code={f.home.code} name={f.home.name} size={22} />
                        <span className="truncate text-sm font-semibold">
                          {f.home.shortName} <span className="text-ink-muted">v</span>{' '}
                          {f.away.shortName}
                        </span>
                        <Crest url={f.away.crestUrl} code={f.away.code} name={f.away.name} size={22} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <LocalTime iso={f.match.kickoff} mode="datetime" />
                        <Badge tone="neutral">{f.bookmaker}</Badge>
                        {f.lastUpdate ? (
                          <span title={f.lastUpdate}>{relativeTime(f.lastUpdate)}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="scroll-x">
                      <table className="w-full min-w-[38rem] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border-subtle text-2xs uppercase tracking-caps text-ink-muted">
                            <th scope="col" className="px-4 py-2 text-left font-semibold">Market</th>
                            <th scope="col" className="px-2 py-2 text-left font-semibold">Selection</th>
                            <th scope="col" className="px-2 py-2 text-right font-semibold">Price</th>
                            <th scope="col" className="px-2 py-2 text-right font-semibold">Model</th>
                            <th scope="col" className="px-2 py-2 text-right font-semibold">Market</th>
                            <th scope="col" className="px-2 py-2 text-right font-semibold">Edge</th>
                            <th scope="col" className="px-4 py-2 text-right font-semibold">
                              {view.readiness.ready ? 'Stake' : ''}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.rows.map((row, i) => (
                            <Row
                              key={`${row.market}-${row.selection}-${i}`}
                              row={row}
                              showEdge={view.readiness.ready}
                              isBest={view.readiness.ready && f.best === row}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardHeader eyebrow="Method" title="How these numbers are made" />
              <div className="max-w-prose space-y-3 p-4 text-sm text-ink-secondary">
                <p>
                  <strong className="text-ink">The price.</strong> One sharp bookmaker, not an
                  average across the market. Soft books carry stale prices, and beating a
                  stale price is not an edge — it is a number that will be gone before you
                  could act on it.
                </p>
                <p>
                  <strong className="text-ink">The margin.</strong> Removed with the power
                  method rather than proportionally. Books load more margin onto longshots,
                  so dividing every implied probability by the same total leaves big prices
                  overstated and invents value that is not there.
                </p>
                <p>
                  <strong className="text-ink">The model.</strong> A bivariate-Poisson goal
                  model over strength ratings derived from this season&apos;s results,
                  shrunk toward last season, with real home advantage. It has no knowledge
                  of team news, injuries, motivation, or anything else a market prices in.
                </p>
                <p>
                  <strong className="text-ink">The stake.</strong> A quarter of the Kelly
                  criterion ({Math.round(KELLY_FRACTION * 100)}%). Full Kelly is optimal only
                  if the probability estimate is exactly right, which it never is, and
                  overbetting a real edge still loses money.
                </p>
                <p>
                  <strong className="text-ink">Rejected markets.</strong>{' '}
                  {view.skippedUnusableMarkets} fixture
                  {view.skippedUnusableMarkets === 1 ? ' was' : 's were'} dropped for
                  implausible pricing (a book whose probabilities sum far from 100% has not
                  opened properly), and {view.skippedNoOdds} had no published market yet.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Row({
  row, showEdge, isBest,
}: { row: MarketRow; showEdge: boolean; isBest: boolean }) {
  const s = row.strength;
  const tone =
    s === 'implausible' ? 'warning'
      : s === 'strong' ? 'good'
      : s === 'moderate' ? 'good'
      : s === 'slim' ? 'neutral'
      : 'neutral';

  return (
    <tr
      className={cn(
        'border-b border-border-subtle/60 transition-colors duration-fast ease-standard hover:bg-surface-2',
        isBest && 'bg-status-good-faint/40',
      )}
    >
      <td className="px-4 py-2 text-ink-muted">{row.market}</td>
      <td className="px-2 py-2 font-medium">{row.selection}</td>
      <td className="px-2 py-2 text-right"><Figure>{num(row.price, 2)}</Figure></td>
      <td className="px-2 py-2 text-right"><Figure tone="secondary">{pct(row.modelProbability, 1)}</Figure></td>
      <td className="px-2 py-2 text-right"><Figure tone="muted">{pct(row.marketProbability, 1)}</Figure></td>
      <td className="px-2 py-2 text-right">
        {!showEdge ? (
          <span className="text-ink-muted">—</span>
        ) : s === 'implausible' ? (
          <Badge tone="warning" title="The model disagrees with the market by more than is credible; treat this as a model problem, not an opportunity.">
            check model
          </Badge>
        ) : s === 'none' ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Figure tone="positive">+{(row.edge.expectedValue * 100).toFixed(1)}%</Figure>
            <Badge tone={tone}>{s}</Badge>
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {showEdge && s !== 'none' && s !== 'implausible' ? (
          <Figure tone="secondary">{(row.edge.recommendedStake * 100).toFixed(2)}%</Figure>
        ) : null}
      </td>
    </tr>
  );
}
