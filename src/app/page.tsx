import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { MatchCard } from '@/components/match/MatchCard';
import { Figure, Card, CardHeader, Skeleton, EmptyState, Badge } from '@/components/ui';
import { Spotlight } from '@/components/ai/Spotlight';
import { generateInsights, generateBriefing } from '@/ai/narratives';
import { MatchdayPanel } from '@/components/match/MatchdayPanel';
import { matchdaysAcross } from '@/server/matchday';
import { allSnapshots } from '@/data/store';
import { predictMatch } from '@/analytics/poisson';
import { minutesFloor } from '@/server/players';
import { resolveActive, liveAcrossCompetitions } from '@/server/active';
import { formatDate, dayKey, pct, relativeTime, num } from '@/lib/format';
import type { Match, Team, VenueKind } from '@/domain/types';
import { entitySuffix } from '@/lib/entityLink';

export const dynamic = 'force-dynamic';

export default function HomePage({
  searchParams,
}: {
  searchParams: { date?: string; competition?: string; season?: string };
}) {
  const { competition, snapshot, available, forecast, editions, edition } = resolveActive(searchParams.competition, searchParams.season);
  const live = liveAcrossCompetitions();

  // The briefing is aware of every loaded competition, not just the active one —
  // in club football several run at once, and a week scoped to one of them
  // misses most of what happened.
  const liveElsewhere = Object.entries(
    live.reduce<Record<string, number>>((acc, l) => {
      const name = l.snapshot.competition.name;
      if (name !== competition.name) acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([competitionName, count]) => ({ competitionName, count }));

  const narrativeCtx = snapshot
    ? {
        snapshot,
        forecasts: forecast?.forecasts ?? [],
        // The model is injected rather than imported by the engine, so the
        // engine decides which games matter and this decides what they look
        // like. Same `predictMatch` the match pages use, so a fixture card and
        // the page it links to can never disagree.
        predict: (home: Team, away: Team, venueKind: VenueKind) =>
          predictMatch(home, away, { venueKind }),
        minutesFloor: minutesFloor(snapshot),
      }
    : null;
  const insights = narrativeCtx ? generateInsights(narrativeCtx) : [];
  const briefing = narrativeCtx ? generateBriefing(narrativeCtx, liveElsewhere) : null;
  const seasonSuffix = entitySuffix(competition.id, searchParams.season);

  /**
   * Today, across EVERY competition rather than the active one.
   *
   * The panel was scoped to whichever league you happened to be looking at,
   * which on a Saturday meant showing ten Premier League fixtures while a
   * hundred and twenty-four others kicked off elsewhere. "What is on today" is
   * not a per-competition question.
   */
  /** The one number that makes the season door worth opening. */
  const leaderForecast = [...(forecast?.forecasts ?? [])]
    .sort((a, b) => b.winTitle - a.winTitle)[0];
  const leaderName = leaderForecast
    ? snapshot?.teams.find((t) => t.id === leaderForecast.teamId)?.shortName
    : undefined;

  const today = new Date().toISOString().slice(0, 10);
  /**
   * `?date=` lets a reader stand on any matchday, not just this one.
   *
   * It also matters for testing the panel honestly: today may carry eight
   * matches and Saturday a hundred and thirty-four, and the two get completely
   * different treatments — without this the dense path could only be seen by
   * waiting for a weekend.
   */
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? (searchParams.date as string)
    : today;
  const days = matchdaysAcross(allSnapshots(), asked, 3);
  // The asked-for day leads; a live day elsewhere only wins when today is empty.
  const liveDay = days.find((d) => d.date === asked && d.matches.length)
    ?? days.find((d) => d.live > 0)
    ?? days.find((d) => d.matches.length)
    ?? days[0];

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container px-4 py-6">
        {/* Only a CACHED snapshot warrants a banner. Partial match detail is
            normal on a league with hundreds of played matches and a capped
            detail window, and is reported through the coverage badge instead. */}
        {snapshot?.meta.degradedKind === 'stale-cache' ? (
          <div className="mb-4 rounded-md border border-status-warning/30 bg-status-warning-faint px-4 py-3 text-sm">
            <p className="font-semibold text-status-warning">Showing cached data</p>
            <p className="mt-px text-ink-secondary">{snapshot.meta.degradedReason}</p>
          </div>
        ) : null}

        {/* Live across every loaded competition — a club plays in several at
            once, so this deliberately is not scoped to the active one. */}
        {live.length > 0 ? (
          <section className="mb-6">
            <h2 className="eyebrow mb-2">Live now</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {live.slice(0, 6).map(({ match, snapshot: snap }) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  home={snap.teams.find((t) => t.id === match.homeTeamId)}
                  away={snap.teams.find((t) => t.id === match.awayTeamId)}
                  showCompetition
                  competitionName={snap.competition.name}
                  // This strip spans EVERY competition, so the link must carry
                  // the match's own one, not the page's active one — and always
                  // the live edition, since only live matches appear here.
                  href={`/matches/${match.id}${entitySuffix(snap.competition.id)}`}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* The briefing: what a reader would want told to them before they
            start reading numbers. */}
        {briefing ? (
          <section className="mb-6">
            <Card>
              <div className="p-5">
                <p className="eyebrow">Today</p>
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
          </section>
        ) : null}

        {insights.length ? (
          <section className="mb-6">
            {/*
              One story at a time, not six at once.
              
              Six cards in a grid gives every storyline equal weight, which
              means the reader assigns none — and the sixth-best story is read
              by nobody either way. The spotlight was built for this: it gives
              each story the full width for a few seconds, pauses on hover and
              on focus, and does not rotate at all under reduced motion.
            */}
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="eyebrow">Storylines</h2>
              <Link
                href={`/ask${seasonSuffix}`}
                className="text-xs font-medium text-ink-secondary underline-offset-2 hover:text-ink hover:underline"
              >
                Ask a question
              </Link>
            </div>
            <Spotlight insights={insights.slice(0, 6)} suffix={seasonSuffix} />
          </section>
        ) : null}

        {!snapshot ? (
          <LoadingState />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="min-w-0 space-y-6">
              {liveDay ? <MatchdayPanel day={liveDay} suffix={seasonSuffix} /> : null}
              <FixtureFeed snapshot={snapshot} suffix={seasonSuffix} />
            </div>

            {/*
              The aside is a set of DOORS, not a second page.

              It previously carried a season card, an eight-tile projection
              block and a truncated ten-club chart — each a compressed version
              of something that has its own room now. Compressing a Monte Carlo
              into a 120px tile is not a summary, it is a receipt.

              Each door states the one number that would make a reader open it.
              That is the whole job: not to inform, but to be worth a click.
            */}
            <aside className="space-y-3">
              <Door
                href={`/season${seasonSuffix}`}
                eyebrow={`${(forecast?.runs ?? 8000).toLocaleString()} simulated seasons`}
                title="The season, projected"
                stat={leaderForecast ? pct(leaderForecast.winTitle, 0) : undefined}
                statLabel={leaderName ? `${leaderName} to win it` : undefined}
                note="Where every club finishes, and how wide the range is."
              />
              <Door
                href={`/table${seasonSuffix}`}
                eyebrow={snapshot.competition.name}
                title="The table"
                stat={
                  snapshot.season.isCurrent && snapshot.season.currentMatchweek
                    ? `${snapshot.season.currentMatchweek}/${snapshot.season.totalMatchweeks ?? '—'}`
                    : undefined
                }
                statLabel="matchweek"
                note="Standings, form, and how the season has moved."
              />
              <Door
                href="/rankings"
                eyebrow="Across every competition"
                title="World rankings"
                note="Club ratings re-based onto one scale using continental results."
              />
              <Door
                href={`/edge${seasonSuffix}`}
                eyebrow="Model versus market"
                title="Betting edge"
                note="Where the model and the bookmakers disagree, and why that is not profit."
              />
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * Fixtures grouped by day.
 *
 * A LIVE edition shows a window around now — last week, next fortnight. A
 * COMPLETED one has no "now" to centre on, so it shows the final matchweek
 * instead. Applying the live window to a finished season produces an empty card
 * that says "nothing scheduled" about a season with 380 played matches, which
 * reads as a broken page rather than a finished one.
 */
function FixtureFeed({ snapshot, suffix }: { snapshot: NonNullable<ReturnType<typeof resolveActive>['snapshot']>; suffix: string }) {
  const now = Date.now();
  const isHistorical = !snapshot.season.isCurrent;

  const relevant = isHistorical
    ? snapshot.matches
        .filter((m) => m.matchweek === snapshot.season.totalMatchweeks)
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    : snapshot.matches
        .filter((m) => {
          const t = Date.parse(m.kickoff);
          return t > now - 8 * 86_400_000 && t < now + 14 * 86_400_000;
        })
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  if (!relevant.length) {
    return (
      <Card>
        <CardHeader eyebrow="Fixtures" title="Nothing scheduled" />
        <EmptyState
          title="No fixtures in this window"
          description="This competition has no matches in the last week or the next fortnight."
        />
      </Card>
    );
  }

  /**
   * Results run backwards, fixtures run forwards.
   *
   * The feed spans the last week and the next fortnight, and sorting the whole
   * span one way is wrong at one end whichever way you pick: ascending buries
   * last night's results under a week of older ones, descending puts next
   * month's fixture above tomorrow's.
   *
   * They are different questions. "What just happened" wants the most recent
   * first; "what is coming" wants the soonest first. So the two halves are
   * ordered independently and results lead, because a result is a fact and a
   * fixture is a plan.
   *
   * Within a day, order stays chronological — that is the order the football
   * was played in, and reversing it inside a Saturday helps nobody.
   */
  const isResult = (m: Match) =>
    m.status === 'FINISHED' || m.status === 'LIVE' || m.status === 'HALFTIME';

  const groupByDay = (matches: Match[], newestFirst: boolean) => {
    const byDay = new Map<string, Match[]>();
    for (const m of matches) {
      const key = dayKey(m.kickoff);
      byDay.set(key, [...(byDay.get(key) ?? []), m]);
    }
    return [...byDay.entries()].sort(([a], [b]) =>
      newestFirst ? b.localeCompare(a) : a.localeCompare(b));
  };

  const results = groupByDay(relevant.filter(isResult), true);
  const upcoming = groupByDay(relevant.filter((m) => !isResult(m)), false);
  const sections: { label: string | null; days: [string, Match[]][] }[] = isHistorical
    ? [{ label: null, days: groupByDay(relevant, true) }]
    : [
        { label: results.length && upcoming.length ? 'Results' : null, days: results },
        { label: results.length && upcoming.length ? 'Coming up' : null, days: upcoming },
      ].filter((s) => s.days.length);

  return (
    <Card>
      <CardHeader
        eyebrow={isHistorical ? 'Final matchweek' : 'Fixtures & results'}
        title={snapshot.competition.name}
        description={
          isHistorical
            ? `How ${snapshot.season.label} finished.`
            : 'The last week and the fortnight ahead.'
        }
      />
      <div className="space-y-5 p-4">
        {sections.map((section) => (
          <div key={section.label ?? 'all'} className="space-y-5">
            {section.label ? (
              <h3 className="border-b border-border-subtle pb-1 font-display text-lg">
                {section.label}
              </h3>
            ) : null}
        {section.days.map(([day, matches]) => (
          <section key={day}>
            <h3 className="eyebrow mb-2">{formatDate(day)}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {matches.map((m, i) => (
                <div
                  key={m.id}
                  // The stagger walks across the day's fixtures rather than the
                  // whole feed, so each date group reads as its own arrival.
                  style={{ ['--reveal-i' as string]: Math.min(i, 8) }}
                  className="animate-fade-up stagger"
                >
                <MatchCard
                  key={m.id}
                  match={m}
                  home={snapshot.teams.find((t) => t.id === m.homeTeamId)}
                  away={snapshot.teams.find((t) => t.id === m.awayTeamId)}
                  href={`/matches/${m.id}${suffix}`}
                />
                </div>
              ))}
            </div>
          </section>
        ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * A door: an eyebrow, a name, one number, one line.
 *
 * The number is what distinguishes a door from a nav link. "The season,
 * projected" is a label; "68% — Palmeiras to win it" is a reason to go.
 */
function Door({
  href, eyebrow, title, stat, statLabel, note,
}: {
  href: string;
  eyebrow: string;
  title: string;
  stat?: string;
  statLabel?: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="lit-edge group block rounded-lg border border-border-subtle bg-surface-1 p-4 transition-[transform,border-color,box-shadow] duration-normal ease-standard hover:-translate-y-px hover:border-border hover:shadow-md"
    >
      <p className="eyebrow truncate">{eyebrow}</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate font-display text-lg leading-tight">{title}</h3>
        {stat ? (
          <span className="shrink-0 text-right">
            <Figure className="text-xl font-semibold leading-none">{stat}</Figure>
          </span>
        ) : null}
      </div>
      {stat && statLabel ? (
        <p className="mt-[0.125rem] text-right text-2xs text-ink-muted">{statLabel}</p>
      ) : null}
      <p className="mt-2 text-sm leading-snug text-ink-secondary">{note}</p>
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-2">
        <Skeleton className="h-6 w-[10rem]" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[5rem] w-full" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-[8rem] w-full" />
        <Skeleton className="h-[16rem] w-full" />
      </div>
    </div>
  );
}
