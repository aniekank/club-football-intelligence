import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, Figure, EmptyState, Skeleton, Crest } from '@/components/ui';
import { Disclosure } from '@/components/ui/Disclosure';
import {
  RoundHighlights, RoundGrid, RoundMovers, RoundLines, ResultSplit, RoundBadge,
  RoundDates, roundHint,
} from '@/components/match/Round';
import { buildRounds, latestPlayedRound, nextRound, type Round } from '@/analytics/rounds';
import { buildProgression } from '@/analytics/progression';
import { predictMatch } from '@/analytics/poisson';
import { resolveActive } from '@/server/active';
import { entitySuffix } from '@/lib/entityLink';
import { pct } from '@/lib/format';
import type { DatasetSnapshot, ID, Team } from '@/domain/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fixtures' };

/**
 * The season, one round at a time.
 *
 * ── What was wrong with the list ───────────────────────────────────────────
 * This page used to render a hundred and twenty fixture cards in a three-column
 * grid with a date heading every so often. Every match had identical weight, so
 * the reader did the editing: scrolling past nine ordinary results to find the
 * one that mattered, and holding two league tables in their head to work out
 * what any of it changed.
 *
 * ── One round is open; the rest are a line each ────────────────────────────
 * A round is the unit football is actually played and discussed in, so exactly
 * one of them gets the full treatment — the last one played, or the next one
 * coming. It opens with what the round WAS (goals, the split of results, the
 * two or three matches worth naming) and closes with what it DID (who moved,
 * and from where to where). Every other round collapses to a summary line
 * carrying enough to decide whether to open it.
 *
 * ── The forward view asks a different question ─────────────────────────────
 * A round that has been played is summarised; a round that has not can only be
 * previewed, so the fixtures view leads with the model's tightest fixture
 * instead of a goal count. Same page, two honest jobs.
 */

/** Folded rounds render into the DOM whether open or not; this bounds that. */
const FOLDED_LIMIT = 15;

export default function FixturesPage({
  searchParams,
}: {
  searchParams: { competition?: string; season?: string; view?: string };
}) {
  const { competition, snapshot, available, editions, edition } =
    resolveActive(searchParams.competition, searchParams.season);
  const suffix = entitySuffix(competition.id, searchParams.season);
  const showResults = searchParams.view === 'results';

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="eyebrow">
            {competition.name}
            {snapshot ? ` · ${snapshot.season.label}` : ''}
          </p>
          <div className="flex gap-1">
            <Toggle href={`/fixtures${suffix}`} active={!showResults}>Fixtures</Toggle>
            <Toggle href={`/fixtures${suffix}&view=results`} active={showResults}>Results</Toggle>
          </div>
        </div>

        {!snapshot ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[5rem]" />)}
          </div>
        ) : (
          <Season snapshot={snapshot} showResults={showResults} suffix={suffix} />
        )}
      </div>
    </AppShell>
  );
}

