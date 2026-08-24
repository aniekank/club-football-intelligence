import type { DatasetSnapshot, PlayerStats, StandingRow, Team } from '@/domain/types';
import { computePer90 } from '@/server/players';
import type { FormatKind } from './formatKind';

/**
 * The metric registry.
 *
 * One definition per measurable thing, read by the scatter, the sortable
 * tables, the distribution view and the leaderboards. Before this existed each
 * surface knew its own field names and formatting, which meant "xG" was
 * formatted three different ways and a new metric had to be added in four
 * places.
 *
 * Two properties here do real work beyond display:
 *
 *   `higherIsBetter` — lets a chart label its quadrants and a table know which
 *     end of a sort is "good". Goals conceded and points are both numbers; only
 *     one of them is better when large, and nothing else in the data says so.
 *
 *   `requires` — the capability a metric depends on. A source without xG must
 *     not offer xG as an axis at all, rather than offering it and plotting a
 *     column of zeros. This is the same honesty rule as the rest of the product,
 *     applied to the controls instead of the values.
 */

export type MetricScope = 'team' | 'player';

export interface MetricDef<Row> {
  key: string;
  label: string;
  /** For a cramped axis or column head. */
  short: string;
  group: string;
  higherIsBetter: boolean;
  /** Null when this row genuinely has no value — never 0 as a stand-in. */
  get: (row: Row) => number | null;
  /** A KIND, not a function — metric definitions must stay serialisable so a
   *  server component can hand one straight to a client chart. */
  format: FormatKind;
  /** Capability flag this metric depends on. */
  requires?: 'hasXG' | 'hasPlayerStats' | 'hasShotLocations';
}

const int: FormatKind = 'int';
const one: FormatKind = 'one';
const two: FormatKind = 'two';
const signed: FormatKind = 'signed';
const signedOne: FormatKind = 'signedOne';
const pct1: FormatKind = 'pct1';

// ── Teams ───────────────────────────────────────────────────────────────────

export interface TeamRow {
  team: Team;
  standing: StandingRow;
}

/** Per-game, so clubs with a game in hand are comparable. */
const perGame = (v: number | null, played: number): number | null =>
  v === null || played === 0 ? null : v / played;

