/**
 * Model-versus-market maths.
 *
 * Kept strictly separate from the sport model: the goal model produces
 * probabilities and knows nothing about prices; this module turns probabilities
 * plus prices into edges. That separation is what let the parent product serve
 * one betting engine from a per-sport model, and it is worth preserving.
 *
 * ── The de-vigging decision, which is the whole ballgame ────────────────────
 * A bookmaker's quoted probabilities sum to more than 1. The excess is the
 * margin (the "vig"), and how you remove it materially changes every edge you
 * calculate. The naive method — divide each implied probability by the total —
 * assumes the margin is spread proportionally, which it is not: books load more
 * margin onto longshots (the favourite-longshot bias). Proportional de-vigging
 * therefore systematically OVERSTATES the true probability of longshots, and a
 * model comparing against it will keep "finding value" on big prices that is
 * not there.
 *
 * So the default here is the multiplicative/power method applied to the sharpest
 * available book, not the average of all of them. An average includes soft books
 * whose prices are stale, and beating a stale price is not an edge — it is a
 * price that will be gone before you can take it.
 */

export type MarketKind = 'h2h' | 'spreads' | 'totals';

export interface Outcome {
  /** 'home' | 'draw' | 'away' for 1X2; 'over' | 'under'; team name for spreads. */
  label: string;
  /** Decimal odds. */
  price: number;
  /** Handicap or total line, where the market has one. */
  point?: number;
}

export interface BookQuote {
  bookmaker: string;
  market: MarketKind;
  outcomes: Outcome[];
  lastUpdate: string;
}

/** Decimal odds → implied probability, before margin removal. */
export const impliedProbability = (price: number): number => (price > 1 ? 1 / price : 0);

/** The book's total margin. 1.05 means a 5% overround. */
export function overround(prices: number[]): number {
  return prices.reduce((s, p) => s + impliedProbability(p), 0);
}

/**
 * Plausibility bounds on a real market.
 *
 * A genuine 1X2 book runs about 102-112%; a two-way market a little tighter.
 * Anything far outside that is not a market at all — it is placeholder pricing
 * for a fixture that has not opened, and the live feed does serve those.
 *
 * This gate is load-bearing for safety, not tidiness. De-vigging a 280% book
 * (observed live: Newcastle 1.08 / Bournemouth 1.06 / Draw 1.06) yields
 * meaningless "fair" probabilities, and comparing a model against meaningless
 * probabilities manufactures enormous fake edges — exactly the number a reader
 * would act on.
 */
export const MIN_PLAUSIBLE_OVERROUND = 1.005;
export const MAX_PLAUSIBLE_OVERROUND = 1.25;

export function isUsableMarket(prices: number[]): boolean {
  if (prices.length < 2) return false;
  if (prices.some((p) => !Number.isFinite(p) || p <= 1)) return false;
  const round = overround(prices);
  return round >= MIN_PLAUSIBLE_OVERROUND && round <= MAX_PLAUSIBLE_OVERROUND;
}

/**
 * Remove the margin with the power method.
 *
 * Solves for k such that sum(p_i^k) = 1, where p_i are the raw implied
 * probabilities. Because k < 1, it shrinks long prices proportionally MORE than
 * short ones, which matches how books actually distribute margin. Falls back to
 * proportional de-vigging only if the solve fails to converge.
 */
export function devig(prices: number[]): number[] {
  const raw = prices.map(impliedProbability);
  const total = raw.reduce((a, b) => a + b, 0);
  if (total <= 0) return raw.map(() => 0);
  if (Math.abs(total - 1) < 1e-9) return raw;

  // Bisection on k. Monotone in k, so this converges reliably and cheaply.
  let lo = 0.5;
  let hi = 1.5;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    const sum = raw.reduce((s, p) => s + Math.pow(p, k), 0);
    if (sum > 1) lo = k;
    else hi = k;
  }
  const k = (lo + hi) / 2;
  const powered = raw.map((p) => Math.pow(p, k));
  const sum = powered.reduce((a, b) => a + b, 0);

  if (!Number.isFinite(sum) || sum <= 0) {
    return raw.map((p) => p / total); // proportional fallback
  }
  return powered.map((p) => p / sum);
}

export interface EdgeInput {
  /** The model's probability for this outcome. */
  modelProbability: number;
  /** Decimal odds offered. */
  price: number;
  /** The market's fair probability after de-vigging. */
  marketProbability: number;
}

export interface Edge {
  modelProbability: number;
  marketProbability: number;
  price: number;
  /** Expected profit per 1 unit staked. 0.04 means +4% EV. */
  expectedValue: number;
  /** Model probability minus market probability, in percentage points. */
  edgePoints: number;
  /** Fraction of bankroll under the Kelly criterion, before any scaling. */
  kellyFraction: number;
  /** Quarter-Kelly — see below for why this, and not full Kelly, is shown. */
  recommendedStake: number;
  /** The price at which this bet would be exactly break-even. */
  fairPrice: number;
}