function Season({
  snapshot, showResults, suffix,
}: {
  snapshot: DatasetSnapshot;
  showResults: boolean;
  suffix: string;
}) {
  const progression = buildProgression(snapshot);
  const rounds = buildRounds(snapshot, progression);
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));

  const focus = showResults ? latestPlayedRound(rounds) : nextRound(rounds) ?? rounds[0];

  if (!focus) {
    return (
      <Card>
        <EmptyState
          title={showResults ? 'No results yet' : 'No scheduled fixtures'}
          description={
            showResults
              ? 'Nothing in this competition has been played.'
              : 'Every fixture in this competition has been played.'
          }
        />
      </Card>
    );
  }

  // Results read backwards from the last round played; fixtures read forwards
  // from the next one. The same list, walked from opposite ends.
  const rest = rounds.filter((r) => r.key !== focus.key);
  const others = (showResults
    ? rest.filter((r) => r.from <= focus.from)
    : rest.filter((r) => r.from >= focus.from).reverse());

  return (
    <>
      <FocusRound
        round={focus}
        teamById={teamById}
        suffix={suffix}
        showResults={showResults}
      />

      {showResults && focus.highlights.length ? (
        <section>
          <h2 className="eyebrow mb-3">What happened</h2>
          <RoundHighlights highlights={focus.highlights} teamById={teamById} suffix={suffix} />
        </section>
      ) : null}

      <section>
        <h2 className="eyebrow mb-3">
          {focus.matches.length} {focus.matches.length === 1 ? 'match' : 'matches'}
        </h2>
        <RoundGrid round={focus} teamById={teamById} suffix={suffix} />
      </section>

      {showResults && focus.movers.length ? (
        <Disclosure
          title="What it did to the table"
          hint={`${focus.movers.length} ${focus.movers.length === 1 ? 'club moved' : 'clubs moved'}`}
        >
          <RoundMovers movers={focus.movers} suffix={suffix} />
        </Disclosure>
      ) : null}

      {others.length ? (
        <section className="space-y-2">
          <h2 className="eyebrow">
            {showResults ? 'Earlier rounds' : 'Later rounds'}
          </h2>
          {others.slice(0, FOLDED_LIMIT).map((r) => (
            <Disclosure key={r.key} title={r.label} hint={roundHint(r)}>
              <RoundLines round={r} teamById={teamById} suffix={suffix} />
              {r.movers.length ? (
                <div className="mt-4 border-t border-border-subtle pt-4">
                  <h3 className="eyebrow mb-2">Table movement</h3>
                  <RoundMovers movers={r.movers} suffix={suffix} />
                </div>
              ) : null}
            </Disclosure>
          ))}
          {others.length > FOLDED_LIMIT ? (
            <p className="px-1 text-2xs text-ink-muted">
              {others.length - FOLDED_LIMIT} further{' '}
              {others.length - FOLDED_LIMIT === 1 ? 'round is' : 'rounds are'} not
              listed. Each open round keeps its matches in the page whether it is
              expanded or not, so the list is bounded rather than rendering a
              whole season at once.
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function FocusRound({
  round, teamById, suffix, showResults,
}: {
  round: Round;
  teamById: Map<ID, Team>;
  suffix: string;
  showResults: boolean;
}) {
  return (
    <Card className="lit-edge relative isolate overflow-hidden">
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-8">
        <div className="min-w-0">
          <p className="eyebrow flex flex-wrap items-center gap-2">
            <span><RoundDates round={round} /></span>
            <RoundBadge round={round} />
          </p>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
            {round.label}
          </h1>
          {showResults ? (
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-secondary">
              {round.played} of {round.matches.length}{' '}
              {round.matches.length === 1 ? 'match' : 'matches'} played
              {round.goals !== null ? `, ${round.goals} goals` : ''}.
            </p>
          ) : (
            <Preview round={round} teamById={teamById} suffix={suffix} />
          )}
        </div>

        {showResults ? (
          round.goals !== null ? (
            <div className="text-right">
              <p className="eyebrow">Goals</p>
              <Figure className="block font-display text-5xl leading-none">
                {round.goals}
              </Figure>
            </div>
          ) : null
        ) : (
          <div className="text-right">
            <p className="eyebrow">Fixtures</p>
            <Figure className="block font-display text-5xl leading-none">
              {round.matches.length}
            </Figure>
          </div>
        )}
      </div>

      {showResults && round.played > 0 ? (
        <div className="border-t border-border-subtle p-4">
          <ResultSplit round={round} />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * The one thing worth saying about a round nobody has played yet.
 *
 * A goal count is not available and a preview of ten fixtures is ten previews,
 * so this names the single tightest fixture on the model — the one where the
 * three probabilities come closest to each other. It is a forward-looking
 * claim made from information that exists before kick-off, which is the only
 * kind this page is willing to make.
 */
function Preview({
  round, teamById, suffix,
}: {
  round: Round;
  teamById: Map<ID, Team>;
  suffix: string;
}) {
  const scored = round.matches.flatMap((m) => {
    if (m.homeScore !== null) return [];
    const home = teamById.get(m.homeTeamId);
    const away = teamById.get(m.awayTeamId);
    if (!home || !away) return [];
    const p = predictMatch(home, away, { venueKind: m.venueKind });
    // Distance from a three-way coin flip. Lower is tighter.
    const spread = Math.max(p.homeWin, p.draw, p.awayWin) - Math.min(p.homeWin, p.draw, p.awayWin);
    return [{ m, home, away, p, spread }];
  });

  const tightest = scored.sort((a, b) => a.spread - b.spread)[0];

  if (!tightest) {
    return (
      <p className="mt-3 text-sm text-ink-secondary">
        {round.matches.length} {round.matches.length === 1 ? 'fixture' : 'fixtures'} to come.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="eyebrow">Tightest on the model</p>
      <Link
        href={`/matches/${tightest.m.id}${suffix}`}
        className="mt-2 inline-flex flex-wrap items-center gap-x-3 gap-y-2 text-lg transition-colors duration-fast ease-standard hover:text-brand"
      >
        <span className="inline-flex items-center gap-2">
          <Crest url={tightest.home.crestUrl} code={tightest.home.code} name={tightest.home.name} size={22} />
          {tightest.home.shortName}
        </span>
        <span className="text-sm text-ink-muted">v</span>
        <span className="inline-flex items-center gap-2">
          <Crest url={tightest.away.crestUrl} code={tightest.away.code} name={tightest.away.name} size={22} />
          {tightest.away.shortName}
        </span>
      </Link>
      <p className="mt-2 text-sm text-ink-secondary">
        <Figure>{pct(tightest.p.homeWin)}</Figure> home ·{' '}
        <Figure>{pct(tightest.p.draw)}</Figure> draw ·{' '}
        <Figure>{pct(tightest.p.awayWin)}</Figure> away — the closest three-way
        split in the round.
      </p>
    </div>
  );
}

function Toggle({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'rounded-sm bg-surface-3 px-3 py-1 text-xs font-semibold text-ink'
          : 'rounded-sm px-3 py-1 text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink'
      }
    >
      {children}
    </Link>
  );
}
