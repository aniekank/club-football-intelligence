import { Rng, hashSeed } from '@/lib/rng';
import { sampleScore, type GoalModelConfig } from './poisson';
import { countsTowardTable } from './standings';
import { zoneForRank } from '@/domain/competitions';
import type {
  Competition, DatasetSnapshot, ID, Match, SeasonForecast, Team, ZoneKind,
} from '@/domain/types';

/**
 * Season Monte Carlo.
 *
 * The tournament engine walked a bracket: simulate a group, seed a knockout
 * tree, tally "reached the quarter-final". None of that shape survives contact
 * with a league. The club question is different and simpler to state — play out
 * the REMAINING fixtures many times and count how often each club wins the
 * title, finishes top four, or goes down.
 *
 * What carries over is the machinery: the seeded RNG, the tally pattern, and
 * the discipline of reconciling against results already played rather than
 * simulating a season from scratch.
 *
 * ── The tiebreak approximation, stated plainly ─────────────────────────────
 * Inside the simulation, exact ties (equal points, goal difference and goals
 * scored) are broken at RANDOM rather than by the competition's full
 * head-to-head chain. Resolving genuine head-to-head mini-tables 8,000 times
 * over would dominate the runtime, and a random split is unbiased: across many
 * runs each tied club wins the tie about half the time, which is roughly what
 * not knowing the answer should look like. The DISPLAYED table always uses the
 * real chain — this shortcut lives only inside the sampler.
 */

const DEFAULT_RUNS = 8000;

interface SimTeam {
  id: ID;
  index: number;
  team: Team;
  basePoints: number;
  baseGF: number;
  baseGA: number;
}

export interface SimulateOptions {
  runs?: number;
  /** Fixed so a forecast is reproducible between requests. */
  seed?: number;
  goalModel?: GoalModelConfig;
  /** Ranks 1..n that count as "European qualification" for the summary stat. */
  europeanQualificationCutoff?: number;
}

export interface SeasonSimulation {
  forecasts: SeasonForecast[];
  runs: number;
  /** Fixtures actually simulated — zero means the season is complete. */
  remainingFixtures: number;
}

