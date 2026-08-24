import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { XgRace } from '@/components/charts/XgRace';
import { ShotMap } from '@/components/charts/ShotMap';
import { Momentum } from '@/components/charts/Momentum';
import { Lineups } from '@/components/match/Lineups';
import { Timeline } from '@/components/match/Timeline';
import {
  Card, CardHeader, Crest, Figure, LiveBadge, Badge, EmptyState, EstimateMark,
} from '@/components/ui';
import { resolveActive } from '@/server/active';
import { num, int, pct } from '@/lib/format';
import { LocalTime } from '@/components/ui/LocalTime';
import { predictMatch } from '@/analytics/poisson';
import { EmbossedCrest } from '@/components/team/EmbossedCrest';
import { clubWash, tooSimilar } from '@/lib/clubColor';
import { cn } from '@/lib/cn';
import { Disclosure } from '@/components/ui/Disclosure';
import type { Match, MatchTeamStats, Team } from '@/domain/types';

export const dynamic = 'force-dynamic';

export default function MatchPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { competition?: string; season?: string };
}) {
  const { competition, snapshot, available, editions, edition } = resolveActive(searchParams.competition, searchParams.season);
  const match = snapshot?.matches.find((m) => m.id === params.id);

  // Before the snapshot lands there is nothing to 404 ON — the match may exist
  // perfectly well and simply not be loaded yet, so this renders a shell rather
  // than a hard not-found.
  if (snapshot && !match) notFound();

  const home = match ? snapshot?.teams.find((t) => t.id === match.homeTeamId) : undefined;
  const away = match ? snapshot?.teams.find((t) => t.id === match.awayTeamId) : undefined;
  // A lineup names everyone who was on the teamsheet; only those with season
  // stats in this snapshot have a page to link to.
  const knownPlayerIds = new Set((snapshot?.players ?? []).map((p) => p.id));

  return (
    <AppShell
      competitions={available}
      activeId={competition.id}
      editions={editions}
      activeEditionKey={edition?.key}
    >
      <div className="mx-auto max-w-container px-4 py-6">
        {!match || !snapshot ? (
          <EmptyState title="Loading match" description="Fetching the latest data." />
        ) : (
          <MatchDetail
            match={match}
            home={home}
            away={away}
            competitionName={snapshot.competition.name}
            hasMomentum={snapshot.meta.capabilities.hasMomentum}
            knownPlayerIds={knownPlayerIds}
          />
        )}
      </div>
    </AppShell>
  );
}

