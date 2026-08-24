import type {
  ID, LineupSlot, Player, PlayerStats, Position, DetailedPosition,
} from '@/domain/types';

/**
 * Player mapping for the FotMob adapter.
 *
 * Kept out of `fotmob.ts` because it is a self-contained transform with its own
 * upstream vocabulary — 59 distinct stat keys across five groups, each wrapped
 * in a `{ key, stat: { value, total, type } }` envelope.
 *
 * ── The honesty problem this file has to solve ─────────────────────────────
 * Match detail is fetched for a recent WINDOW, not the whole season. So these
 * aggregates are partial by construction. A striker shown on "3 goals" when the
 * real figure is nine is worse than showing nothing at all, so the fold records
 * exactly which matches it covered and the snapshot carries that scope for the
 * UI to state. Nothing here ever claims to be a season total.
 */

// ── Upstream shapes ─────────────────────────────────────────────────────────

interface FmStatValue {
  value: number | null;
  /** Present on fraction types: `value` succeeded out of `total` attempted. */
  total?: number;
  type?: string;
}
interface FmStatEntry { key?: string; stat?: FmStatValue }
interface FmStatGroup { title?: string; stats?: Record<string, FmStatEntry> }

export interface FmPlayerStats {
  id: number | string;
  name?: string;
  teamId?: number | string;
  teamName?: string;
  shirtNumber?: number | string | null;
  isGoalkeeper?: boolean;
  /** 0 GK · 1 DF · 2 MF · 3 FW */
  usualPosition?: number | string | null;
  stats?: FmStatGroup[];
}

export interface FmLineupPlayer {
  id: number | string;
  name?: string;
  firstName?: string;
  lastName?: string;
  age?: number | null;
  countryName?: string | null;
  countryCode?: string | null;
  shirtNumber?: number | string | null;
  positionId?: number | null;
  usualPlayingPositionId?: number | null;
  marketValue?: number | null;
  performance?: { rating?: number | null; playerOfTheMatch?: boolean } | null;
}

export interface FmLineupSide {
  id?: number | string;
  name?: string;
  formation?: string | null;
  coach?: { name?: string } | { name?: string }[] | null;
  starters?: FmLineupPlayer[];
  subs?: FmLineupPlayer[];
}

export interface FmLineup {
  homeTeam?: FmLineupSide;
  awayTeam?: FmLineupSide;
}

// ── Position ────────────────────────────────────────────────────────────────

const POSITION_BY_USUAL: Record<number, Position> = { 0: 'GK', 1: 'DF', 2: 'MF', 3: 'FW' };

/**
 * `positionId` is a slot on FotMob's formation grid, not a role — it encodes
 * where the player stood. Low numbers are the goalkeeper, then defence, then
 * midfield, then attack. Used only to refine the broad role into something the
 * UI can label; `usualPlayingPositionId` remains the authority for the role.
 */
function detailedFrom(position: Position, positionId: number | null | undefined): DetailedPosition {
  if (position === 'GK') return 'GK';
  const id = positionId ?? 0;
  if (position === 'DF') {
    if (id >= 50 && id < 70) return id % 2 === 1 ? 'LB' : 'RB';
    return 'CB';
  }
  if (position === 'MF') {
    if (id >= 95) return 'AM';
    if (id < 70) return 'DM';
    return 'CM';
  }
  // Forwards: the grid's wide slots sit either side of the central striker one.
  if (id >= 110 && id < 114) return 'LW';
  if (id >= 116) return 'RW';
  return 'ST';
}

export function positionOf(p: { usualPosition?: number | string | null; isGoalkeeper?: boolean }): Position {
  if (p.isGoalkeeper) return 'GK';
  const raw = typeof p.usualPosition === 'string' ? Number(p.usualPosition) : p.usualPosition;
  return (raw != null && POSITION_BY_USUAL[raw]) || 'MF';
}

// ── Stat extraction ─────────────────────────────────────────────────────────

/** Flatten the grouped envelope into `key -> { value, total }`. */
export function flattenStats(groups: FmStatGroup[] | undefined): Map<string, FmStatValue> {
  const out = new Map<string, FmStatValue>();
  for (const g of groups ?? []) {
    for (const entry of Object.values(g.stats ?? {})) {
      if (!entry.key || !entry.stat) continue;
      // Keep the first reading; group headers repeat keys with empty values.
      if (!out.has(entry.key)) out.set(entry.key, entry.stat);
    }
  }
  return out;
}

const val = (m: Map<string, FmStatValue>, key: string): number =>
  (m.get(key)?.value ?? 0) as number;
const total = (m: Map<string, FmStatValue>, key: string): number =>
  (m.get(key)?.total ?? 0) as number;
const maybe = (m: Map<string, FmStatValue>, key: string): number | null => {
  const v = m.get(key)?.value;
  return typeof v === 'number' ? v : null;
};

