import type { DatasetSnapshot, ID, Player, PlayerStats, Position, Team } from '@/domain/types';

/**
 * Player views: per-90 rates and percentiles against positional peers.
 *
 * ── The rule that governs this whole file ──────────────────────────────────
 * A percentile is only meaningful if the underlying metric is actually
 * measured. The parent product's WC-016: a source that does not supply, say,
 * pressures leaves every player on zero, every player therefore ties, and the
 * UI renders "0th percentile" — which reads as a damning weakness rather than
 * as missing data. So a metric whose whole distribution is zero is OMITTED,
 * not ranked.
 *
 * The same logic applies to the sample. Percentiles from a handful of matches
 * are noise dressed as insight, so the peer pool has a minutes floor and the
 * pool size travels with the result for the UI to disclose.
 */

/** Absolute minimum minutes before a player is comparable at all. */
export const PEER_MINUTES_FLOOR = 45;

/**
 * The minutes floor, scaled to how much season there is.
 *
 * A fixed 45 minutes is right in August and absurd in May. Over a completed
 * season it let a player with one substitute appearance top the xG-per-90 board
 * — observed live: Alexandre Pato at 1.28, from a handful of minutes. Scaling to
 * a share of the busiest player's minutes keeps the bar meaningful at both ends
 * of a season without needing to know the date.
 */
export function minutesFloor(snapshot: DatasetSnapshot): number {
  const max = snapshot.playerStats.reduce((m, s) => Math.max(m, s.minutes), 0);
  return Math.max(PEER_MINUTES_FLOOR, Math.round(max * 0.15));
}

/** Peers needed before a percentile is worth quoting at all. */
export const MIN_PEERS = 8;

export interface PlayerView {
  player: Player;
  team: Team | undefined;
  stats: PlayerStats;
  /** Per-90 rates for volume metrics. */
  per90: Record<string, number>;
  /** 0–100 against positional peers. Missing key = not rankable, not zero. */
  percentiles: Record<string, number>;
  /** How many peers each percentile was computed against. */
  peerCount: number;
}

/** Metrics that are rates per 90 minutes rather than totals. */
const PER90_KEYS = [
  'goals', 'assists', 'xG', 'xA', 'shots', 'shotsOnTarget', 'keyPasses',
  'passesFinalThird', 'progressiveCarries', 'tackles', 'interceptions',
  'clearances', 'ballRecoveries', 'touches', 'touchesInBox',
  'dribblesCompleted', 'duelsWon', 'aerialsWon', 'bigChancesCreated',
] as const;

/** Human labels, so the UI never has to know the field names. */
export const METRIC_LABELS: Record<string, string> = {
  goals: 'Goals', assists: 'Assists', xG: 'xG', xA: 'xA',
  shots: 'Shots', shotsOnTarget: 'Shots on target', keyPasses: 'Chances created',
  passesFinalThird: 'Passes into final third', progressiveCarries: 'Successful dribbles',
  tackles: 'Tackles', interceptions: 'Interceptions', clearances: 'Clearances',
  ballRecoveries: 'Recoveries', touches: 'Touches', touchesInBox: 'Touches in box',
  dribblesCompleted: 'Dribbles completed', duelsWon: 'Duels won',
  aerialsWon: 'Aerial duels won', bigChancesCreated: 'Big chances created',
  passAccuracy: 'Pass accuracy %', shotConversion: 'Shot conversion %',
  goalsMinusXg: 'Goals − xG', duelWinPct: 'Duel win %',
};

export function computePer90(stats: PlayerStats): Record<string, number> {
  const out: Record<string, number> = {};
  const mins = Math.max(stats.minutes, 1);
  for (const key of PER90_KEYS) {
    const raw = stats[key] as number;
    out[key] = Math.round((raw / mins) * 90 * 100) / 100;
  }
  // Ratios are NOT per-90 — they are already normalised, and dividing them by
  // minutes would be meaningless.
  out.passAccuracy = stats.passes > 0
    ? Math.round((stats.passesCompleted / stats.passes) * 1000) / 10 : 0;
  out.shotConversion = stats.shots > 0
    ? Math.round((stats.goals / stats.shots) * 1000) / 10 : 0;
  out.duelWinPct = stats.duelsTotal > 0
    ? Math.round((stats.duelsWon / stats.duelsTotal) * 1000) / 10 : 0;
  // Finishing over- or under-performance: the single most-read derived number.
  out.goalsMinusXg = Math.round((stats.goals - stats.xG) * 100) / 100;
  return out;
}

interface PeerTables {
  byPosition: Map<Position, Map<string, number[]>>;
  counts: Map<Position, number>;
}

