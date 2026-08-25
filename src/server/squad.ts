import type { DatasetSnapshot, ID, Player, PlayerStats, Position } from '@/domain/types';

/**
 * A squad, and each player's share of what the club actually did.
 *
 * ── The point of this module ───────────────────────────────────────────────
 * A player page that shows twelve goals tells you a player scored twelve
 * goals. A player page that shows twelve goals AND that they are 38% of
 * everything the club scored tells you what the club would be without them.
 * The second is the observation; the first is a number. Everything here exists
 * to compute the second.
 *
 * ── The denominator has to come from the same window as the numerator ──────
 * This is the trap, and the product has already fallen into it once (CFI-014).
 * Player stats cover only the matches detail was fetched for — 29 of
 * Brasileirão's 234 — while the league table covers the whole season. Dividing
 * a player's covered-window goals by the table's season goals-for produces a
 * share that is confidently, silently wrong: a striker with every one of the
 * club's recent goals would read as 8%.
 *
 * So the club's total is summed from the SAME player rows. Both sides of every
 * ratio here come from the identical set of matches, whatever that set is.
 */

export interface SquadMember {
  player: Player;
  stats: PlayerStats;
  /** Share of an outfield slot: 1.0 is a player who has played every minute. */
  minutesShare: number;
  /** Share of the squad's goals, assists and expected goals in this window. */
  goalShare: number | null;
  assistShare: number | null;
  xGShare: number | null;
  /** Goals minus expected goals — finishing above or below the chances taken. */
  goalsMinusXG: number | null;
  /** True while the club is not their parent club. */
  onLoan: boolean;
}

export interface SquadView {
  members: SquadMember[];
  /** Totals the shares are taken against, so a surface can state them. */
  totals: { goals: number; assists: number; xG: number | null; minutes: number };
  /** Matches these numbers are drawn from, and what the season actually is. */
  coverage: { covered: number; played: number } | null;
}

const share = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null;

/**
 * Is this player at the club on loan RIGHT NOW?
 *
 * `affiliations` is an interval list precisely so this question has an answer —
 * it was modelled that way in the first commit and then read by nothing. A
 * spell with no end date is the current one; `onLoan` on that spell is the
 * answer.
 */
function loanedNow(player: Player, teamId: ID): boolean {
  const current = player.affiliations?.find((a) => a.teamId === teamId && a.to === null);
  return current?.onLoan ?? false;
}

export function buildSquad(snapshot: DatasetSnapshot, teamId: ID): SquadView {
  const statsByPlayer = new Map(snapshot.playerStats.map((s) => [s.playerId, s]));

  const rows: { player: Player; stats: PlayerStats }[] = [];
  for (const player of snapshot.players) {
    if (player.teamId !== teamId) continue;
    const stats = statsByPlayer.get(player.id);
    if (stats) rows.push({ player, stats });
  }

  const totals = rows.reduce(
    (acc, r) => ({
      goals: acc.goals + r.stats.goals,
      assists: acc.assists + r.stats.assists,
      xG: acc.xG + r.stats.xG,
      minutes: acc.minutes + r.stats.minutes,
    }),
    { goals: 0, assists: 0, xG: 0, minutes: 0 },
  );

  // One outfield slot's worth of minutes across the covered matches. Eleven
  // players are on the pitch, so the squad's total minutes divided by eleven is
  // what a single ever-present would have played.
  const fullTime = totals.minutes / 11;
  const anyXG = rows.some((r) => r.stats.xG > 0);

  const members: SquadMember[] = rows
    .map(({ player, stats }) => ({
      player,
      stats,
      minutesShare: fullTime > 0 ? Math.min(stats.minutes / fullTime, 1) : 0,
      goalShare: share(stats.goals, totals.goals),
      assistShare: share(stats.assists, totals.assists),
      xGShare: anyXG ? share(stats.xG, totals.xG) : null,
      goalsMinusXG: anyXG && stats.xG > 0 ? stats.goals - stats.xG : null,
      onLoan: loanedNow(player, teamId),
    }))
    .sort((a, b) => b.stats.minutes - a.stats.minutes);

  const cov = snapshot.meta.playerStatsCoverage;

  return {
    members,
    totals: { ...totals, xG: anyXG ? totals.xG : null },
    coverage: cov ? { covered: cov.matchesCovered, played: cov.matchesPlayed } : null,
  };
}

/**
 * Where a squad is drawn from.
 *
 * Nationality is on every player row and was never aggregated, so the product
 * held the makings of a real observation — "twenty-four players from fourteen
 * countries" — and showed it nowhere. Counted by MINUTES as well as by heads,
 * because a squad with twelve nationalities on the bench and an all-domestic
 * eleven is a different club from one that rotates them.
 */
export interface NationalityCount {
  nationality: string;
  players: number;
  minutes: number;
  minutesShare: number;
}

export function nationalities(members: SquadMember[]): NationalityCount[] {
  const totalMinutes = members.reduce((n, m) => n + m.stats.minutes, 0);
  const by = new Map<string, { players: number; minutes: number }>();
  for (const m of members) {
    // Unknown is dropped rather than bucketed as "Other": a squad list with
    // three players of unrecorded nationality should not report a country.
    const nat = m.player.nationality;
    if (!nat) continue;
    const cur = by.get(nat) ?? { players: 0, minutes: 0 };
    by.set(nat, { players: cur.players + 1, minutes: cur.minutes + m.stats.minutes });
  }
  return [...by.entries()]
    .map(([nationality, v]) => ({
      nationality,
      players: v.players,
      minutes: v.minutes,
      minutesShare: totalMinutes > 0 ? v.minutes / totalMinutes : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.nationality.localeCompare(b.nationality));
}

const ORDER: Position[] = ['GK', 'DF', 'MF', 'FW'];

/** Squad grouped by position, in the order a teamsheet is read. */
export function byPosition(members: SquadMember[]): { position: Position; players: SquadMember[] }[] {
  return ORDER.map((position) => ({
    position,
    players: members.filter((m) => m.player.position === position),
  })).filter((g) => g.players.length > 0);
}

/**
 * How a player compares with the rest of their own squad.
 *
 * Positional percentiles against the whole division answer "is this a good
 * midfielder". This answers a different and more immediate question: "how
 * important is this player to THIS team" — which is the one a reader has when
 * they arrive from the club page, and the one the product could not answer at
 * all before.
 */
export function standingInSquad(
  snapshot: DatasetSnapshot, player: Player,
): { squad: SquadView; me: SquadMember | null; rankByMinutes: number | null } {
  const squad = buildSquad(snapshot, player.teamId);
  const idx = squad.members.findIndex((m) => m.player.id === player.id);
  return {
    squad,
    me: idx >= 0 ? (squad.members[idx] as SquadMember) : null,
    rankByMinutes: idx >= 0 ? idx + 1 : null,
  };
}
