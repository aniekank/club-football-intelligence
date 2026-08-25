import type { DatasetSnapshot, ID } from '@/domain/types';

/**
 * Who could decide a fixture.
 *
 * ── The floor is a SHARE, not a number of minutes ──────────────────────────
 * Ranked on totals, the list is whoever has played most; ranked on raw per-90,
 * it is whoever has played least — a substitute with one goal in fifty minutes
 * tops any regular alive. So candidates must clear a workload floor first, and
 * the floor is a share of the heaviest workload in the competition rather than
 * a fixed number, which makes it mean "a regular" whether the snapshot covers
 * three matches or thirty-eight.
 *
 * Deliberately NOT the same floor as `minutesFloor` in `@/server/players`.
 * That one gates percentile peer groups, where the goal is a large enough
 * comparison pool and the bar is low. This one names two or three players on
 * the front of a fixture, where the bar should be high. Two floors because
 * there are two questions — but one ranking function, because there is only
 * one answer to "who is producing".
 */

export interface WatchPlayer {
  playerId: ID;
  name: string;
  teamId: ID;
  position: string;
  goals: number;
  assists: number;
  /** Goal involvements per 90 minutes. */
  per90: number;
}

/** A regular: 45% of the minutes of the most-used player in the competition. */
export const REGULAR_MINUTES_SHARE = 0.45;

export function regularFloor(snapshot: DatasetSnapshot): number {
  const max = snapshot.playerStats.reduce((m, s) => Math.max(m, s.minutes), 0);
  return max * REGULAR_MINUTES_SHARE;
}

export function playersToWatch(
  snapshot: DatasetSnapshot,
  teamId: ID,
  floor: number,
  limit: number,
): WatchPlayer[] {
  const playerById = new Map(snapshot.players.map((p) => [p.id, p]));
  return snapshot.playerStats
    .flatMap((s) => {
      const player = playerById.get(s.playerId);
      if (!player || player.teamId !== teamId) return [];
      if (s.minutes < floor) return [];
      const involvement = s.goals + s.assists;
      // Nobody is "one to watch" on nothing. A zero here is a real zero, not a
      // missing value, so it is a legitimate exclusion rather than a hidden one.
      if (involvement < 1) return [];
      return [{
        playerId: s.playerId,
        name: player.name,
        teamId,
        position: player.position,
        goals: s.goals,
        assists: s.assists,
        per90: (involvement * 90) / s.minutes,
      }];
    })
    .sort((a, b) => b.per90 - a.per90)
    .slice(0, limit);
}
