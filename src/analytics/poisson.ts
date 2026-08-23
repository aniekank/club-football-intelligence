import type { MatchPrediction, Team } from '@/domain/types';

/**
 * The match model — a bivariate-Poisson goals model.
 *
 * Harvested from the World Cup engine and re-tuned. Two changes matter:
 *
 * 1. HOME ADVANTAGE IS NOW THE DEFAULT, NOT THE EXCEPTION.
 *    The parent product had to actively suppress it. World Cup venues are
 *    quasi-neutral, so applying a home bump to the nominal home side meant the
 *    model's answer depended on provider listing order — England read 55/45
 *    over Argentina purely for being listed first (their WC-087). The fix there
 *    was to make neutral the default and reserve the bump for genuine hosts.
 *
 *    Club football inverts that completely: essentially every fixture is a real
 *    home fixture, at a real home ground, with a real crowd and no travel for
 *    one side. So the multiplier finally does the job it was written for — and
 *    it is CALIBRATED here rather than inherited, because tournament football
 *    and league football score at different rates.
 *
 * 2. LEAGUE_AVG_GOALS moves off the tournament figure. The parent used 1.35
 *    goals per team per match, correct for knockout-heavy tournament football
 *    where sides play not to lose. The top-five leagues run materially higher.
 */

const MAX_GOALS = 8;

/**
 * Goals per team per match. ~2.75 per game across the top five European
 * leagues, against the 2.70 the parent used for a whole tournament. Overridable
 * per competition, because a low-scoring league is a real phenomenon and
 * baking in one constant would systematically mis-price its totals markets.
 */
export const DEFAULT_LEAGUE_AVG_GOALS = 1.38;

/**
 * The home-advantage multipliers.
 *
 * Home sides in the big European leagues score roughly 12-15% more than
 * neutral expectation and concede correspondingly less; the away side's
 * penalty is smaller than the home side's boost, which is why these are not
 * symmetric. Expressed as a pair so the total goals in a fixture stay close to
 * the league average — a symmetric pair would inflate every scoreline.
 */
export const HOME_MULTIPLIER = 1.12;
export const AWAY_MULTIPLIER = 0.94;

export type VenueRole = 'home' | 'away' | 'neutral';

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