export const TEAM_METRICS: MetricDef<TeamRow>[] = [
  { key: 'points', label: 'Points', short: 'Pts', group: 'Table', higherIsBetter: true,
    get: (r) => r.standing.points, format: int },
  { key: 'pointsPerGame', label: 'Points per game', short: 'PPG', group: 'Table', higherIsBetter: true,
    get: (r) => perGame(r.standing.points, r.standing.played), format: two },
  { key: 'rank', label: 'Position', short: 'Pos', group: 'Table', higherIsBetter: false,
    get: (r) => r.standing.rank, format: int },
  { key: 'played', label: 'Played', short: 'Pl', group: 'Table', higherIsBetter: true,
    get: (r) => r.standing.played, format: int },
  { key: 'wins', label: 'Wins', short: 'W', group: 'Table', higherIsBetter: true,
    get: (r) => r.standing.won, format: int },

  { key: 'goalsFor', label: 'Goals scored', short: 'GF', group: 'Goals', higherIsBetter: true,
    get: (r) => r.standing.goalsFor, format: int },
  { key: 'goalsAgainst', label: 'Goals conceded', short: 'GA', group: 'Goals', higherIsBetter: false,
    get: (r) => r.standing.goalsAgainst, format: int },
  { key: 'goalDifference', label: 'Goal difference', short: 'GD', group: 'Goals', higherIsBetter: true,
    get: (r) => r.standing.goalDifference, format: signed },
  { key: 'goalsForPerGame', label: 'Goals scored per game', short: 'GF/g', group: 'Goals', higherIsBetter: true,
    get: (r) => perGame(r.standing.goalsFor, r.standing.played), format: two },
  { key: 'goalsAgainstPerGame', label: 'Goals conceded per game', short: 'GA/g', group: 'Goals', higherIsBetter: false,
    get: (r) => perGame(r.standing.goalsAgainst, r.standing.played), format: two },

  { key: 'xGFor', label: 'Expected goals for', short: 'xG', group: 'Expected', higherIsBetter: true,
    requires: 'hasXG', get: (r) => r.standing.xGFor, format: one },
  { key: 'xGAgainst', label: 'Expected goals against', short: 'xGA', group: 'Expected', higherIsBetter: false,
    requires: 'hasXG', get: (r) => r.standing.xGAgainst, format: one },
  { key: 'xGDifference', label: 'Expected goal difference', short: 'xGD', group: 'Expected', higherIsBetter: true,
    requires: 'hasXG',
    get: (r) => (r.standing.xGFor === null || r.standing.xGAgainst === null
      ? null : r.standing.xGFor - r.standing.xGAgainst),
    format: signedOne },
  { key: 'xGForPerGame', label: 'xG for per game', short: 'xG/g', group: 'Expected', higherIsBetter: true,
    requires: 'hasXG', get: (r) => perGame(r.standing.xGFor, r.standing.played), format: two },
  { key: 'xGAgainstPerGame', label: 'xG against per game', short: 'xGA/g', group: 'Expected', higherIsBetter: false,
    requires: 'hasXG', get: (r) => perGame(r.standing.xGAgainst, r.standing.played), format: two },
  { key: 'expectedPoints', label: 'Expected points', short: 'xPts', group: 'Expected', higherIsBetter: true,
    requires: 'hasXG', get: (r) => r.standing.expectedPoints, format: one },
  {
    key: 'pointsOverExpected',
    label: 'Points over expected',
    short: 'Pts−xPts',
    group: 'Expected',
    higherIsBetter: true,
    requires: 'hasXG',
    // The regression signal. A large positive number is finishing and fine
    // margins, not a repeatable skill, and it is the most useful single thing
    // this dataset can tell a supporter.
    get: (r) => (r.standing.expectedPoints === null ? null : r.standing.points - r.standing.expectedPoints),
    format: signedOne,
  },
  {
    key: 'goalsOverXG',
    label: 'Goals over xG',
    short: 'G−xG',
    group: 'Expected',
    higherIsBetter: true,
    requires: 'hasXG',
    get: (r) => (r.standing.xGFor === null ? null : r.standing.goalsFor - r.standing.xGFor),
    format: signedOne,
  },

  { key: 'homePoints', label: 'Home points', short: 'H Pts', group: 'Splits', higherIsBetter: true,
    get: (r) => r.standing.homeRecord.points, format: int },
  { key: 'awayPoints', label: 'Away points', short: 'A Pts', group: 'Splits', higherIsBetter: true,
    get: (r) => r.standing.awayRecord.points, format: int },
  {
    key: 'homeAdvantage',
    label: 'Home minus away points',
    short: 'H−A',
    group: 'Splits',
    higherIsBetter: true,
    get: (r) => r.standing.homeRecord.points - r.standing.awayRecord.points,
    format: signed,
  },

  { key: 'elo', label: 'Power rating', short: 'ELO', group: 'Model', higherIsBetter: true,
    get: (r) => r.team.elo, format: int },
  { key: 'attackRating', label: 'Attack rating', short: 'ATK', group: 'Model', higherIsBetter: true,
    get: (r) => r.team.attackRating, format: int },
  { key: 'defenseRating', label: 'Defence rating', short: 'DEF', group: 'Model', higherIsBetter: true,
    get: (r) => r.team.defenseRating, format: int },
  { key: 'titleProbability', label: 'Title chance', short: 'Title', group: 'Model', higherIsBetter: true,
    get: (r) => r.standing.titleProbability, format: pct1 },
  { key: 'relegationProbability', label: 'Relegation risk', short: 'Rel', group: 'Model', higherIsBetter: false,
    get: (r) => r.standing.relegationProbability, format: pct1 },
  { key: 'disciplinaryPoints', label: 'Disciplinary points', short: 'Disc', group: 'Table', higherIsBetter: false,
    get: (r) => r.standing.disciplinaryPoints, format: int },
];

