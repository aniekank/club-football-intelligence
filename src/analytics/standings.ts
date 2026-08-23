import type {
  Competition,
  ID,
  Match,
  MatchResultLetter,
  SplitRecord,
  StandingRow,
  TiebreakerCriterion,
} from '@/domain/types';
import { zoneForRank } from '@/domain/competitions';

/**
 * The league-table engine.
 *
 * ── Why this is not a sort with a comparator ────────────────────────────────
 * Head-to-head is not a pairwise, transitive relation. "Who finishes above whom"
 * among three level teams depends on a mini-table built from ONLY the matches
 * between those three — which means the comparison depends on the whole tied
 * group, not on any two rows. Feeding that to Array.sort() produces results that
 * change with input order and silently violate transitivity.
 *
 * So instead: sort by points, partition into tied clusters, then refine each
 * cluster by the next criterion in the competition's chain, recursing until the
 * cluster is a singleton or the chain runs out. That is what the real
 * regulations describe, and it is order-independent.
 */

interface Tally {
  teamId: ID;
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; points: number;
  awayGoalsFor: number; awayWins: number;
  disciplinaryPoints: number;
  xGFor: number; xGAgainst: number; hasXG: boolean;
  home: SplitRecord; away: SplitRecord;
  form: { kickoff: string; letter: MatchResultLetter }[];
}

const emptySplit = (): SplitRecord => ({
  played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
});

function emptyTally(teamId: ID): Tally {
  return {
    teamId,
    played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
    awayGoalsFor: 0, awayWins: 0, disciplinaryPoints: 0,
    xGFor: 0, xGAgainst: 0, hasXG: false,
    home: emptySplit(), away: emptySplit(),
    form: [],
  };
}

/**
 * A match counts toward the table only when it is finished AND both scores are
 * present. The null check is load-bearing: an unplayed fixture carries null, not
 * 0, and treating those as goalless draws would hand every club in the division
 * phantom points and clean sheets.
 */
export function countsTowardTable(m: Match): boolean {
  return m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null;
}

function applyResult(
  t: Tally,
  scored: number,
  conceded: number,
  isHome: boolean,
  competition: Competition,
  kickoff: string,
  xgFor: number | null,
  xgAgainst: number | null,
  cards: { yellow: number; red: number },
): void {
  const split = isHome ? t.home : t.away;
  t.played += 1; split.played += 1;
  t.goalsFor += scored; t.goalsAgainst += conceded;
  split.goalsFor += scored; split.goalsAgainst += conceded;
  if (!isHome) t.awayGoalsFor += scored;

  let letter: MatchResultLetter;
  if (scored > conceded) {
    letter = 'W';
    t.won += 1; split.won += 1;
    t.points += competition.pointsForWin; split.points += competition.pointsForWin;
    if (!isHome) t.awayWins += 1;
  } else if (scored === conceded) {
    letter = 'D';
    t.drawn += 1; split.drawn += 1;
    t.points += competition.pointsForDraw; split.points += competition.pointsForDraw;
  } else {
    letter = 'L';
    t.lost += 1; split.lost += 1;
  }
  t.form.push({ kickoff, letter });

  if (xgFor !== null) { t.xGFor += xgFor; t.hasXG = true; }
  if (xgAgainst !== null) { t.xGAgainst += xgAgainst; t.hasXG = true; }

  // UEFA's scale: a yellow is 1, a red is 3.
  t.disciplinaryPoints += cards.yellow + cards.red * 3;
}

function buildTallies(
  matches: Match[],
  teamIds: ID[],
  competition: Competition,
): Map<ID, Tally> {
  const tallies = new Map<ID, Tally>();
  for (const id of teamIds) tallies.set(id, emptyTally(id));

  for (const m of matches) {
    if (!countsTowardTable(m)) continue;
    const home = tallies.get(m.homeTeamId);
    const away = tallies.get(m.awayTeamId);
    if (!home || !away) continue; // a team outside this table (cross-competition fixture)

    const hs = m.homeScore as number;
    const as = m.awayScore as number;
    const hStats = m.teamStats[m.homeTeamId];
    const aStats = m.teamStats[m.awayTeamId];

    applyResult(home, hs, as, true, competition, m.kickoff, hStats?.xG ?? null, aStats?.xG ?? null, {
      yellow: hStats?.yellowCards ?? 0, red: hStats?.redCards ?? 0,
    });
    applyResult(away, as, hs, false, competition, m.kickoff, aStats?.xG ?? null, hStats?.xG ?? null, {
      yellow: aStats?.yellowCards ?? 0, red: aStats?.redCards ?? 0,
    });
  }
  return tallies;
}

