import Link from 'next/link';
import { Figure } from '@/components/ui';
import { cn } from '@/lib/cn';
import { playerHref } from '@/lib/entityLink';
import type { MatchEvent, Team } from '@/domain/types';

/**
 * The match timeline.
 *
 * A centre spine with each side's events on their own half, so the flow of a
 * match reads down the page and possession of an event is obvious from which
 * side it sits on. Icons are text glyphs rather than colour swatches, because a
 * goal and a yellow card must remain distinguishable in monochrome and to a
 * reader who cannot separate the hues.
 *
 * Substitutions are collapsed behind a toggle by default. A busy match has
 * eighteen of them and three goals; showing all twenty-one at equal weight
 * buries the only ones anybody came for.
 */

const GLYPH: Record<string, string> = {
  GOAL: '⚽',
  PENALTY_GOAL: '⚽',
  OWN_GOAL: '⚽',
  YELLOW_CARD: '▮',
  SECOND_YELLOW: '▮▮',
  RED_CARD: '▮',
  SUBSTITUTION: '⇄',
  VAR: 'VAR',
};

const LABEL: Record<string, string> = {
  GOAL: 'Goal',
  PENALTY_GOAL: 'Penalty',
  OWN_GOAL: 'Own goal',
  YELLOW_CARD: 'Yellow card',
  SECOND_YELLOW: 'Second yellow',
  RED_CARD: 'Red card',
  SUBSTITUTION: 'Substitution',
  VAR: 'VAR review',
};

const isGoal = (t: string) => t === 'GOAL' || t === 'PENALTY_GOAL' || t === 'OWN_GOAL';

/** Split "Scorer (pen) assist by Someone" into its two lines. */
function splitDetail(detail: string): [string, string | null] {
  const i = detail.indexOf(' assist by ');
  if (i === -1) return [detail, null];
  return [detail.slice(0, i), detail.slice(i + 1)];
}

export function Timeline({
  events, home, away, competitionId, seasonParam, knownPlayerIds,
}: {
  events: MatchEvent[];
  home: Team | undefined;
  away: Team | undefined;
  competitionId: string;
  seasonParam?: string;
  /** Ids that actually have a player page in this snapshot. */
  knownPlayerIds: Set<string>;
}) {
  if (!events.length) return null;
  const suffix = seasonParam
    ? `?competition=${competitionId}&season=${seasonParam}`
    : `?competition=${competitionId}`;

  const key = events.filter((e) => e.type !== 'SUBSTITUTION');
  const subs = events.filter((e) => e.type === 'SUBSTITUTION');

  return (
    <div>
      <ol className="relative">
        {/* The spine. Decorative — the row layout already carries the side. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle"
        />
        {key.map((e) => (
          <Row key={e.id} event={e} home={home} away={away} suffix={suffix} knownPlayerIds={knownPlayerIds} />
        ))}
      </ol>

      {subs.length ? (
        <details className="group mt-3 border-t border-border-subtle pt-3">
          <summary className="cursor-pointer list-none text-2xs uppercase tracking-caps text-ink-muted transition-colors duration-fast ease-standard hover:text-ink-secondary">
            <span className="group-open:hidden">Show {subs.length} substitutions</span>
            <span className="hidden group-open:inline">Hide substitutions</span>
          </summary>
          <ol className="relative mt-2">
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle"
            />
            {subs.map((e) => (
              <Row key={e.id} event={e} home={home} away={away} suffix={suffix} knownPlayerIds={knownPlayerIds} muted />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function Row({
  event, home, away, suffix, knownPlayerIds, muted,
}: {
  event: MatchEvent;
  home: Team | undefined;
  away: Team | undefined;
  suffix: string;
  knownPlayerIds: Set<string>;
  muted?: boolean;
}) {
  const isHome = event.teamId === home?.id;
  const goal = isGoal(event.type);
  const red = event.type === 'RED_CARD' || event.type === 'SECOND_YELLOW';

  // The assist goes on its own line rather than competing for width with the
  // scorer. Truncating it produced "Kai Havertz assist by Riccardo Cal…", which
  // loses the one piece of information the second half of the string carried.
  const [primary, assistPart] = splitDetail(event.detail);

  const content = (
    <span
      className={cn(
        'inline-flex max-w-full items-start gap-2',
        isHome ? 'flex-row' : 'flex-row-reverse',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'shrink-0 pt-0.5 text-xs leading-none',
          event.type === 'YELLOW_CARD' && 'text-status-warning',
          red && 'text-status-critical',
          event.type === 'SUBSTITUTION' && 'text-ink-muted',
        )}
      >
        {GLYPH[event.type] ?? '•'}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-sm leading-snug',
            goal && 'font-semibold',
            muted && 'text-ink-secondary',
          )}
        >
          {primary}
        </span>
        {assistPart ? (
          <span className="block text-2xs leading-snug text-ink-muted">{assistPart}</span>
        ) : null}
      </span>
    </span>
  );

  // Linked only when the player has a page in this snapshot — a scorer whose
  // season stats were never ingested is still named, just not clickable.
  const href = playerHref(event.playerId, knownPlayerIds, suffix);
  const linked = href ? (
    <Link href={href} className="rounded-sm underline-offset-2 hover:underline">
      {content}
    </Link>
  ) : (
    content
  );

  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 py-1.5">
      <span className={cn('min-w-0 text-right', !isHome && 'invisible')}>
        {isHome ? linked : null}
      </span>

      <span className="relative z-0 flex w-10 justify-center">
        <Figure
          tone="muted"
          className={cn(
            'rounded-pill bg-canvas px-1 text-2xs',
            goal && 'font-semibold text-ink',
          )}
        >
          {event.minute}
          {event.addedTime ? `+${event.addedTime}` : ''}&apos;
        </Figure>
      </span>

      <span className={cn('min-w-0 text-left', isHome && 'invisible')}>
        {!isHome ? linked : null}
      </span>

      <span className="sr-only">
        {LABEL[event.type] ?? event.type} for {isHome ? home?.name : away?.name} at{' '}
        {event.minute} minutes: {event.detail}
      </span>
    </li>
  );
}

/**
 * The compact scorer line for a match card.
 *
 * The one thing a result absolutely must carry. Kept to names and minutes —
 * anything more competes with the score itself.
 */
export function ScorerLine({
  events, homeTeamId,
}: {
  events: MatchEvent[];
  homeTeamId: string;
}) {
  const goals = events.filter((e) => isGoal(e.type));
  if (!goals.length) return null;

  const side = (wantHome: boolean) =>
    goals
      .filter((e) => (e.teamId === homeTeamId) === wantHome)
      .map((e) => {
        // The detail already carries "(og)"/"(pen)" and any assist; a card only
        // has room for who and when.
        const name = e.detail.split(' assist')[0] ?? e.detail;
        return `${name} ${e.minute}'`;
      });

  const homeScorers = side(true);
  const awayScorers = side(false);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 border-t border-border-subtle pt-2 text-2xs text-ink-muted">
      <ul className="min-w-0 space-y-px">
        {homeScorers.map((s) => (
          <li key={s} className="truncate">{s}</li>
        ))}
      </ul>
      <span aria-hidden="true" className="px-1">⚽</span>
      <ul className="min-w-0 space-y-px text-right">
        {awayScorers.map((s) => (
          <li key={s} className="truncate">{s}</li>
        ))}
      </ul>
    </div>
  );
}
