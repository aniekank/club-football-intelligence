import type { EventType, ID, MatchEvent } from '@/domain/types';

/**
 * Match events — goals, cards, substitutions.
 *
 * This should have been in the first cut of the adapter. A football product
 * that shows "3-0" without naming the scorers has failed at the most basic
 * thing it exists to do; every other number on the page is downstream of a
 * fact the reader could not find.
 *
 * The data was there the whole time under `matchFacts.events`, and the shot
 * stream even carried the goals — they were simply never mapped.
 */

interface FmEventPlayer { id?: number | string | null; name?: string }

export interface FmMatchEvent {
  type?: string;
  time?: number;
  overloadTime?: number | null;
  isHome?: boolean;
  player?: FmEventPlayer;
  playerId?: number | string | null;
  nameStr?: string;
  fullName?: string;
  /** Goals */
  ownGoal?: boolean | null;
  goalDescription?: string | null;
  assistStr?: string | null;
  assistPlayerId?: number | string | null;
  assistInput?: string | null;
  newScore?: [number, number];
  isPenaltyShootoutEvent?: boolean;
  /** Cards */
  card?: string;
  cardDescription?: string | null;
  /** Substitutions: [on, off] */
  swap?: { id?: string | number; name?: string }[];
  injuredPlayerOut?: boolean;
}

export interface FmEventsBlock {
  events?: FmMatchEvent[];
}

/**
 * Classify a goal.
 *
 * The distinction is not cosmetic. An own goal belongs to the side that
 * BENEFITS on the scoreline but to the player who conceded it, and crediting it
 * as a normal goal would both flatter a defender and corrupt any top-scorer
 * list built from the event stream.
 */
function goalType(e: FmMatchEvent): EventType {
  if (e.ownGoal) return 'OWN_GOAL';
  const d = (e.goalDescription ?? '').toLowerCase();
  if (d.includes('penalty')) return 'PENALTY_GOAL';
  return 'GOAL';
}

function cardType(e: FmMatchEvent): EventType {
  const c = (e.card ?? '').toLowerCase();
  const desc = (e.cardDescription ?? '').toLowerCase();
  if (c.includes('red')) {
    return desc.includes('second') ? 'SECOND_YELLOW' : 'RED_CARD';
  }
  return 'YELLOW_CARD';
}

const id = (v: number | string | null | undefined): ID | null =>
  v === null || v === undefined || v === '' ? null : String(v);

/**
 * Map FotMob's event stream onto the domain.
 *
 * `isHome` is the only side marker in the payload, so the caller supplies the
 * two team ids. Half-time and added-time markers are dropped: they are display
 * furniture in FotMob's own timeline, not things that happened.
 */
export function mapEvents(
  block: FmEventsBlock | undefined,
  matchId: ID,
  homeTeamId: ID,
  awayTeamId: ID,
): MatchEvent[] {
  const raw = block?.events ?? [];
  const out: MatchEvent[] = [];

  for (let i = 0; i < raw.length; i++) {
    const e = raw[i] as FmMatchEvent;
    const type = e.type ?? '';
    if (type === 'Half' || type === 'AddedTime') continue;
    // A shoot-out is not part of the 90 and would corrupt the timeline's clock.
    if (e.isPenaltyShootoutEvent) continue;

    const teamId = e.isHome ? homeTeamId : awayTeamId;
    const minute = e.time ?? 0;
    const addedTime = e.overloadTime ?? 0;
    const key = `${matchId}-e${i}`;

    if (type === 'Goal') {
      const scorer = e.nameStr ?? e.fullName ?? e.player?.name ?? 'Unknown';
      const assist = e.assistStr ?? e.assistInput ?? null;
      const kind = goalType(e);
      out.push({
        id: key,
        matchId,
        minute,
        addedTime,
        type: kind,
        // An own goal counts FOR the other side on the scoreline, and this is
        // the team the goal is credited to in the timeline.
        teamId,
        playerId: id(e.playerId ?? e.player?.id),
        relatedPlayerId: id(e.assistPlayerId),
        // `assistStr` already reads "assist by X" — prefixing another "assist"
        // produced "assist assist by Harrison Armstrong".
        detail: [
          scorer,
          kind === 'OWN_GOAL' ? '(og)' : kind === 'PENALTY_GOAL' ? '(pen)' : '',
          assist ?? '',
        ]
          .filter(Boolean)
          .join(' '),
      });
      continue;
    }

    if (type === 'Card') {
      out.push({
        id: key,
        matchId,
        minute,
        addedTime,
        type: cardType(e),
        teamId,
        playerId: id(e.playerId ?? e.player?.id),
        relatedPlayerId: null,
        detail: e.nameStr ?? e.fullName ?? e.player?.name ?? 'Unknown',
      });
      continue;
    }

    if (type === 'Substitution') {
      // swap is [coming on, going off]. Getting these the wrong way round
      // reverses every substitution in the match.
      const on = e.swap?.[0];
      const off = e.swap?.[1];
      out.push({
        id: key,
        matchId,
        minute,
        addedTime,
        type: 'SUBSTITUTION',
        teamId,
        playerId: id(on?.id),
        relatedPlayerId: id(off?.id),
        detail: `${on?.name ?? '?'} on for ${off?.name ?? '?'}${e.injuredPlayerOut ? ' (injury)' : ''}`,
      });
    }
  }

  return out.sort((a, b) => a.minute - b.minute || a.addedTime - b.addedTime);
}

/** The goals only, in order — what a match card needs. */
export function goalEvents(events: MatchEvent[]): MatchEvent[] {
  return events.filter(
    (e) => e.type === 'GOAL' || e.type === 'OWN_GOAL' || e.type === 'PENALTY_GOAL',
  );
}