/**
 * Kelly staking, reported at a QUARTER of the criterion.
 *
 * Full Kelly is growth-optimal only if your probability estimate is exactly
 * right. It never is. Kelly is also brutally asymmetric to overestimation:
 * betting 2x the optimal fraction has negative expected growth even when the
 * edge is real, and a model that is 3 points optimistic can turn a genuine edge
 * into ruin. Fractional Kelly gives up a little growth for a large reduction in
 * variance and in sensitivity to model error, and a quarter is the conventional
 * choice among people who do this for a living.
 *
 * Reporting full Kelly to a reader who will treat it as a recommendation would
 * be the single most harmful number this product could publish.
 */
export const KELLY_FRACTION = 0.25;

export function computeEdge(input: EdgeInput): Edge {
  const { modelProbability: p, price, marketProbability } = input;
  const b = price - 1; // net odds

  const expectedValue = p * b - (1 - p);
  const kelly = b > 0 ? (p * b - (1 - p)) / b : 0;
  const bounded = Math.max(0, Math.min(kelly, 1));

  return {
    modelProbability: p,
    marketProbability,
    price,
    expectedValue: round4(expectedValue),
    edgePoints: round2((p - marketProbability) * 100),
    kellyFraction: round4(bounded),
    recommendedStake: round4(bounded * KELLY_FRACTION),
    fairPrice: p > 0 ? round2(1 / p) : 0,
  };
}

/**
 * Whether an edge is worth surfacing at all.
 *
 * The threshold is not decoration. A 1% modelled edge is inside the model's own
 * error bars, and flagging it invites a reader to bet on noise. Requiring a
 * meaningful edge AND a meaningful probability gap means the flag fires on
 * genuine disagreement with the market rather than on rounding.
 */
export const MIN_EV = 0.03;        // +3% expected value
export const MIN_EDGE_POINTS = 2;  // 2 percentage points of probability

export function isValue(edge: Edge): boolean {
  return edge.expectedValue >= MIN_EV && edge.edgePoints >= MIN_EDGE_POINTS;
}

/**
 * Confidence tiering, so the UI never presents a thin edge and a fat one as
 * equivalent. Deliberately conservative at the top: "strong" requires the model
 * and the market to disagree substantially, which should be rare and treated
 * with suspicion rather than excitement.
 */
export type EdgeStrength = 'none' | 'slim' | 'moderate' | 'strong' | 'implausible';

/**
 * Above this, the honest reading is that the MODEL is wrong, not the market.
 *
 * Betting markets on major European leagues are among the most efficient
 * consumer markets in existence. A genuine, persistent edge is one or two
 * percent. A model claiming +40% against Pinnacle has not found free money; it
 * has found a bug in itself, or it is being asked a question it is not ready to
 * answer. Presenting that as "strong value" would be the most harmful thing
 * this product could do, so it gets its own tier and the UI treats it as a
 * warning rather than a recommendation.
 */
export const IMPLAUSIBLE_EV = 0.20;

export function edgeStrength(edge: Edge): EdgeStrength {
  if (edge.expectedValue >= IMPLAUSIBLE_EV) return 'implausible';
  if (!isValue(edge)) return 'none';
  if (edge.expectedValue >= 0.12 && edge.edgePoints >= 6) return 'strong';
  if (edge.expectedValue >= 0.06) return 'moderate';
  return 'slim';
}

/**
 * Whether the model has seen enough of this season to be quoted against a
 * market at all.
 *
 * With one matchweek played, ratings are almost entirely last season's prior,
 * heavily regressed, and therefore compressed toward the mean. A compressed
 * model under-separates good teams from bad and consequently "finds value" on
 * every underdog — systematically, and in the direction most likely to lose
 * money. Suppressing the whole surface until there is real evidence is the only
 * defensible default.
 */
export const MIN_MATCHES_FOR_EDGES = 6;

export interface ModelReadiness {
  ready: boolean;
  matchesPlayed: number;
  required: number;
  reason: string | null;
}

export function assessReadiness(medianMatchesPlayed: number): ModelReadiness {
  if (medianMatchesPlayed >= MIN_MATCHES_FOR_EDGES) {
    return { ready: true, matchesPlayed: medianMatchesPlayed, required: MIN_MATCHES_FOR_EDGES, reason: null };
  }
  return {
    ready: false,
    matchesPlayed: medianMatchesPlayed,
    required: MIN_MATCHES_FOR_EDGES,
    reason:
      `Only ${medianMatchesPlayed} match${medianMatchesPlayed === 1 ? '' : 'es'} played this season. ` +
      `Ratings are still dominated by last season's regressed prior, which compresses the ` +
      `spread between clubs and makes the model systematically over-rate underdogs. ` +
      `Edges are withheld until ${MIN_MATCHES_FOR_EDGES} matches.`,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