function MatchDetail({
  match, home, away, competitionName, hasMomentum, knownPlayerIds,
}: {
  match: Match;
  home: Team | undefined;
  away: Team | undefined;
  competitionName: string;
  hasMomentum: boolean;
  /** Ids with a player page in this snapshot; a teamsheet names more than that. */
  knownPlayerIds: Set<string>;
}) {
  const isLive = match.status === 'LIVE' || match.status === 'HALFTIME';
  const played = match.homeScore !== null && match.awayScore !== null;
  const homeStats = home ? match.teamStats[home.id] : undefined;
  const awayStats = away ? match.teamStats[away.id] : undefined;
  const hasShots = match.shots.length > 0;

  // For an unplayed fixture the model IS the content — that is the whole
  // proposition. For a played one it would just be noise beside the result.
  const preview =
    !played && home && away
      ? predictMatch(home, away, { venueKind: match.venueKind })
      : null;

  /**
   * The head-to-head accent.
   *
   * Two clubs, so the hero is built as a CLASH rather than a card with a
   * scoreline in it: each side's colour washes in from its own edge and each
   * club's crest is embossed bleeding off that same edge, so the page has a
   * left and a right before you have read a word.
   *
   * Three constraints shape it, and all three are about not breaking the thing
   * the reader came for.
   *
   * The gradient is TRANSPARENT THROUGH THE MIDDLE — the colour stops at 40%
   * and resumes at 60%, and the score lives in that gap. Legibility of the
   * scoreline never depends on a brand palette we do not control.
   *
   * The alpha is scaled by how light each colour is (see `clubWash`), because
   * these come from a feed: Real Madrid's white and Juventus's black are both
   * in here, and one of them will wash out a dark card at any fixed alpha.
   *
   * And when both clubs are effectively the same colour — Liverpool against
   * Manchester United — the split is dropped entirely. A red-to-red gradient
   * communicates nothing and just makes the card muddy; a real derby is better
   * served by no accent than by a meaningless one.
   */
  const clash = !tooSimilar(home?.primaryColor ?? null, away?.primaryColor ?? null);
  const homeWash = clash ? clubWash(home?.primaryColor ?? null) : 'transparent';
  const awayWash = clash ? clubWash(away?.primaryColor ?? null) : 'transparent';

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative isolate overflow-hidden">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20"
          style={{
            background: `linear-gradient(100deg, ${homeWash} 0%, transparent 40%, transparent 60%, ${awayWash} 100%)`,
          }}
        />
        {/* Ghosted marks — recognition at a glance, ignorable at a read. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[-4rem] top-1/2 -z-10 hidden -translate-y-1/2 sm:block"
        >
          <EmbossedCrest url={home?.crestUrl ?? null} size={210} opacity={0.24} />
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[-4rem] top-1/2 -z-10 hidden -translate-y-1/2 sm:block"
        >
          <EmbossedCrest url={away?.crestUrl ?? null} size={210} opacity={0.24} />
        </span>
        {/* Opaque on purpose: the embossed marks bleed through the hero behind
            this, and a competition name over a relief is harder to read than it
            has any need to be. The clash belongs on the scoreline row. */}
        <div className="relative border-b border-border-subtle bg-surface-1 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">
              {competitionName} · {match.roundLabel}
            </p>
            <p className="text-xs text-ink-muted">
              <LocalTime iso={match.kickoff} mode="datetime" />
              {match.venue ? ` · ${match.venue}` : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-6">
          <TeamHero team={home} align="start" />
          <div className="flex flex-col items-center gap-2">
            {isLive ? (
              <LiveBadge
                minute={match.minute}
                phase={match.status === 'HALFTIME' ? 'HT' : match.livePhase}
              />
            ) : null}
            {played ? (
              <Figure className="text-4xl font-bold leading-none sm:text-5xl">
                {match.homeScore}–{match.awayScore}
              </Figure>
            ) : match.status === 'POSTPONED' || match.status === 'CANCELLED' ? (
              <Badge tone="warning">
                {match.status === 'POSTPONED' ? 'Postponed' : 'Cancelled'}
              </Badge>
            ) : (
              <Figure className="text-3xl font-semibold leading-none text-ink-secondary">
                <LocalTime iso={match.kickoff} />
              </Figure>
            )}
            {match.status === 'FINISHED' ? (
              <span className="text-2xs uppercase tracking-caps text-ink-muted">Full time</span>
            ) : null}
          </div>
          <TeamHero team={away} align="end" />
        </div>
      </Card>

      {/* Goals, cards and substitutions. Placed directly under the score
          because it answers the first question anyone asks of a result. */}
      {match.events.length ? (
        <Card>
          <CardHeader eyebrow="Timeline" title="How it happened" />
          <div className="mx-auto max-w-3xl p-4">
            <Timeline
              events={match.events}
              home={home}
              away={away}
              competitionId={match.competitionId}
              knownPlayerIds={knownPlayerIds}
            />
          </div>
        </Card>
      ) : null}

      {/* The model's view, for a fixture not yet played. */}
      {preview ? (
        <Card>
          <CardHeader
            eyebrow="Model"
            title="Match forecast"
            description="Bivariate-Poisson goal model, from current strength ratings and home advantage."
          />
          <div className="space-y-4 p-4">
            <OutcomeBar
              homeName={home?.shortName ?? 'Home'}
              awayName={away?.shortName ?? 'Away'}
              homeWin={preview.homeWin}
              draw={preview.draw}
              awayWin={preview.awayWin}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Expected goals" value={`${num(preview.expectedGoals.home, 2)} – ${num(preview.expectedGoals.away, 2)}`} />
              <MiniStat label="Over 2.5" value={pct(preview.over25Prob)} />
              <MiniStat label="Both to score" value={pct(preview.bttsProb)} />
              <MiniStat label="Fair handicap" value={num(preview.fairHandicap, 2)} />
            </div>
            <div>
              <p className="eyebrow mb-2">Most likely scorelines</p>
              <ul className="flex flex-wrap gap-2">
                {preview.scoreline.slice(0, 5).map((s) => (
                  <li
                    key={`${s.home}-${s.away}`}
                    className="rounded-sm border border-border-subtle px-2 py-1 text-xs"
                  >
                    <Figure className="font-semibold">{s.home}–{s.away}</Figure>
                    <span className="ml-2 text-ink-muted">{pct(s.prob, 1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      {/* xG race + shot map, only where shot data exists. Capability-gated so a
          fixture without detail hides these rather than drawing empty axes. */}
      {hasShots && home && away ? (
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Disclosure
            title="The xG race"
            hint={`${match.shots.length} shots`}
          >
            <div>
              <XgRace
                shots={match.shots}
                homeTeamId={home.id}
                awayTeamId={away.id}
                homeName={home.shortName}
                awayName={away.shortName}
                homeGoals={match.homeScore}
                awayGoals={match.awayScore}
                height={260}
              />
            </div>
          </Disclosure>

          <Disclosure
            title="Shot map"
            hint={`${match.shots.filter((sh) => sh.outcome === 'goal').length} scored`}
          >
            <div>
              <ShotMap
                shots={match.shots}
                homeTeamId={home.id}
                homeName={home.shortName}
                awayName={away.shortName}
              />
            </div>
          </Disclosure>
        </div>
      ) : null}

      {hasMomentum && match.momentum?.length && home && away ? (
        <Disclosure title="Momentum" hint="Who was on top, minute by minute">
          <div>
            <Momentum
              data={match.momentum}
              homeName={home.shortName}
              awayName={away.shortName}
            />
          </div>
        </Disclosure>
      ) : null}

      {match.lineups && Object.keys(match.lineups).length && home && away ? (
        <Disclosure
          title="Line-ups"
          hint={`${Object.values(match.lineups).flat().length} players`}
        >
          <div>
            <Lineups
              home={home}
              away={away}
              lineups={match.lineups}
              formations={match.formations}
              competitionId={match.competitionId}
              knownPlayerIds={knownPlayerIds}
            />
          </div>
        </Disclosure>
      ) : null}

      {homeStats && awayStats ? (
        <Disclosure title="Head to head" hint="Possession, shots, discipline">
          <div className="max-w-2xl">
            <StatComparison
              homeName={home?.shortName ?? 'Home'}
              awayName={away?.shortName ?? 'Away'}
              home={homeStats}
              away={awayStats}
            />
          </div>
        </Disclosure>
      ) : null}
    </div>
  );
}

function TeamHero({ team, align }: { team: Team | undefined; align: 'start' | 'end' }) {
  return (
    <div
      className={
        align === 'end'
          ? 'flex min-w-0 flex-col items-center gap-2 sm:flex-row-reverse sm:text-right'
          : 'flex min-w-0 flex-col items-center gap-2 sm:flex-row'
      }
    >
      <Crest url={team?.crestUrl ?? null} code={team?.code ?? '?'} name={team?.name ?? 'TBD'} size={48} />
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-semibold leading-tight">
          {team?.name ?? 'To be decided'}
        </p>
        {team ? <p className="figure text-2xs text-ink-muted">{team.code}</p> : null}
      </div>
    </div>
  );
}

/** A single 100%-wide bar for the three-way outcome. One bar, one total. */
/**
 * The match forecast, as three shares of one bar.
 *
 * ── Numbers out of the bar ─────────────────────────────────────────────────
 * This was a 32px block with the percentages set INSIDE each segment, which
 * meant every value was hostage to its own width: a 9% draw had nowhere to put
 * "9%", so the bar hid it and the reader lost the number entirely. Moving the
 * figures above frees the bar to be a bar — 6px, doing one job — and every
 * value reads at the same size whether it is 9% or 61%.
 *
 * ── Colour is not club colour ──────────────────────────────────────────────
 * Club colours are now available and are deliberately NOT used here. Two clubs
 * in one chart can collide — a Liverpool-Forest bar would be red against red —
 * and neither palette is colour-vision validated. The series tokens are, and
 * position already carries which side is which.
 *
 * ── The likeliest outcome is emphasised ────────────────────────────────────
 * One of the three is what the model actually expects, and a reader scanning a
 * fixture list wants that in one glance. Weight says it; colour does not have
 * to, so the emphasis survives greyscale.
 */
function OutcomeBar({
  homeName, awayName, homeWin, draw, awayWin,
}: {
  homeName: string; awayName: string;
  homeWin: number; draw: number; awayWin: number;
}) {
  const parts = [
    { key: 'home', label: homeName, value: homeWin, fill: 'var(--series-1)', align: 'items-start text-left' },
    { key: 'draw', label: 'Draw', value: draw, fill: 'var(--border-strong)', align: 'items-center text-center' },
    { key: 'away', label: awayName, value: awayWin, fill: 'var(--series-2)', align: 'items-end text-right' },
  ] as const;
  const top = Math.max(homeWin, draw, awayWin);

  return (
    <div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.key} className={cn('flex min-w-0 flex-col', p.align)}>
            <span className="flex items-center gap-[0.375rem] truncate">
              <span
                aria-hidden="true"
                className="h-[0.375rem] w-[0.375rem] shrink-0 rounded-full"
                style={{ background: p.fill }}
              />
              <span className="eyebrow truncate">{p.label}</span>
            </span>
            <Figure
              className={cn(
                'text-xl leading-tight',
                p.value === top ? 'font-semibold text-ink' : 'text-ink-secondary',
              )}
            >
              {pct(p.value)}
            </Figure>
          </div>
        ))}
      </div>

      <div
        className="flex h-[0.375rem] w-full overflow-hidden rounded-pill"
        role="img"
        aria-label={`${homeName} win ${pct(homeWin)}, draw ${pct(draw)}, ${awayName} win ${pct(awayWin)}`}
      >
        {parts.map((p, i) => (
          <span key={p.key} className="flex h-full min-w-0" style={{ width: `${p.value * 100}%` }}>
            {/* A 2px surface gap keeps the boundaries readable without a border
                eating into the value it is meant to delimit. */}
            {i > 0 ? <span aria-hidden="true" className="w-[2px] shrink-0 bg-surface-1" /> : null}
            <span className="h-full flex-1 rounded-pill" style={{ background: p.fill }} />
          </span>
        ))}
      </div>
    </div>
  );
}

const STAT_ROWS: { key: keyof MatchTeamStats; label: string; digits?: number; estimate?: boolean }[] = [
  { key: 'xG', label: 'Expected goals', digits: 2 },
  { key: 'possession', label: 'Possession %' },
  { key: 'shots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'On target' },
  { key: 'bigChances', label: 'Big chances' },
  { key: 'corners', label: 'Corners' },
  { key: 'passes', label: 'Passes' },
  { key: 'passAccuracy', label: 'Pass accuracy %' },
  { key: 'fieldTilt', label: 'Field tilt %', digits: 1, estimate: true },
  { key: 'fouls', label: 'Fouls' },
  { key: 'yellowCards', label: 'Yellow cards' },
];

/**
 * Paired horizontal bars. Each row is normalised to the pair's own total, so a
 * row reads as share-of-contest rather than raw magnitude — the comparison a
 * reader is actually making. Rows whose metric is missing on BOTH sides are
 * dropped entirely rather than drawn as a pair of zeros.
 */
function StatComparison({
  homeName, awayName, home, away,
}: { homeName: string; awayName: string; home: MatchTeamStats; away: MatchTeamStats }) {
  const rows = STAT_ROWS.filter((r) => home[r.key] !== null || away[r.key] !== null);
  if (!rows.length) {
    return <EmptyState title="No detailed stats for this fixture" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-2xs uppercase tracking-caps text-ink-muted">
        <span>{homeName}</span>
        <span>{awayName}</span>
      </div>
      {rows.map((r) => {
        const h = (home[r.key] as number | null) ?? 0;
        const a = (away[r.key] as number | null) ?? 0;
        const total = h + a;
        const hShare = total > 0 ? (h / total) * 100 : 50;
        const fmt = (v: number | null) =>
          v === null ? '—' : r.digits ? v.toFixed(r.digits) : int(v);
        return (
          <div key={String(r.key)}>
            <div className="flex items-baseline justify-between text-xs">
              <Figure className="font-semibold">{fmt(home[r.key] as number | null)}</Figure>
              <span className="text-ink-secondary">
                {r.label}
                {r.estimate ? <EstimateMark /> : null}
              </span>
              <Figure className="font-semibold">{fmt(away[r.key] as number | null)}</Figure>
            </div>
            <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-inset">
              <span
                className="block h-full transition-[width] duration-slow ease-decelerate"
                style={{ width: `${hShare}%`, background: 'var(--series-1)' }}
              />
              <span aria-hidden="true" className="block h-full w-[2px] shrink-0 bg-surface-1" />
              <span
                className="block h-full transition-[width] duration-slow ease-decelerate"
                style={{ width: `${100 - hShare}%`, background: 'var(--series-2)' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border-subtle px-2 py-2">
      <p className="eyebrow">{label}</p>
      <p className="figure mt-px text-base font-semibold">{value}</p>
    </div>
  );
}
