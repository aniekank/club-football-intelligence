import { computeStandings } from './standings';
import type { DatasetSnapshot, ID, ZoneKind } from '@/domain/types';

/**
 * Where every club stood after every matchweek.
 *
 * ── Recomputed, not recorded ───────────────────────────────────────────────
 * No feed here publishes a position history, so it is rebuilt by running the
 * standings engine over a growing prefix of the season — matchweek 1, then 1-2,
 * and so on. That has a real benefit beyond availability: the history obeys
 * THIS competition's tiebreakers, so a club shown 4th in week nine is 4th by
 * the rule that league actually uses. A stored history from a vendor would
 * carry whatever rule the vendor applied.
 *
 * ── Only completed matchweeks ──────────────────────────────────────────────
 * A round in progress produces a table that is not the table anyone stood in.
 * Half a matchweek played shows clubs who have played one more game than their
 * rivals sitting above them, which is not a position, it is an artefact. A
 * matchweek is included only once every fixture in it has finished.
 */

export interface RankPoint {
  matchweek: number;
  position: number;
  points: number;
  zone: ZoneKind | null;
}

export interface ClubProgression {
  teamId: ID;
  name: string;
  shortName: string;
  code: string;
  crestUrl: string | null;
  points: RankPoint[];
  /** Position now, and where they were at their best and worst. */
  current: number;
  best: number;
  worst: number;
  /** Places gained or lost since the first completed matchweek. */
  movement: number;
}

export interface Progression {
  clubs: ClubProgression[];
  matchweeks: number[];
  /** Clubs in the table, for sizing the axis. */
  size: number;
}

export function buildProgression(snapshot: DatasetSnapshot): Progression | null {
  const played = snapshot.matches.filter(
    (m) => m.status === 'FINISHED' && m.matchweek !== null,
  );
  if (!played.length) return null;

  // A matchweek counts only when every one of its fixtures has finished.
  const scheduledPerWeek = new Map<number, number>();
  const playedPerWeek = new Map<number, number>();
  for (const m of snapshot.matches) {
    if (m.matchweek === null) continue;
    scheduledPerWeek.set(m.matchweek, (scheduledPerWeek.get(m.matchweek) ?? 0) + 1);
    if (m.status === 'FINISHED') {
      playedPerWeek.set(m.matchweek, (playedPerWeek.get(m.matchweek) ?? 0) + 1);
    }
  }
  const complete = [...scheduledPerWeek.entries()]
    .filter(([week, n]) => (playedPerWeek.get(week) ?? 0) >= n)
    .map(([week]) => week)
    .sort((a, b) => a - b);

  // Two points make a line; one makes a dot and no story.
  if (complete.length < 2) return null;

  const teamIds = snapshot.teams.map((t) => t.id);
  const zoneByRank = new Map<number, ZoneKind>();
  for (const z of snapshot.competition.zones) {
    for (let r = z.fromRank; r <= z.toRank; r++) zoneByRank.set(r, z.kind);
  }

  const history = new Map<ID, RankPoint[]>();
  for (const id of teamIds) history.set(id, []);

  for (const week of complete) {
    const upTo = played.filter((m) => (m.matchweek as number) <= week);
    const table = computeStandings({
      matches: upTo,
      teamIds,
      competition: snapshot.competition,
      seasonId: snapshot.season.id,
    });
    for (const row of table) {
      history.get(row.teamId)?.push({
        matchweek: week,
        position: row.rank,
        points: row.points,
        zone: zoneByRank.get(row.rank) ?? null,
      });
    }
  }

  const byId = new Map(snapshot.teams.map((t) => [t.id, t]));
  const clubs: ClubProgression[] = [];
  for (const [teamId, points] of history) {
    const team = byId.get(teamId);
    if (!team || points.length < 2) continue;
    const positions = points.map((p) => p.position);
    clubs.push({
      teamId,
      name: team.name,
      shortName: team.shortName,
      code: team.code,
      crestUrl: team.crestUrl,
      points,
      current: positions[positions.length - 1] as number,
      best: Math.min(...positions),
      worst: Math.max(...positions),
      // Positive is a climb: position 12 to position 4 is +8.
      movement: (positions[0] as number) - (positions[positions.length - 1] as number),
    });
  }

  clubs.sort((a, b) => a.current - b.current);
  return { clubs, matchweeks: complete, size: clubs.length };
}

/**
 * The clubs whose season has actually moved.
 *
 * Twenty lines at once is a plate of spaghetti, and the honest reading of a
 * bump chart is usually about a handful of clubs. This picks the ones who have
 * travelled furthest in either direction — the climbers and the fallers — which
 * is what a reader means by "what has happened this season".
 */
export function mostMoved(progression: Progression, limit = 6): ClubProgression[] {
  return [...progression.clubs]
    .sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement))
    .slice(0, limit);
}