function buildPeerTables(snapshot: DatasetSnapshot): PeerTables {
  const playerById = new Map(snapshot.players.map((p) => [p.id, p]));
  const rows = new Map<Position, Record<string, number>[]>();
  const counts = new Map<Position, number>();

  const floor = minutesFloor(snapshot);
  for (const stats of snapshot.playerStats) {
    if (stats.minutes < floor) continue;
    const player = playerById.get(stats.playerId);
    if (!player) continue;
    const list = rows.get(player.position) ?? [];
    list.push(computePer90(stats));
    rows.set(player.position, list);
    counts.set(player.position, (counts.get(player.position) ?? 0) + 1);
  }

  const byPosition = new Map<Position, Map<string, number[]>>();
  for (const [position, list] of rows) {
    const metrics = new Map<string, number[]>();
    const first = list[0];
    if (first) {
      for (const key of Object.keys(first)) {
        metrics.set(key, list.map((r) => r[key] ?? 0).sort((a, b) => a - b));
      }
    }
    byPosition.set(position, metrics);
  }
  return { byPosition, counts };
}

/**
 * Percentile with MID-RANK tie handling.
 *
 * The naive definition — "share of the pool strictly below you" — is badly
 * misleading on the sparse counting stats that fill a football profile. If 60%
 * of midfielders recorded zero interceptions in the sample, every one of them
 * scores 0th percentile: the bar reads as a damning weakness when the honest
 * statement is "middle of a large tied group".
 *
 * Mid-rank credits half the tied block, which is the standard definition and
 * puts that player at the 30th percentile rather than the 0th. The distinction
 * matters most exactly where these charts are read hardest — early in a season,
 * when almost every counting stat is sparse.
 */
function percentileRank(sorted: number[], value: number): number {
  const n = sorted.length;
  if (!n) return 50;

  // First index >= value, and first index > value: the tied block between them.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] as number) < value) lo = mid + 1;
    else hi = mid;
  }
  const below = lo;

  let lo2 = 0;
  let hi2 = n;
  while (lo2 < hi2) {
    const mid = (lo2 + hi2) >> 1;
    if ((sorted[mid] as number) <= value) lo2 = mid + 1;
    else hi2 = mid;
  }
  const equal = lo2 - below;

  return Math.round(((below + equal / 2) / n) * 100);
}

interface Cache { source: DatasetSnapshot; tables: PeerTables }
const G = globalThis as unknown as { __cfiPeerTables?: Cache };

/** Peer tables, memoised against snapshot identity like the store's indexes. */
function peerTables(snapshot: DatasetSnapshot): PeerTables {
  if (G.__cfiPeerTables?.source === snapshot) return G.__cfiPeerTables.tables;
  const tables = buildPeerTables(snapshot);
  G.__cfiPeerTables = { source: snapshot, tables };
  return tables;
}

export function buildPlayerView(
  snapshot: DatasetSnapshot,
  playerId: ID,
): PlayerView | undefined {
  const player = snapshot.players.find((p) => p.id === playerId);
  if (!player) return undefined;
  const stats = snapshot.playerStats.find((s) => s.playerId === playerId);
  if (!stats) return undefined;

  const team = snapshot.teams.find((t) => t.id === player.teamId);
  const per90 = computePer90(stats);
  const { byPosition, counts } = peerTables(snapshot);
  const table = byPosition.get(player.position);
  const peerCount = counts.get(player.position) ?? 0;

  const percentiles: Record<string, number> = {};
  if (table && peerCount >= MIN_PEERS) {
    for (const [key, value] of Object.entries(per90)) {
      const sorted = table.get(key);
      if (!sorted?.length) continue;
      // The WC-016 guard: a metric the source does not supply is uniformly zero
      // across the pool, and ranking it produces a false "0th percentile".
      const min = sorted[0] as number;
      const max = sorted[sorted.length - 1] as number;
      if (min === 0 && max === 0) continue;
      percentiles[key] = percentileRank(sorted, value);
    }
  }

  return { player, team, stats, per90, percentiles, peerCount };
}

export interface LeaderboardRow {
  player: Player;
  team: Team | undefined;
  stats: PlayerStats;
  value: number;
}

/**
 * Leaderboard for one metric.
 *
 * `per90` mode applies the same minutes floor as the peer pool — a per-90 rate
 * off twenty minutes is not a leaderboard entry, it is a rounding artefact, and
 * letting one cameo top the chart discredits the whole table.
 */
export function leaderboard(
  snapshot: DatasetSnapshot,
  metric: string,
  opts: { per90?: boolean; limit?: number; position?: Position } = {},
): LeaderboardRow[] {
  const { per90 = false, limit = 20, position } = opts;
  const floor = minutesFloor(snapshot);
  const playerById = new Map(snapshot.players.map((p) => [p.id, p]));
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));

  const rows: LeaderboardRow[] = [];
  for (const stats of snapshot.playerStats) {
    const player = playerById.get(stats.playerId);
    if (!player) continue;
    if (position && player.position !== position) continue;
    if (per90 && stats.minutes < floor) continue;

    const value = per90
      ? computePer90(stats)[metric] ?? 0
      : ((stats as unknown as Record<string, number>)[metric] ?? 0);
    if (!Number.isFinite(value) || value <= 0) continue;

    rows.push({ player, team: teamById.get(player.teamId), stats, value });
  }

  return rows
    .sort((a, b) => b.value - a.value || b.stats.minutes - a.stats.minutes)
    .slice(0, limit);
}
