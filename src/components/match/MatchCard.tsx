import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Crest, Figure, LiveBadge, Badge } from '@/components/ui';
import { num } from '@/lib/format';
import { LocalTime } from '@/components/ui/LocalTime';
import { ScorerLine } from './Timeline';
import type { Match, Team } from '@/domain/types';

/**
 * The match card — the most-repeated unit in the product, so it has to survive
 * every state a fixture can be in without changing height or shifting columns.
 *
 * The states that matter, and how each reads:
 *   SCHEDULED   kick-off time in the score slot
 *   LIVE        pulsing minute badge; the score is the loudest thing on the card
 *   HALFTIME    "HT" rather than a frozen 45'
 *   FINISHED    final score, dimmed clock
 *   POSTPONED   an explicit label — never a silent 0-0, which is exactly how a
 *               postponed fixture becomes a fake goalless draw in a fixture list
 *
 * Layout is a fixed three-column grid (home | score | away) rather than flex,
 * so scores stay in vertical register down a list of cards and a goal going in
 * never nudges the crests sideways.
 */
export function MatchCard({
  match, home, away, showCompetition, competitionName, href,
}: {
  match: Match;
  home: Team | undefined;
  away: Team | undefined;
  showCompetition?: boolean;
  competitionName?: string;
  href?: string;
}) {
  const isLive = match.status === 'LIVE' || match.status === 'HALFTIME';
  const isDone = match.status === 'FINISHED';
  const isOff = match.status === 'POSTPONED' || match.status === 'CANCELLED';
  const played = match.homeScore !== null && match.awayScore !== null;

  const homeXg = home ? match.teamStats[home.id]?.xG ?? null : null;
  const awayXg = away ? match.teamStats[away.id]?.xG ?? null : null;
  const hasXg = homeXg !== null || awayXg !== null;

  // The winning side reads at full strength; the losing side recedes. A subtle
  // cue that makes a column of results scannable without reading any digits.
  const homeWon = played && (match.homeScore as number) > (match.awayScore as number);
  const awayWon = played && (match.awayScore as number) > (match.homeScore as number);

  const body = (
    <article
      style={{ ['--lit-inset' as string]: 'var(--radius-md)' }}
      className={cn(
        'group relative flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-1 px-3 py-3',
        'lit-edge transition-[transform,background-color,border-color,box-shadow] duration-normal ease-standard',
        // The lift is conditional on `href` for a reason: raising a card that
        // cannot be opened promises an affordance that is not there.
        href && 'hover:-translate-y-px hover:border-border hover:bg-surface-2 hover:shadow-md',
        isLive && 'border-brand/30',
      )}
    >
      {showCompetition && competitionName ? (
        <p className="eyebrow truncate">{competitionName}</p>
      ) : null}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side team={home} align="start" dim={isDone && !homeWon} />

        <div className="flex min-w-[4.5rem] flex-col items-center gap-1">
          {isLive ? (
            <LiveBadge
              minute={match.minute}
              phase={match.status === 'HALFTIME' ? 'HT' : match.livePhase}
            />
          ) : null}

          {isOff ? (
            <Badge tone="warning">
              {match.status === 'POSTPONED' ? 'Postponed' : 'Cancelled'}
            </Badge>
          ) : played ? (
            <Figure
              className={cn(
                'text-2xl font-bold leading-none tabular-nums',
                isLive && 'text-brand',
              )}
            >
              {match.homeScore}–{match.awayScore}
            </Figure>
          ) : (
            <Figure tone="secondary" className="text-base leading-none">
              <LocalTime iso={match.kickoff} />
            </Figure>
          )}

          {isDone ? (
            <span className="text-2xs uppercase tracking-caps text-ink-muted">FT</span>
          ) : null}
        </div>

        <Side team={away} align="end" dim={isDone && !awayWon} />
      </div>

      {/* Who scored. The single most basic fact about a result, and the one
          this card shipped without. */}
      {played && match.events.length ? (
        <ScorerLine events={match.events} homeTeamId={match.homeTeamId} />
      ) : null}

      {hasXg ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-border-subtle pt-2">
          <Figure tone="muted" className="text-2xs">{num(homeXg, 2)}</Figure>
          <span className="text-2xs uppercase tracking-caps text-ink-muted">xG</span>
          <Figure tone="muted" className="text-right text-2xs">{num(awayXg, 2)}</Figure>
        </div>
      ) : null}
    </article>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block rounded-md focus-visible:shadow-focus">
      {body}
    </Link>
  );
}

function Side({
  team, align, dim,
}: { team: Team | undefined; align: 'start' | 'end'; dim: boolean }) {
  // A fixture whose participant has not resolved yet — a knockout tie awaiting
  // a winner, or a lookup during the boot window — renders as TBD rather than
  // crashing the page.
  const name = team?.shortName ?? 'TBD';
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2',
        align === 'end' && 'flex-row-reverse text-right',
        dim && 'opacity-60',
      )}
    >
      <Crest url={team?.crestUrl ?? null} code={team?.code ?? '?'} name={name} size={22} />
      <span className="truncate text-sm font-medium">{name}</span>
    </div>
  );
}