function emptyStats(playerId: ID, seasonId: ID, competitionId: ID): PlayerStats {
  return {
    playerId, seasonId, competitionId,
    minutes: 0, appearances: 0, starts: 0, goals: 0, assists: 0,
    xG: 0, xA: 0, shots: 0, shotsOnTarget: 0,
    bigChancesCreated: 0, bigChancesMissed: 0,
    passes: 0, passesCompleted: 0, keyPasses: 0, passesFinalThird: 0,
    progressiveCarries: 0, tackles: 0, tacklesWon: 0, interceptions: 0,
    clearances: 0, ballRecoveries: 0, duelsWon: 0, duelsTotal: 0, aerialsWon: 0,
    touches: 0, touchesInBox: 0, dribblesCompleted: 0, dribblesAttempted: 0,
    dispossessed: 0, yellowCards: 0, redCards: 0, foulsCommitted: 0, foulsWon: 0,
    saves: 0, goalsConceded: 0, cleanSheets: 0, averageRating: null,
  };
}

/** Running rating accumulator, kept beside the totals so the mean is weighted
 *  by minutes rather than by appearances. */
export interface RatingAccumulator {
  ratingMinutes: number;
  ratingWeighted: number;
}

export interface PlayerFold {
  players: Map<ID, Player>;
  stats: Map<ID, PlayerStats>;
  ratings: Map<ID, RatingAccumulator>;
}

export function newFold(): PlayerFold {
  return { players: new Map(), stats: new Map(), ratings: new Map() };
}

/**
 * Fold one match's lineup and player stats into the running totals.
 *
 * `starterIds` comes from the lineup, because `playerStats` alone cannot say who
 * started — and starts vs appearances is the distinction that separates a
 * regular from a substitute.
 */