// ── Players ─────────────────────────────────────────────────────────────────

export interface PlayerRow {
  stats: PlayerStats;
  per90: Record<string, number>;
}

/** Totals and their per-90 counterparts, generated so the pair never drifts. */
function pair(
  key: string,
  label: string,
  short: string,
  group: string,
  format: FormatKind,
  higherIsBetter = true,
): MetricDef<PlayerRow>[] {
  return [
    {
      key, label, short, group, higherIsBetter,
      get: (r) => (r.stats as unknown as Record<string, number>)[key] ?? null,
      format,
      requires: 'hasPlayerStats',
    },
    {
      key: `${key}Per90`,
      label: `${label} per 90`,
      short: `${short}/90`,
      group,
      higherIsBetter,
      get: (r) => r.per90[key] ?? null,
      format: two,
      requires: 'hasPlayerStats',
    },
  ];
}

export const PLAYER_METRICS: MetricDef<PlayerRow>[] = [
  { key: 'minutes', label: 'Minutes', short: 'Min', group: 'Playing time', higherIsBetter: true,
    get: (r) => r.stats.minutes, format: int, requires: 'hasPlayerStats' },
  { key: 'appearances', label: 'Appearances', short: 'Apps', group: 'Playing time', higherIsBetter: true,
    get: (r) => r.stats.appearances, format: int, requires: 'hasPlayerStats' },
  { key: 'starts', label: 'Starts', short: 'St', group: 'Playing time', higherIsBetter: true,
    get: (r) => r.stats.starts, format: int, requires: 'hasPlayerStats' },

  ...pair('goals', 'Goals', 'G', 'Attack', int),
  ...pair('assists', 'Assists', 'A', 'Attack', int),
  ...pair('xG', 'Expected goals', 'xG', 'Attack', two),
  ...pair('xA', 'Expected assists', 'xA', 'Attack', two),
  ...pair('shots', 'Shots', 'Sh', 'Attack', int),
  ...pair('shotsOnTarget', 'Shots on target', 'SoT', 'Attack', int),
  ...pair('keyPasses', 'Chances created', 'KP', 'Creation', int),
  ...pair('bigChancesCreated', 'Big chances created', 'BCC', 'Creation', int),
  ...pair('passesFinalThird', 'Passes into final third', 'F3', 'Creation', int),
  ...pair('touchesInBox', 'Touches in box', 'TiB', 'Attack', int),
  ...pair('dribblesCompleted', 'Dribbles completed', 'Drb', 'Creation', int),
  ...pair('tackles', 'Tackles', 'Tkl', 'Defence', int),
  ...pair('interceptions', 'Interceptions', 'Int', 'Defence', int),
  ...pair('clearances', 'Clearances', 'Clr', 'Defence', int),
  ...pair('ballRecoveries', 'Recoveries', 'Rec', 'Defence', int),
  ...pair('duelsWon', 'Duels won', 'Duel', 'Defence', int),
  ...pair('aerialsWon', 'Aerial duels won', 'Aer', 'Defence', int),
  ...pair('touches', 'Touches', 'Tch', 'Possession', int),

  { key: 'passAccuracy', label: 'Pass accuracy %', short: 'Pass%', group: 'Possession', higherIsBetter: true,
    get: (r) => r.per90.passAccuracy ?? null, format: one, requires: 'hasPlayerStats' },
  { key: 'duelWinPct', label: 'Duel win %', short: 'Duel%', group: 'Defence', higherIsBetter: true,
    get: (r) => r.per90.duelWinPct ?? null, format: one, requires: 'hasPlayerStats' },
  { key: 'shotConversion', label: 'Shot conversion %', short: 'Conv%', group: 'Attack', higherIsBetter: true,
    get: (r) => r.per90.shotConversion ?? null, format: one, requires: 'hasPlayerStats' },
  {
    key: 'goalsMinusXg',
    label: 'Goals over xG',
    short: 'G−xG',
    group: 'Attack',
    higherIsBetter: true,
    get: (r) => r.per90.goalsMinusXg ?? null,
    format: signedOne,
    requires: 'hasPlayerStats',
  },
  { key: 'averageRating', label: 'Average rating', short: 'Rtg', group: 'Playing time', higherIsBetter: true,
    get: (r) => r.stats.averageRating, format: two, requires: 'hasPlayerStats' },
  { key: 'cleanSheets', label: 'Clean sheets', short: 'CS', group: 'Goalkeeping', higherIsBetter: true,
    get: (r) => r.stats.cleanSheets, format: int, requires: 'hasPlayerStats' },
  ...pair('saves', 'Saves', 'Sv', 'Goalkeeping', int),
];