export function poissonPmf(k: number, lambda: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

export interface GoalModelConfig {
  leagueAvgGoals?: number;
  homeMultiplier?: number;
  awayMultiplier?: number;
  /** Shared-component share driving the score correlation. */
  covariance?: number;
}

/**
 * Expected goals for one side, from its attack against the opponent's defence.
 * Ratings are 0..100 and map onto a multiplicative adjustment around the league
 * average. The floor stops a catastrophic rating producing a nonsensical λ.
 */
export function expectedGoals(
  attack: Team,
  defense: Team,
  venue: VenueRole,
  config: GoalModelConfig = {},
): number {
  const {
    leagueAvgGoals = DEFAULT_LEAGUE_AVG_GOALS,
    homeMultiplier = HOME_MULTIPLIER,
    awayMultiplier = AWAY_MULTIPLIER,
  } = config;

  const atk = attack.attackRating / 75;
  const def = defense.defenseRating / 75;
  const mul = venue === 'home' ? homeMultiplier : venue === 'away' ? awayMultiplier : 1;
  return Math.max(0.18, leagueAvgGoals * atk * (2 - def) * mul);
}

/**
 * Bivariate-Poisson joint distribution over scorelines.
 *
 * The shared component λ3 captures the empirical positive correlation between
 * the two scores — open, end-to-end games produce goals at both ends. Ignoring
 * it (independent Poisson) systematically under-prices draws and both-teams-to-
 * score, which are two of the four markets the Betting Edge quotes.
 */
export function scoreMatrix(lambdaHome: number, lambdaAway: number, cov = 0.12): number[][] {
  const l3 = cov * Math.min(lambdaHome, lambdaAway);
  const l1 = Math.max(0.05, lambdaHome - l3);
  const l2 = Math.max(0.05, lambdaAway - l3);

  const matrix: number[][] = [];
  for (let x = 0; x <= MAX_GOALS; x++) {
    const row: number[] = [];
    for (let y = 0; y <= MAX_GOALS; y++) {
      let p = 0;
      const kMax = Math.min(x, y);
      for (let k = 0; k <= kMax; k++) {
        p += poissonPmf(x - k, l1) * poissonPmf(y - k, l2) * poissonPmf(k, l3);
      }
      row.push(p);
    }
    matrix.push(row);
  }

  // Renormalise for the truncation at MAX_GOALS. Without this the
  // probabilities sum to slightly under 1 and every derived market is quoted a
  // shade cheap — small, but it is a systematic bias in the direction of
  // claiming value that is not there.
  const total = matrix.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
  return matrix.map((row) => row.map((p) => p / total));
}

export interface PredictOptions extends GoalModelConfig {
  /** 'home-away' applies the multipliers; 'neutral' suppresses them (cup finals). */
  venueKind?: 'home-away' | 'neutral';
}

export function predictMatch(
  home: Team,
  away: Team,
  opts: PredictOptions = {},
): MatchPrediction {
  const { venueKind = 'home-away', covariance = 0.12, ...config } = opts;
  const neutral = venueKind === 'neutral';

  const lh = expectedGoals(home, away, neutral ? 'neutral' : 'home', config);
  const la = expectedGoals(away, home, neutral ? 'neutral' : 'away', config);
  const m = scoreMatrix(lh, la, covariance);

  let homeWin = 0, draw = 0, awayWin = 0, btts = 0, over25 = 0, homeCS = 0, awayCS = 0;
  const scores: { home: number; away: number; prob: number }[] = [];

  for (let x = 0; x < m.length; x++) {
    const row = m[x] as number[];
    for (let y = 0; y < row.length; y++) {
      const p = row[y] as number;
      if (x > y) homeWin += p;
      else if (x === y) draw += p;
      else awayWin += p;
      if (x > 0 && y > 0) btts += p;
      if (x + y > 2.5) over25 += p;
      if (y === 0) homeCS += p;
      if (x === 0) awayCS += p;
      scores.push({ home: x, away: y, prob: p });
    }
  }

  scores.sort((a, b) => b.prob - a.prob);

  return {
    matchId: '',
    homeWin: round4(homeWin),
    draw: round4(draw),
    awayWin: round4(awayWin),
    scoreline: scores.slice(0, 6).map((s) => ({ ...s, prob: round4(s.prob) })),
    expectedGoals: { home: round2(lh), away: round2(la) },
    homeCleanSheet: round4(homeCS),
    awayCleanSheet: round4(awayCS),
    bttsProb: round4(btts),
    over25Prob: round4(over25),
    fairHandicap: fairHandicapLine(m),
  };
}

/**
 * The Asian handicap that would make the fixture a coin flip.
 *
 * Found by scanning quarter-goal lines for the one where the two sides' win
 * probabilities are closest, with quarter lines split across their two
 * neighbouring half-lines the way the market actually settles them. Reported to
 * the nearest 0.25, negative meaning the home side gives the goals.
 */
export function fairHandicapLine(matrix: number[][]): number {
  let best = 0;
  let bestGap = Infinity;
  for (let line = -3; line <= 3; line += 0.25) {
    const { home, away } = handicapProbabilities(matrix, line);
    const gap = Math.abs(home - away);
    if (gap < bestGap) {
      bestGap = gap;
      best = line;
    }
  }
  return best;
}

/**
 * Settle an Asian handicap against the score distribution.
 *
 * `line` is applied to the HOME side: −0.5 means home must win outright, +0.5
 * means the draw pays. Quarter lines (.25/.75) split the stake across the two
 * adjacent half-lines, which is how the bet genuinely settles — modelling them
 * as a single line is a real mis-pricing, not a rounding detail. Pushes are
 * excluded and the remaining probability renormalised, because a push returns
 * the stake rather than losing it.
 */
export function handicapProbabilities(
  matrix: number[][],
  line: number,
): { home: number; away: number; push: number } {
  const isQuarter = Math.abs(line * 2 - Math.round(line * 2)) > 1e-9;
  if (isQuarter) {
    const lower = Math.floor(line * 2) / 2;
    const upper = Math.ceil(line * 2) / 2;
    const a = handicapProbabilities(matrix, lower);
    const b = handicapProbabilities(matrix, upper);
    return {
      home: (a.home + b.home) / 2,
      away: (a.away + b.away) / 2,
      push: (a.push + b.push) / 2,
    };
  }

  let home = 0, away = 0, push = 0;
  for (let x = 0; x < matrix.length; x++) {
    const row = matrix[x] as number[];
    for (let y = 0; y < row.length; y++) {
      const p = row[y] as number;
      const margin = x - y + line;
      if (Math.abs(margin) < 1e-9) push += p;
      else if (margin > 0) home += p;
      else away += p;
    }
  }
  return { home, away, push };
}

/** Over/under totals from the score distribution. */
export function totalsProbabilities(
  matrix: number[][],
  line: number,
): { over: number; under: number; push: number } {
  const isQuarter = Math.abs(line * 2 - Math.round(line * 2)) > 1e-9;
  if (isQuarter) {
    const lower = Math.floor(line * 2) / 2;
    const upper = Math.ceil(line * 2) / 2;
    const a = totalsProbabilities(matrix, lower);
    const b = totalsProbabilities(matrix, upper);
    return {
      over: (a.over + b.over) / 2,
      under: (a.under + b.under) / 2,
      push: (a.push + b.push) / 2,
    };
  }

  let over = 0, under = 0, push = 0;
  for (let x = 0; x < matrix.length; x++) {
    const row = matrix[x] as number[];
    for (let y = 0; y < row.length; y++) {
      const p = row[y] as number;
      const total = x + y;
      if (Math.abs(total - line) < 1e-9) push += p;
      else if (total > line) over += p;
      else under += p;
    }
  }
  return { over, under, push };
}

/** Sample one scoreline. Used by the season Monte Carlo. */
export function sampleScore(
  rngNext: () => number,
  home: Team,
  away: Team,
  opts: PredictOptions = {},
): { home: number; away: number } {
  const { venueKind = 'home-away', ...config } = opts;
  const neutral = venueKind === 'neutral';
  const lh = expectedGoals(home, away, neutral ? 'neutral' : 'home', config);
  const la = expectedGoals(away, home, neutral ? 'neutral' : 'away', config);
  return { home: samplePoisson(rngNext, lh), away: samplePoisson(rngNext, la) };
}

function samplePoisson(rngNext: () => number, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rngNext();
  } while (p > L);
  return k - 1;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