export function simulateSeason(
  snapshot: DatasetSnapshot,
  teams: Team[],
  options: SimulateOptions = {},
): SeasonSimulation {
  const {
    runs = DEFAULT_RUNS,
    seed = hashSeed(snapshot.season.id),
    goalModel = {},
    europeanQualificationCutoff,
  } = options;

  const competition = snapshot.competition;
  const pointsForWin = competition.pointsForWin;
  const pointsForDraw = competition.pointsForDraw;

  // Only fixtures that belong to the table — for the Swiss model that excludes
  // the knockout bracket, exactly as the standings engine does.
  const inTable = (m: Match) =>
    competition.format === 'league' ? true : m.matchweek !== null;

  const simTeams: SimTeam[] = teams.map((team, index) => ({
    id: team.id, index, team, basePoints: 0, baseGF: 0, baseGA: 0,
  }));
  const indexOf = new Map<ID, number>(simTeams.map((t) => [t.id, t.index]));

  // ── Reconcile against what has already happened ──────────────────────────
  // The season starts from the real table, not from zero. Simulating played
  // fixtures as well would throw away information and let a club that has
  // already been relegated show a title chance.
  for (const m of snapshot.matches) {
    if (!inTable(m) || !countsTowardTable(m)) continue;
    const hi = indexOf.get(m.homeTeamId);
    const ai = indexOf.get(m.awayTeamId);
    if (hi === undefined || ai === undefined) continue;
    const home = simTeams[hi] as SimTeam;
    const away = simTeams[ai] as SimTeam;
    const hs = m.homeScore as number;
    const as = m.awayScore as number;
    home.baseGF += hs; home.baseGA += as;
    away.baseGF += as; away.baseGA += hs;
    if (hs > as) home.basePoints += pointsForWin;
    else if (hs < as) away.basePoints += pointsForWin;
    else { home.basePoints += pointsForDraw; away.basePoints += pointsForDraw; }
  }

  // Points deductions are already baked into the published standings, so lift
  // them from there rather than recomputing — otherwise a docked club would
  // show a forecast built on points it does not have.
  for (const row of snapshot.standings) {
    const i = indexOf.get(row.teamId);
    if (i === undefined) continue;
    const t = simTeams[i] as SimTeam;
    const delta = row.points - t.basePoints;
    if (delta !== 0) t.basePoints = row.points;
  }

  const remaining = snapshot.matches.filter(
    (m) =>
      inTable(m) &&
      (m.status === 'SCHEDULED' || m.status === 'LIVE' || m.status === 'HALFTIME') &&
      indexOf.has(m.homeTeamId) &&
      indexOf.has(m.awayTeamId),
  );

  const n = simTeams.length;
  const rankCounts = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  const pointSamples = Array.from({ length: n }, () => [] as number[]);
  const rankSum = new Array<number>(n).fill(0);

  const rng = new Rng(seed);
  const rngNext = () => rng.next();

  // Reused across runs so the hot loop allocates nothing.
  const points = new Array<number>(n);
  const gf = new Array<number>(n);
  const ga = new Array<number>(n);
  const order = new Array<number>(n);
  const jitter = new Array<number>(n);

  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < n; i++) {
      const t = simTeams[i] as SimTeam;
      points[i] = t.basePoints;
      gf[i] = t.baseGF;
      ga[i] = t.baseGA;
      order[i] = i;
      // One random key per club per run, used ONLY to split exact ties.
      jitter[i] = rng.next();
    }

    for (const m of remaining) {
      const hi = indexOf.get(m.homeTeamId) as number;
      const ai = indexOf.get(m.awayTeamId) as number;
      const score = sampleScore(
        rngNext,
        (simTeams[hi] as SimTeam).team,
        (simTeams[ai] as SimTeam).team,
        { ...goalModel, venueKind: m.venueKind },
      );
      gf[hi] = (gf[hi] as number) + score.home;
      ga[hi] = (ga[hi] as number) + score.away;
      gf[ai] = (gf[ai] as number) + score.away;
      ga[ai] = (ga[ai] as number) + score.home;
      if (score.home > score.away) points[hi] = (points[hi] as number) + pointsForWin;
      else if (score.home < score.away) points[ai] = (points[ai] as number) + pointsForWin;
      else {
        points[hi] = (points[hi] as number) + pointsForDraw;
        points[ai] = (points[ai] as number) + pointsForDraw;
      }
    }

    order.sort((a, b) => {
      const pd = (points[b] as number) - (points[a] as number);
      if (pd !== 0) return pd;
      const gdA = (gf[a] as number) - (ga[a] as number);
      const gdB = (gf[b] as number) - (ga[b] as number);
      if (gdB !== gdA) return gdB - gdA;
      const gfd = (gf[b] as number) - (gf[a] as number);
      if (gfd !== 0) return gfd;
      // Genuinely level — split at random rather than alphabetically, which
      // would hand the same club every tie across all 8,000 runs.
      return (jitter[a] as number) - (jitter[b] as number);
    });

    for (let pos = 0; pos < n; pos++) {
      const teamIdx = order[pos] as number;
      const rank = pos + 1;
      (rankCounts[teamIdx] as number[])[rank] = ((rankCounts[teamIdx] as number[])[rank] ?? 0) + 1;
      rankSum[teamIdx] = (rankSum[teamIdx] as number) + rank;
      (pointSamples[teamIdx] as number[]).push(points[teamIdx] as number);
    }
  }

  // ── Tally into probabilities ─────────────────────────────────────────────
  const europeanCutoff = europeanQualificationCutoff ?? defaultEuropeanCutoff(competition);
  const relegationRanks = ranksWithZone(competition, n, ['relegation', 'relegation-playoff']);
  const top4Cutoff = Math.min(4, n);

  const startOfSeasonTitle = 1 / n;

  const forecasts: SeasonForecast[] = simTeams.map((t) => {
    const counts = rankCounts[t.index] as number[];
    const samples = (pointSamples[t.index] as number[]).slice().sort((a, b) => a - b);

    const probOfRankAtMost = (cut: number) => {
      let c = 0;
      for (let r = 1; r <= cut; r++) c += counts[r] ?? 0;
      return c / runs;
    };
    const probOfRanksIn = (ranks: Set<number>) => {
      let c = 0;
      for (const r of ranks) c += counts[r] ?? 0;
      return c / runs;
    };

    const winTitle = (counts[1] ?? 0) / runs;

    return {
      teamId: t.id,
      seasonId: snapshot.season.id,
      competitionId: competition.id,
      winTitle,
      top4: probOfRankAtMost(top4Cutoff),
      europeanQualification: probOfRankAtMost(europeanCutoff),
      relegation: probOfRanksIn(relegationRanks),
      projectedPoints: {
        mean: round1(mean(samples)),
        p10: quantile(samples, 0.1),
        p25: quantile(samples, 0.25),
        p50: quantile(samples, 0.5),
        p75: quantile(samples, 0.75),
        p90: quantile(samples, 0.9),
      },
      projectedRank: {
        mean: round1((rankSum[t.index] as number) / runs),
        p10: rankQuantile(counts, runs, 0.1),
        p90: rankQuantile(counts, runs, 0.9),
      },
      titleProbabilityDelta: round4(winTitle - startOfSeasonTitle),
      powerRating: t.team.elo,
      powerRank: 0, // assigned below
    };
  });

  const byPower = [...forecasts].sort((a, b) => b.powerRating - a.powerRating);
  byPower.forEach((f, i) => { f.powerRank = i + 1; });

  return { forecasts, runs, remainingFixtures: remaining.length };
}

/** Ranks whose zone is one of `kinds`. */
function ranksWithZone(competition: Competition, n: number, kinds: ZoneKind[]): Set<number> {
  const wanted = new Set(kinds);
  const out = new Set<number>();
  for (let r = 1; r <= n; r++) {
    const z = zoneForRank(competition, r);
    if (z && wanted.has(z.kind)) out.add(r);
  }
  return out;
}

/** Deepest rank that still earns any European place. */
function defaultEuropeanCutoff(competition: Competition): number {
  const european: ZoneKind[] = [
    'ucl-league-phase', 'ucl-qualifying', 'uel-league-phase',
    'uel-qualifying', 'conference-qualifying',
  ];
  const ranks = competition.zones
    .filter((z) => european.includes(z.kind))
    .map((z) => z.toRank);
  return ranks.length ? Math.max(...ranks) : 0;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Quantile of a PRE-SORTED array. */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i] as number;
}

/** Quantile over a rank histogram, without materialising the samples. */
function rankQuantile(counts: number[], runs: number, q: number): number {
  const target = q * runs;
  let cumulative = 0;
  for (let r = 1; r < counts.length; r++) {
    cumulative += counts[r] ?? 0;
    if (cumulative >= target) return r;
  }
  return counts.length - 1;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