/**
 * Safe tally lookup. Every id passed in comes from `teamIds`, so a miss should
 * be impossible — but a bang here would turn any future off-by-one into a hard
 * crash on a page render, and an empty row is a far better failure than a blank
 * screen. (The parent product's rule: never `!` an entity lookup.)
 */
function tallyOf(tallies: Map<ID, Tally>, id: ID): Tally {
  return tallies.get(id) ?? emptyTally(id);
}

// ── Tiebreaker machinery ────────────────────────────────────────────────────

/** Scalar value of a criterion for one team. Higher always wins, so criteria
 *  that are better-when-lower (discipline) are negated here. */
function criterionValue(t: Tally, c: TiebreakerCriterion): number {
  switch (c) {
    case 'points': return t.points;
    case 'goal-difference': return t.goalsFor - t.goalsAgainst;
    case 'goals-for': return t.goalsFor;
    case 'away-goals': return t.awayGoalsFor;
    case 'wins': return t.won;
    case 'away-wins': return t.awayWins;
    case 'disciplinary': return -t.disciplinaryPoints;
    // Handled by the caller — never scalar.
    case 'head-to-head':
    case 'drawn-lots':
      return 0;
  }
}

/**
 * Whether every meeting between the tied teams has been played.
 *
 * La Liga (and Serie A) only apply head-to-head once the mini-league is
 * complete; mid-season, with one of the two fixtures still to come, the rule
 * falls through to overall goal difference. Skipping this check produces a table
 * that is right in May and wrong from August to April.
 */
function miniLeagueComplete(group: ID[], matches: Match[]): boolean {
  const inGroup = new Set(group);
  const played = new Map<string, number>();
  for (const m of matches) {
    if (!countsTowardTable(m)) continue;
    if (!inGroup.has(m.homeTeamId) || !inGroup.has(m.awayTeamId)) continue;
    const key = `${m.homeTeamId}|${m.awayTeamId}`;
    played.set(key, (played.get(key) ?? 0) + 1);
  }
  // A double round-robin among n teams needs each ordered pair once.
  for (const a of group) {
    for (const b of group) {
      if (a === b) continue;
      if (!played.has(`${a}|${b}`)) return false;
    }
  }
  return true;
}

/** Tallies computed from ONLY the matches between the tied teams. */
function miniTable(group: ID[], matches: Match[], competition: Competition): Map<ID, Tally> {
  const inGroup = new Set(group);
  const relevant = matches.filter(
    (m) => countsTowardTable(m) && inGroup.has(m.homeTeamId) && inGroup.has(m.awayTeamId),
  );
  return buildTallies(relevant, group, competition);
}