// ── Lookup ──────────────────────────────────────────────────────────────────

/**
 * The metrics a snapshot can actually serve.
 *
 * A source without xG must not offer xG as an axis. Offering it and plotting a
 * column of nulls is the control-layer version of the "shows 0" bug: the reader
 * asked a question the data cannot answer and got a chart instead of a reason.
 */
export function availableTeamMetrics(snapshot: DatasetSnapshot): MetricDef<TeamRow>[] {
  const caps = snapshot.meta.capabilities;
  return TEAM_METRICS.filter((m) => {
    if (m.requires && !caps[m.requires]) return false;
    // A metric present in principle but null for every club is no more useful
    // than an absent one.
    const rows = teamRows(snapshot);
    return rows.some((r) => m.get(r) !== null);
  });
}

export function availablePlayerMetrics(snapshot: DatasetSnapshot): MetricDef<PlayerRow>[] {
  const caps = snapshot.meta.capabilities;
  if (!caps.hasPlayerStats) return [];
  return PLAYER_METRICS;
}

export function findTeamMetric(key: string): MetricDef<TeamRow> | undefined {
  return TEAM_METRICS.find((m) => m.key === key);
}

export function findPlayerMetric(key: string): MetricDef<PlayerRow> | undefined {
  return PLAYER_METRICS.find((m) => m.key === key);
}

/** Team rows, joined once. */
export function teamRows(snapshot: DatasetSnapshot): TeamRow[] {
  const byId = new Map(snapshot.teams.map((t) => [t.id, t]));
  const out: TeamRow[] = [];
  for (const standing of snapshot.standings) {
    const team = byId.get(standing.teamId);
    if (team) out.push({ team, standing });
  }
  return out;
}

/** Player rows with per-90s precomputed. */
export function playerRows(snapshot: DatasetSnapshot): (PlayerRow & { playerId: string })[] {
  return snapshot.playerStats.map((stats) => ({
    playerId: stats.playerId,
    stats,
    per90: computePer90(stats),
  }));
}

/**
 * A sensible default minutes floor for a player scatter.
 *
 * Reuses the same season-scaled rule as the leaderboards, so a full season and
 * an opening matchweek both get a bar that means something. A fixed number is
 * right in exactly one week of the year.
 */
export function minutesDefault(snapshot: DatasetSnapshot): number {
  const max = snapshot.playerStats.reduce((m, s) => Math.max(m, s.minutes), 0);
  return Math.max(45, Math.round(max * 0.15));
}

/** Metrics grouped for a picker, preserving registry order within each group. */
export function grouped<T>(metrics: MetricDef<T>[]): [string, MetricDef<T>[]][] {
  const map = new Map<string, MetricDef<T>[]>();
  for (const m of metrics) {
    map.set(m.group, [...(map.get(m.group) ?? []), m]);
  }
  return [...map];
}
