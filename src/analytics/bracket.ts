import type { DatasetSnapshot, ID, Match } from '@/domain/types';

/**
 * The six-group, best-thirds bracket: AFCON (and UEFA's Euro 2016 format it
 * copies).
 *
 * Twenty-four teams, six groups of four. The top two of each group and the four
 * best third-placed teams make a round of sixteen. Four of the six group
 * winners (A to D) are drawn against a third-placed team, and WHICH third they
 * meet depends on which four groups the thirds came from — fifteen possible
 * combinations, fixed in advance so no group winner can meet a side from its
 * own group. The table below is UEFA's Euro 2016 table. CAF uses it unchanged:
 * it reproduces every round-of-16 tie of AFCON 2023 (thirds from A, C, D, E)
 * and AFCON 2025 (thirds from C, D, E, F).
 *
 * The bracket ORDER (which ties meet in the quarter-finals) is the same in both
 * editions and is the order of `R16_SLOTS`: ties 1 and 2 meet, 3 and 4, and so
 * on; the semi-finals pair quarter-finals 1–2 and 3–4.
 */

export type GroupLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/**
 * Key: the four groups whose third-placed teams qualified, sorted.
 * Value: the group of the third-placed team that meets 1A, 1B, 1C and 1D.
 */
export const BEST_THIRDS_TABLE: Record<string, [GroupLetter, GroupLetter, GroupLetter, GroupLetter]> = {
  ABCD: ['C', 'D', 'A', 'B'],
  ABCE: ['C', 'A', 'B', 'E'],
  ABCF: ['C', 'A', 'B', 'F'],
  ABDE: ['D', 'A', 'B', 'E'],
  ABDF: ['D', 'A', 'B', 'F'],
  ABEF: ['E', 'A', 'B', 'F'],
  ACDE: ['C', 'D', 'A', 'E'],
  ACDF: ['C', 'D', 'A', 'F'],
  ACEF: ['C', 'A', 'F', 'E'],
  ADEF: ['D', 'A', 'F', 'E'],
  BCDE: ['C', 'D', 'B', 'E'],
  BCDF: ['C', 'D', 'B', 'F'],
  BCEF: ['E', 'C', 'B', 'F'],
  BDEF: ['E', 'D', 'B', 'F'],
  CDEF: ['C', 'D', 'F', 'E'],
};

/**
 * A position in the round of sixteen: a group finish ("1D", "2A"), or the
 * third-placed team drawn against a given group winner ("3v1A").
 */
export type SlotRef = `${1 | 2}${GroupLetter}` | `3v1${'A' | 'B' | 'C' | 'D'}`;

/** The eight ties, in bracket order. */
export const R16_SLOTS: [SlotRef, SlotRef][] = [
  ['2A', '2C'],
  ['1D', '3v1D'],
  ['1B', '3v1B'],
  ['1F', '2E'],
  ['1E', '2D'],
  ['1C', '3v1C'],
  ['2B', '2F'],
  ['1A', '3v1A'],
];

/** Readable label for a slot: "Winner Group D", "Best third (B/E/F)". */
export function slotLabel(slot: SlotRef): string {
  if (slot.startsWith('3v1')) {
    const winner = slot.slice(3) as 'A' | 'B' | 'C' | 'D';
    const idx = 'ABCD'.indexOf(winner);
    const possible = [...new Set(Object.values(BEST_THIRDS_TABLE).map((row) => row[idx]))].sort();
    return `Third ${possible.join('/')}`;
  }
  return `${slot[0] === '1' ? 'Winner' : 'Runner-up'} Group ${slot[1]}`;
}

/** "Grp. A" / "Group A" → "A". Null when the name carries no group letter. */
export function groupLetter(groupId: string | null | undefined): GroupLetter | null {
  const m = /([A-F])\s*$/.exec(groupId ?? '');
  return (m?.[1] as GroupLetter | undefined) ?? null;
}

/**
 * Fill the round of sixteen.
 *
 * `rankedByGroup` holds each group's teams in finishing order (any id type, so
 * the simulator can pass indices); `thirdsThrough` the groups whose thirds
 * qualified. Returns the eight ties in bracket order, or null when the input
 * does not describe six complete groups and four thirds.
 */
export function fillRoundOf16<T>(
  rankedByGroup: Map<GroupLetter, T[]>,
  thirdsThrough: GroupLetter[],
): [T, T][] | null {
  if (thirdsThrough.length !== 4) return null;
  const key = [...thirdsThrough].sort().join('');
  const row = BEST_THIRDS_TABLE[key];
  if (!row) return null;
  const at = (slot: SlotRef): T | undefined => {
    if (slot.startsWith('3v1')) {
      const winner = slot.slice(3) as 'A' | 'B' | 'C' | 'D';
      const g = row['ABCD'.indexOf(winner)] as GroupLetter;
      return rankedByGroup.get(g)?.[2];
    }
    return rankedByGroup.get(slot[1] as GroupLetter)?.[Number(slot[0]) - 1];
  };
  const ties: [T, T][] = [];
  for (const [a, b] of R16_SLOTS) {
    const ta = at(a);
    const tb = at(b);
    if (ta === undefined || tb === undefined) return null;
    ties.push([ta, tb]);
  }
  return ties;
}

