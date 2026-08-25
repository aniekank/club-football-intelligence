import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Figure, Skeleton } from '@/components/ui';
import { generateInsights, generateBriefing } from '@/ai/narratives';
import { narrativeContext } from '@/server/narrative';
import { WorldTourPanel } from '@/components/globe/WorldTourPanel';
import { TopForm } from '@/components/form/TopForm';
import { topFormTeams, topFormPlayers } from '@/analytics/form';
import { Rail } from '@/components/layout/Rail';
import { MatchdayPanel } from '@/components/match/MatchdayPanel';
import { matchdaysAcross } from '@/server/matchday';
import { allSnapshots } from '@/data/store';
import { resolveActive } from '@/server/active';
import { pct } from '@/lib/format';
import { entitySuffix } from '@/lib/entityLink';

export const dynamic = 'force-dynamic';

export default function HomePage({
  searchParams,
}: {
  searchParams: { date?: string; competition?: string; season?: string };
}) {
  const { competition, snapshot, available, forecast, editions, edition } = resolveActive(searchParams.competition, searchParams.season);
  // Built by one function shared with the storylines page: the engine takes its
  // model as an argument rather than importing one, and that design only buys
  // anything if the argument is identical everywhere.
  const narrativeCtx = narrativeContext(snapshot, forecast?.forecasts ?? []);
  const insights = narrativeCtx ? generateInsights(narrativeCtx) : [];
  // Only the HEADLINE is used here, as the note on the table door — the live
  // context the briefing can also carry belongs on the page that shows the
  // whole thing.
  const briefing = narrativeCtx ? generateBriefing(narrativeCtx) : null;
  const seasonSuffix = entitySuffix(competition.id, searchParams.season);

  /**
   * Form is deliberately NOT scoped to the active competition.
   *
   * Everything else on this page answers "what is happening in the league you
   * picked". This one answers "who is playing well anywhere", which is a
   * different question and the only one the reader cannot get by switching
   * competitions until they find it.
   */
  const everySnapshot = allSnapshots();
  const formTeams = topFormTeams(everySnapshot, 6);
  const formPlayers = topFormPlayers(everySnapshot, new Date().toISOString(), 6);

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

        {/*
          The lead is a globe, and it is the only league-agnostic thing here.

          Every other surface in this product is scoped to a competition: pick
          a league, read its table, open its fixtures. That is how the data is
          shaped and it is not how anyone's evening is shaped — the next match
          worth watching might be in São Paulo and the one after it in Riyadh.
          On a sphere those are two places rather than two leagues, and the
          only thing they need in common is the clock.

          Stops are resolved from a committed table of grounds, so this costs
          arithmetic rather than a network round trip and needs no boundary of
          its own.
        */}
        <section className="mb-6">
          <WorldTourPanel suffix={seasonSuffix} />
        </section>

        {/*
          Straight under the globe, and above everything scoped to a league.

          The page has two halves and they answer different questions. These
          top sections are about football everywhere — what is kicking off, who
          is running hot — and everything below is about the competition the
          reader picked. Sitting under the storylines it was the fifth block
          down and behind two carousels, which is where a module goes to be
          described as missing.
        */}
        {formTeams.length || formPlayers.length ? (
          <section className="mb-6">
            <TopForm teams={formTeams} players={formPlayers} />
          </section>
        ) : null}

        {/*
          What is NOT on this page any more, and why.

          A briefing and a storyline spotlight used to sit here, both about ONE
          competition. They are the reason this could not honestly be called
          Today: five of its blocks were football everywhere and three were the
          Premier League, at the same volume, on the same screen. The briefing's
          headline is now the note on the table door and its body opens /table;
          the spotlight has had its own room since /storylines was built; the
          fixture feed has been /fixtures since that became a season of rounds.

          A separate "Live now" strip went too. It listed the same matches the
          day panel below already carries, and the fix for a duplicate is not a
          smaller duplicate — live football simply sorts to the top of the one
          list that remains.
        */}

        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0 space-y-6">
            {/* The day, everywhere. Deliberately not behind the active
                competition's snapshot: a reader whose league is still loading
                is not owed a skeleton where the rest of the planet's football
                already is. */}
            {liveDay ? <MatchdayPanel day={liveDay} suffix={seasonSuffix} /> : <LoadingState />}
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
          <Rail label="Where to next" count={5}>
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
              eyebrow={competition.name}
              title="The table"
              stat={
                snapshot?.season.isCurrent && snapshot.season.currentMatchweek
                  ? `${snapshot.season.currentMatchweek}/${snapshot.season.totalMatchweeks ?? '—'}`
                  : undefined
              }
              statLabel="matchweek"
              // The briefing's headline, compressed to the one line that makes
              // this door worth opening. The full thing is on the page behind it.
              note={briefing?.headline ?? 'Standings, form, and how the season has moved.'}
            />
            {insights.length ? (
              <Door
                href={`/storylines${seasonSuffix}`}
                eyebrow={competition.name}
                title="Storylines"
                stat={String(insights.length)}
                statLabel="stories"
                note={insights[0]?.title ?? 'What is being decided, and who decides it.'}
              />
            ) : null}
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
          </Rail>
        </div>
      </div>
    </AppShell>
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
