import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, Figure, Crest, Badge, EmptyState } from '@/components/ui';
import { Disclosure } from '@/components/ui/Disclosure';
import { resolveActive } from '@/server/active';
import { allSnapshots } from '@/data/store';
import { rankClubsAcrossLeagues, MIN_CROSS_MATCHES } from '@/analytics/crossLeague';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'World rankings' };

/**
 * One rating universe — the question the product could not answer.
 *
 * Every ranking elsewhere here is relative to its own division, because club
 * ratings are anchored per competition. This is the surface where that is
 * corrected, and its whole design is about being honest that the correction is
 * an ESTIMATE with a measurable amount of evidence behind it.
 *
 * So the league table comes first and the club ranking second. The league
 * offsets are the claim; the club list is a consequence of them. Presenting the
 * clubs first would invite reading the ranking as a fact rather than as the
 * output of a measurement whose error a reader can see.
 */
export default function RankingsPage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string };
}) {
  const { competition, available, editions, edition } =
    resolveActive(searchParams.competition, searchParams.season);

  const snapshots = allSnapshots();
  const { clubs, leagues } = rankClubsAcrossLeagues(snapshots);
  const ranked = leagues.filter((l) => l.ranked);
  const unranked = leagues.filter((l) => !l.ranked);
  const totalEvidence = leagues.reduce((n, l) => n + l.matches, 0) / 2;

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container space-y-6 px-4 py-6">
        <Card>
          <CardHeader
            eyebrow="One scale"
            title="World rankings"
            description="Club ratings are anchored per competition, so 1700 in one league is not 1700 in another. These are re-based onto a single scale using the continental matches that actually connect them."
          />
        </Card>

        {!ranked.length ? (
          <Card>
            <EmptyState
              title="Not enough continental football yet"
              description={`Leagues are placed against each other using matches between their clubs in continental competition. There are ${Math.round(totalEvidence)} such matches loaded — too few, so nothing is ranked rather than ranked badly.`}
            />
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader
                eyebrow="The measurement"
                title="How the leagues compare"
                description="Goals per match better or worse than a neutral league, solved from every cross-league result. The evidence column is how much football each figure rests on."
              />
              <div className="scroll-x">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <caption className="sr-only">
                    League strength, with the matches behind each figure
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-2xs uppercase tracking-caps text-ink-muted">
                      <th scope="col" className="w-10 px-3 py-2 text-left font-semibold">#</th>
                      <th scope="col" className="px-2 py-2 text-left font-semibold">League</th>
                      <th scope="col" className="w-[10rem] px-2 py-2 text-left font-semibold">
                        Strength
                      </th>
                      <th scope="col" className="w-[5rem] px-2 py-2 text-right font-semibold">
                        Matches
                      </th>
                      <th scope="col" className="w-[6rem] px-2 py-2 text-right font-semibold">
                        Leagues faced
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((l, i) => {
                      const max = Math.max(...ranked.map((x) => Math.abs(x.offset)), 0.1);
                      const pctWidth = (Math.abs(l.offset) / max) * 50;
                      return (
                        <tr
                          key={l.competitionId}
                          className="border-b border-border-subtle/60 transition-colors duration-fast ease-standard hover:bg-surface-2"
                        >
                          <td className="px-3 py-2">
                            <Figure tone="secondary" className="text-xs">{i + 1}</Figure>
                          </td>
                          <td className="min-w-0 px-2 py-2">
                            <Link
                              href={`/table?competition=${l.competitionId}`}
                              className="truncate underline-offset-2 hover:underline"
                            >
                              {l.competitionName}
                            </Link>
                          </td>
                          <td className="px-2 py-2">
                            {/* Diverging from a centre line: above a neutral
                                league to the right, below it to the left. A
                                single-direction bar would hide the sign, which
                                is the only thing that matters here. */}
                            <span className="flex items-center gap-2">
                              <span className="relative h-[0.375rem] w-full min-w-[4rem] overflow-hidden rounded-pill bg-surface-inset">
                                <span
                                  className="absolute top-0 h-full"
                                  style={{
                                    left: l.offset >= 0 ? '50%' : `${50 - pctWidth}%`,
                                    width: `${pctWidth}%`,
                                    background: l.offset >= 0
                                      ? 'var(--status-good)'
                                      : 'var(--status-critical)',
                                  }}
                                />
                                <span
                                  aria-hidden="true"
                                  className="absolute left-1/2 top-0 h-full w-px bg-border-strong"
                                />
                              </span>
                              <Figure className="w-[3rem] shrink-0 text-right text-xs">
                                {l.offset >= 0 ? '+' : ''}{l.offset.toFixed(2)}
                              </Figure>
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Figure tone="secondary" className="text-xs">{l.matches}</Figure>
                            {/* What the figure would have been without shrinkage.
                                Shown when they differ meaningfully, so a reader
                                can see the correction rather than take it on
                                trust. */}
                            {Math.abs(l.rawOffset - l.offset) >= 0.15 ? (
                              <span className="block text-2xs text-ink-muted">
                                raw {l.rawOffset >= 0 ? '+' : ''}{l.rawOffset.toFixed(2)}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Figure tone="muted" className="text-xs">{l.opponents}</Figure>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="px-3 py-3 text-2xs leading-relaxed text-ink-muted">
                A league&rsquo;s figure is the average goal difference of its clubs in
                continental matches, credited with the strength of who they played
                and solved until it settles. Beating a strong league counts for
                more than beating a weak one. Read the matches column before the
                rank: a figure resting on eight matches is a signal, not a verdict.
              </p>
              <p className="px-3 pb-3 text-2xs leading-relaxed text-ink-muted">
                Each figure is then pulled toward zero in proportion to how little
                evidence stands behind it — at twenty matches a league keeps half
                of what was measured, at a hundred five sixths. That is a
                statement about confidence rather than about football: a league
                near zero is not being called average, it is being called
                unmeasured. Where the correction is large the raw figure is shown
                beneath the match count.
              </p>
            </Card>

            {unranked.length ? (
              <Disclosure
                title="Not ranked"
                hint={`${unranked.length} leagues`}
              >
                <p className="mb-3 max-w-prose text-sm text-ink-secondary">
                  These leagues have not played enough continental football in the
                  data loaded to be placed against the others — fewer than{' '}
                  <span className="figure">{MIN_CROSS_MATCHES}</span> cross-league
                  matches, or against fewer than two different leagues. They are
                  absent rather than ranked low, because a rank with no evidence
                  behind it sits in the table looking exactly like one that has
                  some.
                </p>
                <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {unranked.map((l) => (
                    <li key={l.competitionId} className="flex items-baseline justify-between gap-2 text-sm">
                      <Link
                        href={`/table?competition=${l.competitionId}`}
                        className="min-w-0 truncate text-ink-secondary underline-offset-2 hover:text-ink hover:underline"
                      >
                        {l.competitionName}
                      </Link>
                      <span className="shrink-0 text-2xs text-ink-muted">
                        <Figure>{l.matches}</Figure> {l.matches === 1 ? 'match' : 'matches'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}

            <Card>
              <CardHeader
                eyebrow={`${clubs.length} clubs`}
                title="Every club on one scale"
                description="Each club's rating within its own league, shifted by that league's measured strength."
              />
              <div className="scroll-x">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <caption className="sr-only">Clubs ranked on a shared scale</caption>
                  <thead>
                    <tr className="border-b border-border text-2xs uppercase tracking-caps text-ink-muted">
                      <th scope="col" className="w-10 px-3 py-2 text-left font-semibold">#</th>
                      <th scope="col" className="px-2 py-2 text-left font-semibold">Club</th>
                      <th scope="col" className="hidden px-2 py-2 text-left font-semibold sm:table-cell">
                        League
                      </th>
                      <th scope="col" className="w-[5rem] px-2 py-2 text-right font-semibold">
                        In league
                      </th>
                      <th scope="col" className="w-[5rem] px-2 py-2 text-right font-semibold">
                        Adjust
                      </th>
                      <th scope="col" className="w-[5rem] px-2 py-2 text-right font-semibold text-ink">
                        Rating
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubs.slice(0, 60).map((c, i) => (
                      <tr
                        key={`${c.competitionId}-${c.team.id}`}
                        className="group border-b border-border-subtle/60 transition-colors duration-fast ease-standard hover:bg-surface-2"
                      >
                        <td className="px-3 py-2">
                          <Figure tone="secondary" className="text-xs">{i + 1}</Figure>
                        </td>
                        <td className="min-w-0 px-2 py-2">
                          <Link
                            href={`/teams/${c.team.id}?competition=${c.competitionId}`}
                            className="flex min-w-0 items-center gap-2 underline-offset-2 hover:underline"
                          >
                            <Crest
                              url={c.team.crestUrl}
                              code={c.team.code}
                              name={c.team.name}
                              size={18}
                            />
                            <span className="truncate">{c.team.shortName}</span>
                          </Link>
                        </td>
                        <td className="hidden min-w-0 px-2 py-2 sm:table-cell">
                          <span className="block truncate text-2xs text-ink-muted">
                            {c.competitionName}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Figure tone="muted" className="text-xs">{c.domesticElo}</Figure>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Figure
                            tone="secondary"
                            className={cn('text-xs', c.leagueAdjustment >= 0 && 'text-status-good')}
                          >
                            {c.leagueAdjustment >= 0 ? '+' : ''}
                            {Math.round(c.leagueAdjustment)}
                          </Figure>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Figure className="font-semibold">{c.crossElo}</Figure>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="px-3 py-3 text-2xs leading-relaxed text-ink-muted">
                The adjustment column is the whole point: it is what separates a
                rating that means something within a division from one that means
                something between them. Clubs from unranked leagues are absent —
                they cannot be placed on a shared scale when the gap between their
                league and everyone else&rsquo;s has not been measured.
                {clubs.length > 60 ? ` Showing the top 60 of ${clubs.length}.` : ''}
              </p>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