export function foldMatch(
  fold: PlayerFold,
  opts: {
    lineup: FmLineup | undefined;
    playerStats: Record<string, FmPlayerStats> | undefined;
    seasonId: ID;
    competitionId: ID;
    kickoff: string;
    homeTeamId: ID;
    awayTeamId: ID;
    homeScore: number | null;
    awayScore: number | null;
  },
): Record<ID, LineupSlot[]> {
  const { lineup, playerStats, seasonId, competitionId, kickoff } = opts;
  const lineups: Record<ID, LineupSlot[]> = {};
  const starterIds = new Set<string>();

  // ── Identity, from the lineup ────────────────────────────────────────────
  for (const [sideKey, teamId] of [
    ['homeTeam', opts.homeTeamId] as const,
    ['awayTeam', opts.awayTeamId] as const,
  ]) {
    const side = lineup?.[sideKey];
    if (!side) continue;
    const slots: LineupSlot[] = [];

    for (const [group, isStarter] of [
      [side.starters ?? [], true] as const,
      [side.subs ?? [], false] as const,
    ]) {
      for (const p of group) {
        const id = String(p.id);
        if (isStarter) starterIds.add(id);

        const position = POSITION_BY_USUAL[p.usualPlayingPositionId ?? -1] ?? 'MF';
        const existing = fold.players.get(id);
        const shirt = p.shirtNumber != null ? Number(p.shirtNumber) : null;

        if (!existing) {
          fold.players.set(id, {
            id,
            name: p.name ?? (`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || id),
            fullName:
              p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : undefined,
            teamId,
            // A single match tells us the club on THIS date, nothing more. The
            // interval opens here and stays open; a transfer would be a second
            // interval, which needs history this window does not have.
            affiliations: [{ teamId, from: kickoff, to: null, onLoan: false }],
            shirtNumber: Number.isFinite(shirt) ? shirt : null,
            position,
            detailedPosition: detailedFrom(position, p.positionId),
            age: p.age ?? null,
            birthDate: null,
            nationality: p.countryName ?? null,
            photoUrl: `https://images.fotmob.com/image_resources/playerimages/${id}.png`,
            heightCm: null,
            foot: null,
            marketValueEur: p.marketValue != null ? p.marketValue / 1_000_000 : null,
          });
        } else if (existing.teamId !== teamId) {
          // Seen at a different club within the window: that is a transfer, so
          // record it as a second interval rather than overwriting.
          const last = existing.affiliations[existing.affiliations.length - 1];
          if (last && last.teamId !== teamId) {
            existing.affiliations.push({ teamId, from: kickoff, to: null, onLoan: false });
          }
          existing.teamId = teamId;
        }

        slots.push({
          playerId: id,
          name: p.name ?? id,
          position,
          shirtNumber: Number.isFinite(shirt) ? shirt : null,
          isStarter,
          minutesPlayed: null,
          rating: p.performance?.rating ?? null,
        });
      }
    }
    if (slots.length) lineups[teamId] = slots;
  }

  // ── Numbers, from playerStats ────────────────────────────────────────────
  for (const raw of Object.values(playerStats ?? {})) {
    const id = String(raw.id);
    const groups = raw.stats;
    if (!groups?.length) continue;
    const m = flattenStats(groups);
    const minutes = val(m, 'minutes_played');
    // No minutes means they were named but did not play. Counting that as an
    // appearance would inflate every squad player's record.
    if (minutes <= 0) continue;

    const teamId = raw.teamId != null ? String(raw.teamId) : undefined;

    // A player can appear in playerStats without a lineup entry when the
    // lineup fetch is partial; create a minimal record rather than dropping
    // their numbers on the floor.
    if (!fold.players.has(id) && teamId) {
      const position = positionOf(raw);
      const shirt = raw.shirtNumber != null ? Number(raw.shirtNumber) : null;
      fold.players.set(id, {
        id,
        name: raw.name ?? id,
        teamId,
        affiliations: [{ teamId, from: kickoff, to: null, onLoan: false }],
        shirtNumber: Number.isFinite(shirt) ? shirt : null,
        position,
        detailedPosition: detailedFrom(position, null),
        age: null,
        birthDate: null,
        nationality: null,
        photoUrl: `https://images.fotmob.com/image_resources/playerimages/${id}.png`,
        heightCm: null,
        foot: null,
        marketValueEur: null,
      });
    }

    const s = fold.stats.get(id) ?? emptyStats(id, seasonId, competitionId);

    s.minutes += minutes;
    s.appearances += 1;
    if (starterIds.has(id)) s.starts += 1;

    s.goals += val(m, 'goals');
    s.assists += val(m, 'assists');
    s.xG += val(m, 'expected_goals');
    s.xA += val(m, 'expected_assists');
    s.shots += val(m, 'total_shots');
    s.shotsOnTarget += val(m, 'ShotsOnTarget');
    s.bigChancesCreated += val(m, 'big_chance_created_team_title');
    s.bigChancesMissed += val(m, 'big_chance_missed_title');

    s.passesCompleted += val(m, 'accurate_passes');
    s.passes += total(m, 'accurate_passes');
    s.keyPasses += val(m, 'chances_created');
    s.passesFinalThird += val(m, 'passes_into_final_third');
    s.progressiveCarries += val(m, 'dribbles_succeeded');

    s.tackles += val(m, 'matchstats.headers.tackles');
    s.tacklesWon += val(m, 'matchstats.headers.tackles');
    s.interceptions += val(m, 'interceptions');
    s.clearances += val(m, 'clearances');
    s.ballRecoveries += val(m, 'recoveries');

    s.duelsWon += val(m, 'duel_won');
    s.duelsTotal += val(m, 'duel_won') + val(m, 'duel_lost');
    s.aerialsWon += val(m, 'aerials_won');

    s.touches += val(m, 'touches');
    s.touchesInBox += val(m, 'touches_opp_box');
    s.dribblesCompleted += val(m, 'dribbles_succeeded');
    s.dribblesAttempted += total(m, 'dribbles_succeeded');
    s.dispossessed += val(m, 'dispossessed');

    s.foulsCommitted += val(m, 'fouls');
    s.foulsWon += val(m, 'was_fouled');

    s.saves += val(m, 'saves');
    s.goalsConceded += val(m, 'goals_conceded');
    // A clean sheet belongs to the side that conceded nothing, and only to a
    // player who was on the pitch for the whole match.
    const conceded = teamId === opts.homeTeamId ? opts.awayScore : opts.homeScore;
    if (conceded === 0 && minutes >= 90) s.cleanSheets += 1;

    fold.stats.set(id, s);

    const rating = maybe(m, 'rating_title');
    if (rating !== null) {
      const acc = fold.ratings.get(id) ?? { ratingMinutes: 0, ratingWeighted: 0 };
      acc.ratingMinutes += minutes;
      acc.ratingWeighted += rating * minutes;
      fold.ratings.set(id, acc);
    }
  }

  // Fill lineup minutes now that playerStats have been read.
  for (const slots of Object.values(lineups)) {
    for (const slot of slots) {
      const st = fold.stats.get(slot.playerId);
      if (st) slot.minutesPlayed = st.minutes;
    }
  }

  return lineups;
}

/**
 * Close the fold: weight ratings by minutes and round the accumulated doubles.
 *
 * Minutes-weighted rather than a plain mean, because a 9.1 from a ten-minute
 * cameo should not outrank a season of 7.4s.
 */
export function finaliseFold(fold: PlayerFold): PlayerStats[] {
  const out: PlayerStats[] = [];
  for (const [id, s] of fold.stats) {
    const acc = fold.ratings.get(id);
    out.push({
      ...s,
      xG: Math.round(s.xG * 100) / 100,
      xA: Math.round(s.xA * 100) / 100,
      averageRating:
        acc && acc.ratingMinutes > 0
          ? Math.round((acc.ratingWeighted / acc.ratingMinutes) * 100) / 100
          : null,
    });
  }
  return out;
}
