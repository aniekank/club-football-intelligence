import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { XgRace } from '@/components/charts/XgRace';
import { ShotMap } from '@/components/charts/ShotMap';
import { Momentum } from '@/components/charts/Momentum';
import { Lineups } from '@/components/match/Lineups';
import {
  Card, CardHeader, Crest, Figure, LiveBadge, Badge, EmptyState, EstimateMark,
} from '@/components/ui';
import { resolveActive } from '@/server/active';
import { num, int, pct } from '@/lib/format';
import { LocalTime } from '@/components/ui/LocalTime';
import { predictMatch } from '@/analytics/poisson';
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
          />
        )}
      </div>
    </AppShell>
  );
}

function MatchDetail({
  match, home, away, competitionName, hasMomentum,
}: {
  match: Match;
  home: Team | undefined;
  away: Team | undefined;
  competitionName: string;
  hasMomentum: boolean;
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

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3">
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
          <Card>
            <CardHeader eyebrow="Expected goals" title="The xG race" />
            <div className="p-4">
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
          </Card>

          <Card>
            <CardHeader eyebrow="Chances" title="Shot map" />
            <div className="p-4">
              <ShotMap
                shots={match.shots}
                homeTeamId={home.id}
                homeName={home.shortName}
                awayName={away.shortName}
              />
            </div>
          </Card>
        </div>
      ) : null}

      {hasMomentum && match.momentum?.length && home && away ? (
        <Card>
          <CardHeader eyebrow="Flow" title="Momentum" />
          <div className="p-4">
            <Momentum
              data={match.momentum}
              homeName={home.shortName}
              awayName={away.shortName}
            />
          </div>
        </Card>
      ) : null}

      {match.lineups && Object.keys(match.lineups).length && home && away ? (
        <Card>
          <CardHeader eyebrow="Teams" title="Line-ups" />
          <div className="p-4">
            <Lineups
              home={home}
              away={away}
              lineups={match.lineups}
              formations={match.formations}
              competitionId={match.competitionId}
            />
          </div>
        </Card>
      ) : null}

      {homeStats && awayStats ? (
        <Card>
          <CardHeader eyebrow="Match stats" title="Head to head" />
          <div className="max-w-2xl p-4">
            <StatComparison
              homeName={home?.shortName ?? 'Home'}
              awayName={away?.shortName ?? 'Away'}
              home={homeStats}
              away={awayStats}
            />
          </div>
        </Card>
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
function OutcomeBar({
  homeName, awayName, homeWin, draw, awayWin,
}: {
  homeName: string; awayName: string;
  homeWin: number; draw: number; awayWin: number;
}) {
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-sm" role="img"
        aria-label={`${homeName} win ${pct(homeWin)}, draw ${pct(draw)}, ${awayName} win ${pct(awayWin)}`}>
        {/* A 2px surface gap between segments keeps the boundaries readable
            without a border eating into the values. */}
        <span
          className="flex items-center justify-start pl-2 text-2xs font-semibold text-brand-ink"
          style={{ width: `${homeWin * 100}%`, background: 'var(--series-1)' }}
        >
          {homeWin > 0.12 ? pct(homeWin) : ''}
        </span>
        <span aria-hidden="true" className="w-[2px] shrink-0 bg-surface-1" />
        <span
          className="flex items-center justify-center text-2xs font-semibold text-ink"
          style={{ width: `${draw * 100}%`, background: 'var(--surface-3)' }}
        >
          {draw > 0.12 ? pct(draw) : ''}
        </span>
        <span aria-hidden="true" className="w-[2px] shrink-0 bg-surface-1" />
        <span
          className="flex items-center justify-end pr-2 text-2xs font-semibold text-brand-ink"
          style={{ width: `${awayWin * 100}%`, background: 'var(--series-2)' }}
        >
          {awayWin > 0.12 ? pct(awayWin) : ''}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-2xs text-ink-muted">
        <span>{homeName}</span>
        <span>Draw</span>
        <span>{awayName}</span>
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