/** Split an ordered list into runs of equal value under `valueOf`. */
function partition(ids: ID[], valueOf: (id: ID) => number): ID[][] {
  const sorted = [...ids].sort((a, b) => valueOf(b) - valueOf(a));
  const groups: ID[][] = [];
  let current: ID[] = [];
  let lastValue: number | null = null;
  for (const id of sorted) {
    const v = valueOf(id);
    if (lastValue === null || v === lastValue) {
      current.push(id);
    } else {
      groups.push(current);
      current = [id];
    }
    lastValue = v;
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Recursively order a tied cluster by the remaining tiebreaker chain.
 * Returns teams in finishing order, plus a note per team explaining what
 * separated it from its neighbours (or that nothing did).
 */
function resolveCluster(
  group: ID[],
  chain: TiebreakerCriterion[],
  tallies: Map<ID, Tally>,
  matches: Match[],
  competition: Competition,
  notes: Map<ID, string>,
): ID[] {
  if (group.length <= 1) return group;
  if (chain.length === 0) {
    // Chain exhausted and still level. Say so rather than inventing an order —
    // a stable alphabetical fallback keeps rendering deterministic.
    const alpha = [...group].sort((a, b) => a.localeCompare(b));
    for (const id of alpha) notes.set(id, 'Level on all tiebreakers');
    return alpha;
  }

  const [criterion, ...rest] = chain as [TiebreakerCriterion, ...TiebreakerCriterion[]];

  if (criterion === 'drawn-lots') {
    const alpha = [...group].sort((a, b) => a.localeCompare(b));
    for (const id of alpha) notes.set(id, 'Separated by drawing of lots');
    return alpha;
  }

  if (criterion === 'head-to-head') {
    if (!miniLeagueComplete(group, matches)) {
      // Not all meetings played — the rule does not apply yet. Fall through.
      return resolveCluster(group, rest, tallies, matches, competition, notes);
    }
    const mini = miniTable(group, matches, competition);
    const h2hChain = competition.headToHeadChain ?? ['points', 'goal-difference', 'goals-for'];
    const ordered: ID[] = [];
    for (const sub of refineBy(group, h2hChain, (id, c) => criterionValue(tallyOf(mini, id), c))) {
      if (sub.length === 1) {
        notes.set(sub[0]!, 'Ahead on head-to-head');
        ordered.push(sub[0]!);
      } else {
        // Mini-table could not separate them — continue the OUTER chain.
        ordered.push(...resolveCluster(sub, rest, tallies, matches, competition, notes));
      }
    }
    return ordered;
  }

  const label = criterionLabel(criterion);
  const ordered: ID[] = [];
  for (const sub of partition(group, (id) => criterionValue(tallyOf(tallies, id), criterion))) {
    if (sub.length === 1) {
      notes.set(sub[0]!, `Ahead on ${label}`);
      ordered.push(sub[0]!);
    } else {
      ordered.push(...resolveCluster(sub, rest, tallies, matches, competition, notes));
    }
  }
  return ordered;
}

/** Successively partition `ids` by each criterion, yielding the final runs. */
function refineBy(
  ids: ID[],
  chain: TiebreakerCriterion[],
  valueOf: (id: ID, c: TiebreakerCriterion) => number,
): ID[][] {
  let groups: ID[][] = [ids];
  for (const c of chain) {
    const next: ID[][] = [];
    for (const g of groups) {
      if (g.length === 1) { next.push(g); continue; }
      next.push(...partition(g, (id) => valueOf(id, c)));
    }
    groups = next;
  }
  return groups;
}

function criterionLabel(c: TiebreakerCriterion): string {
  switch (c) {
    case 'points': return 'points';
    case 'goal-difference': return 'goal difference';
    case 'goals-for': return 'goals scored';
    case 'away-goals': return 'away goals';
    case 'wins': return 'wins';
    case 'away-wins': return 'away wins';
    case 'disciplinary': return 'disciplinary record';
    case 'head-to-head': return 'head-to-head';
    case 'drawn-lots': return 'drawing of lots';
  }
}

// ── Public entry point ──────────────────────────────────────────────────────

export interface ComputeStandingsInput {
  matches: Match[];
  teamIds: ID[];
  competition: Competition;
  seasonId: ID;
  /** Group letter, for group-stage formats. */
  groupId?: ID | null;
  /** Points deductions (FFP, administration). Positive = points removed. */
  deductions?: Record<ID, number>;
  /** Recent-form window length. */
  formLength?: number;
}

export function computeStandings(input: ComputeStandingsInput): StandingRow[] {
  const {
    matches, teamIds, competition, seasonId,
    groupId = null, deductions = {}, formLength = 5,
  } = input;

  const tallies = buildTallies(matches, teamIds, competition);

  // Deductions apply BEFORE any tiebreaker runs — a docked team is genuinely on
  // fewer points, so it must be docked before clusters are formed, not after.
  for (const [teamId, penalty] of Object.entries(deductions)) {
    const t = tallies.get(teamId);
    if (t) t.points -= penalty;
  }

  const notes = new Map<ID, string>();
  const ordered = resolveCluster(
    teamIds, competition.tiebreakers, tallies, matches, competition, notes,
  );

  return ordered.map((teamId, i) => {
    const t = tallyOf(tallies, teamId);
    const rank = i + 1;
    const zone = zoneForRank(competition, rank);
    const form = t.form
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      .slice(-formLength)
      .map((f) => f.letter);

    // Only footnote a tiebreaker when a NEIGHBOUR is level on points — the note
    // is meaningless otherwise, and noise on every row would bury the real ones.
    const above = ordered[i - 1];
    const below = ordered[i + 1];
    const levelWithNeighbour =
      (above !== undefined && tallyOf(tallies, above).points === t.points) ||
      (below !== undefined && tallyOf(tallies, below).points === t.points);

    return {
      seasonId,
      competitionId: competition.id,
      teamId,
      groupId,
      rank,
      played: t.played,
      won: t.won,
      drawn: t.drawn,
      lost: t.lost,
      goalsFor: t.goalsFor,
      goalsAgainst: t.goalsAgainst,
      goalDifference: t.goalsFor - t.goalsAgainst,
      points: t.points,
      homeRecord: t.home,
      awayRecord: t.away,
      form,
      xGFor: t.hasXG ? round2(t.xGFor) : null,
      xGAgainst: t.hasXG ? round2(t.xGAgainst) : null,
      expectedPoints: null, // filled by the simulation layer
      disciplinaryPoints: t.disciplinaryPoints,
      zone: zone?.kind ?? null,
      titleProbability: null,
      top4Probability: null,
      relegationProbability: null,
      tiebreakerNote: levelWithNeighbour ? (notes.get(teamId) ?? null) : null,
    };
  });
}

const round2 = (v: number) => Math.round(v * 100) / 100;