// ── The bracket as a reader sees it ────────────────────────────────────────


export interface BracketTie {
  /** Who is (or would currently be) in each side; null = not yet known. */
  home: ID | null;
  away: ID | null;
  /** What the side stands for before it is known: "Winner Group D", "Winner of tie 3". */
  homeLabel: string;
  awayLabel: string;
  /** The real match, once the two sides have met. */
  match: Match | null;
  winner: ID | null;
}

export interface BracketView {
  rounds: { label: string; ties: BracketTie[] }[];
  /** True while any group match is unplayed: the round of 16 is "if it ended now". */
  provisional: boolean;
  champion: ID | null;
}

const ROUND_NAMES = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
const ROUND_SHORT = ['R16', 'QF', 'SF'];

/**
 * The bracket from the real table and the real knockout results.
 *
 * Before the groups finish, the round of sixteen is filled from the CURRENT
 * standings and marked provisional — "if the groups ended now". Once a real
 * tie exists it wins: the fixed side of each slot (a group winner or runner-up)
 * finds its actual opponent, so a third-place tiebreak we do not model (fair
 * play, drawing of lots) cannot show the wrong pairing.
 */
export function buildBracketView(snapshot: DatasetSnapshot): BracketView | null {
  if (snapshot.competition.knockout !== 'six-groups-best-thirds') return null;

  const inGroups = (m: Match) => m.matchweek !== null;
  const knockoutMatches = snapshot.matches.filter((m) => !inGroups(m));
  const provisional = snapshot.matches.some((m) => inGroups(m) && m.status !== 'FINISHED' && m.status !== 'CANCELLED');

  const ranked = new Map<GroupLetter, ID[]>();
  const thirds: { letter: GroupLetter; row: DatasetSnapshot['standings'][number] }[] = [];
  for (const row of [...snapshot.standings].sort((a, b) => a.rank - b.rank)) {
    const letter = groupLetter(row.groupId);
    if (!letter) continue;
    ranked.set(letter, [...(ranked.get(letter) ?? []), row.teamId]);
    if (row.rank === 3) thirds.push({ letter, row });
  }
  const bestThirds = thirds
    .sort((a, b) =>
      b.row.points - a.row.points ||
      b.row.goalDifference - a.row.goalDifference ||
      b.row.goalsFor - a.row.goalsFor)
    .slice(0, 4)
    .map((t) => t.letter);
  const filled = ranked.size === 6 ? fillRoundOf16(ranked, bestThirds) : null;

  const between = (a: ID, b: ID) =>
    knockoutMatches.find((m) =>
      (m.homeTeamId === a && m.awayTeamId === b) || (m.homeTeamId === b && m.awayTeamId === a));
  const winnerOf = (m: Match | undefined | null): ID | null => {
    if (!m || m.status !== 'FINISHED' || m.homeScore === null || m.awayScore === null) return null;
    if (m.homeScore > m.awayScore) return m.homeTeamId;
    if (m.awayScore > m.homeScore) return m.awayTeamId;
    return m.shootoutWinnerTeamId ?? null;
  };
  const r16Real = knockoutMatches.filter((m) => /16|1\/8/.test(m.roundLabel ?? ''));

  const r16: BracketTie[] = R16_SLOTS.map(([sa, sb], i) => {
    let home: ID | null = filled?.[i]?.[0] ?? null;
    let away: ID | null = filled?.[i]?.[1] ?? null;
    // Every slot's first side is a group winner or runner-up, never a third.
    const fixed = home;
    const real = fixed ? r16Real.find((m) => m.homeTeamId === fixed || m.awayTeamId === fixed) : undefined;
    if (real) {
      const other = real.homeTeamId === fixed ? real.awayTeamId : real.homeTeamId;
      away = other;
      home = fixed;
    }
    const match = home && away ? between(home, away) ?? null : null;
    return { home, away, homeLabel: slotLabel(sa), awayLabel: slotLabel(sb), match, winner: winnerOf(match) };
  });

  const rounds: { label: string; ties: BracketTie[] }[] = [{ label: ROUND_NAMES[0]!, ties: r16 }];
  let previous = r16;
  for (let r = 1; r < 4; r++) {
    const ties: BracketTie[] = [];
    for (let i = 0; i < previous.length; i += 2) {
      const a = previous[i]!, b = previous[i + 1]!;
      const home = a.winner, away = b.winner;
      const match = home && away ? between(home, away) ?? null : null;
      ties.push({
        home, away,
        homeLabel: `Winner ${ROUND_SHORT[r - 1]} ${i + 1}`,
        awayLabel: `Winner ${ROUND_SHORT[r - 1]} ${i + 2}`,
        match,
        winner: winnerOf(match),
      });
    }
    rounds.push({ label: ROUND_NAMES[r]!, ties });
    previous = ties;
  }
  return { rounds, provisional, champion: previous[0]?.winner ?? null };
}
