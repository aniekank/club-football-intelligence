import { describe, it, expect } from 'vitest';
import {
  devig, overround, impliedProbability, computeEdge, isValue, edgeStrength,
  isUsableMarket, assessReadiness, KELLY_FRACTION, MIN_EV,
} from './betting';

describe('de-vigging', () => {
  it('returns probabilities summing to exactly 1', () => {
    for (const prices of [[1.85, 4.0, 4.2], [1.5, 2.6], [2.1, 3.4, 3.6], [1.05, 15, 30]]) {
      const fair = devig(prices);
      expect(fair.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it('leaves a margin-free market untouched', () => {
    // Exactly 100%: nothing to remove.
    const fair = devig([2, 2]);
    expect(fair[0]).toBeCloseTo(0.5, 10);
    expect(fair[1]).toBeCloseTo(0.5, 10);
  });

  it('shrinks longshots MORE than favourites', () => {
    /**
     * The whole reason for the power method. Books load more margin onto long
     * prices, so proportional de-vigging leaves longshots overstated and a model
     * comparing against it keeps "finding value" on big prices that is not there.
     *
     * Measured as the share of each outcome's raw implied probability that
     * survives de-vigging: the longshot must keep LESS of its own than the
     * favourite keeps of its.
     */
    const prices = [1.30, 5.5, 12.0];
    const raw = prices.map(impliedProbability);
    const fair = devig(prices);
    const retained = fair.map((f, i) => f / (raw[i] as number));

    expect(retained[0]!).toBeGreaterThan(retained[1]!);
    expect(retained[1]!).toBeGreaterThan(retained[2]!);

    // ...and it must differ from the naive proportional method, or the whole
    // exercise is cosmetic.
    const total = raw.reduce((a, b) => a + b, 0);
    const proportional = raw.map((p) => p / total);
    expect(Math.abs(fair[2]! - proportional[2]!)).toBeGreaterThan(0.001);
    // Proportional overstates the longshot; the power method sits below it.
    expect(fair[2]!).toBeLessThan(proportional[2]!);
  });

  it('measures the overround', () => {
    expect(overround([2, 2])).toBeCloseTo(1, 10);
    expect(overround([1.9, 1.9])).toBeGreaterThan(1);
  });
});

describe('expected value', () => {
  it('is zero at the fair price', () => {
    // A true 50% chance at evens is a break-even bet, by definition.
    const e = computeEdge({ modelProbability: 0.5, price: 2.0, marketProbability: 0.5 });
    expect(e.expectedValue).toBeCloseTo(0, 6);
    expect(e.kellyFraction).toBeCloseTo(0, 6);
    expect(e.fairPrice).toBeCloseTo(2, 2);
  });

  it('is positive when the model is ahead of the price', () => {
    const e = computeEdge({ modelProbability: 0.55, price: 2.0, marketProbability: 0.5 });
    expect(e.expectedValue).toBeGreaterThan(0);
    expect(e.edgePoints).toBeCloseTo(5, 6);
  });

  it('is negative when the price is short of the model', () => {
    const e = computeEdge({ modelProbability: 0.45, price: 2.0, marketProbability: 0.5 });
    expect(e.expectedValue).toBeLessThan(0);
    // A losing proposition must never be handed a stake.
    expect(e.recommendedStake).toBe(0);
  });
});

describe('Kelly staking', () => {
  it('never recommends more than a quarter of full Kelly', () => {
    for (const p of [0.55, 0.7, 0.9, 0.99]) {
      const e = computeEdge({ modelProbability: p, price: 2.0, marketProbability: 0.5 });
      expect(e.recommendedStake).toBeCloseTo(e.kellyFraction * KELLY_FRACTION, 6);
      expect(e.recommendedStake).toBeLessThanOrEqual(e.kellyFraction);
    }
  });

  it('never recommends a negative or over-full stake', () => {
    // Full Kelly on a near-certainty tends to 1; the bound must hold anyway,
    // because an unbounded stake rendered as a recommendation is the single
    // most harmful number this product could publish.
    const certain = computeEdge({ modelProbability: 0.999, price: 50, marketProbability: 0.02 });
    expect(certain.kellyFraction).toBeLessThanOrEqual(1);
    expect(certain.recommendedStake).toBeLessThanOrEqual(0.25);

    const hopeless = computeEdge({ modelProbability: 0.01, price: 1.5, marketProbability: 0.66 });
    expect(hopeless.kellyFraction).toBe(0);
    expect(hopeless.recommendedStake).toBe(0);
  });

  it('scales the stake with the size of the edge', () => {
    const small = computeEdge({ modelProbability: 0.52, price: 2.0, marketProbability: 0.5 });
    const large = computeEdge({ modelProbability: 0.62, price: 2.0, marketProbability: 0.5 });
    expect(large.recommendedStake).toBeGreaterThan(small.recommendedStake);
  });
});

describe('value flagging', () => {
  it('ignores an edge inside the model\'s own error bars', () => {
    // ~1% EV. Real models are not accurate to one point, so flagging this
    // invites a reader to bet on noise.
    const thin = computeEdge({ modelProbability: 0.505, price: 2.02, marketProbability: 0.5 });
    expect(thin.expectedValue).toBeLessThan(MIN_EV);
    expect(isValue(thin)).toBe(false);
    expect(edgeStrength(thin)).toBe('none');
  });

  it('requires BOTH a meaningful EV and a meaningful probability gap', () => {
    // Large EV can come from a long price with a tiny probability gap; the
    // second condition is what stops a rounding difference on a 20/1 shot
    // reading as a strong bet.
    const longshot = computeEdge({ modelProbability: 0.055, price: 22, marketProbability: 0.05 });
    expect(longshot.expectedValue).toBeGreaterThan(MIN_EV);
    expect(longshot.edgePoints).toBeLessThan(2);
    expect(isValue(longshot)).toBe(false);
  });

  it('tiers a genuine disagreement across the whole band', () => {
    // Boundaries at evens against a 50% market, derived rather than guessed:
    //   < 0.520  none        (inside the model's own error bars)
    //   0.520    slim        +4% EV,  2.0 pts
    //   0.530    moderate    +6% EV,  3.0 pts
    //   0.560    strong     +12% EV,  6.0 pts
    //   0.600    implausible +20% EV — the model, not the market, is wrong
    const at = (p: number) =>
      edgeStrength(computeEdge({ modelProbability: p, price: 2.0, marketProbability: 0.5 }));

    expect(at(0.515)).toBe('none');
    expect(at(0.520)).toBe('slim');
    expect(at(0.525)).toBe('slim');
    expect(at(0.530)).toBe('moderate');
    expect(at(0.550)).toBe('moderate');
    expect(at(0.560)).toBe('strong');
    expect(at(0.590)).toBe('strong');
    expect(at(0.600)).toBe('implausible');

    // The tiers must be monotone — a bigger edge never reads as a smaller one.
    const rank = { none: 0, slim: 1, moderate: 2, strong: 3, implausible: 4 } as const;
    const steps = [0.515, 0.52, 0.53, 0.56, 0.6].map((p) => rank[at(p)]);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    }
  });
});

describe('end to end against a realistic book', () => {
  it('finds no edge when the model agrees with the de-vigged market', () => {
    // Pinnacle-like 1X2 prices with a ~2.5% overround.
    const prices = [1.85, 3.99, 4.06];
    const fair = devig(prices);
    // A model that exactly reproduces the market must find nothing. If it does
    // find something here, the de-vig and the comparison disagree.
    const edges = fair.map((p, i) =>
      computeEdge({ modelProbability: p, price: prices[i] as number, marketProbability: p }),
    );
    for (const e of edges) {
      expect(e.expectedValue).toBeLessThan(MIN_EV);
      expect(isValue(e)).toBe(false);
    }
  });
});

describe('market plausibility gate', () => {
  it('accepts a real book', () => {
    expect(isUsableMarket([1.85, 3.99, 4.06])).toBe(true); // ~2.5% overround
    expect(isUsableMarket([1.5, 2.6])).toBe(true);
  });

  it('rejects the placeholder pricing the live feed actually serves', () => {
    /**
     * Observed live on The Odds API for fixtures whose market had not opened:
     * Newcastle 1.08 / Bournemouth 1.06 / Draw 1.06 — a 280% overround. Passing
     * that through de-vig produces meaningless probabilities and manufactures
     * enormous fake edges, which is the most dangerous possible output.
     */
    expect(isUsableMarket([1.08, 1.06, 1.06])).toBe(false);
    expect(overround([1.08, 1.06, 1.06])).toBeGreaterThan(2.7);
    expect(isUsableMarket([1.24, 1.06, 1.09])).toBe(false);
    expect(isUsableMarket([1.06, 1.08, 1.06])).toBe(false);
  });

  it('rejects impossible or arbitraged books', () => {
    expect(isUsableMarket([5, 5, 5])).toBe(false);   // sums to 0.6 — not a book
    expect(isUsableMarket([1, 2, 3])).toBe(false);   // a price of 1 pays nothing
    expect(isUsableMarket([NaN, 2, 3])).toBe(false);
    expect(isUsableMarket([2])).toBe(false);
  });
});

describe('implausible edges are warnings, not recommendations', () => {
  it('tiers a huge EV as implausible rather than strong', () => {
    // Major-league markets are among the most efficient there are. A model
    // claiming +44% against Pinnacle has found a bug in itself.
    const absurd = computeEdge({ modelProbability: 0.35, price: 4.09, marketProbability: 0.23 });
    expect(absurd.expectedValue).toBeGreaterThan(0.4);
    expect(edgeStrength(absurd)).toBe('implausible');
  });

  it('still tiers a realistic edge normally', () => {
    const real = computeEdge({ modelProbability: 0.54, price: 2.0, marketProbability: 0.5 });
    expect(edgeStrength(real)).not.toBe('implausible');
  });
});

describe('model readiness', () => {
  it('withholds edges until the season has evidence', () => {
    const august = assessReadiness(1);
    expect(august.ready).toBe(false);
    expect(august.reason).toContain('1 match played');

    const later = assessReadiness(10);
    expect(later.ready).toBe(true);
    expect(later.reason).toBeNull();
  });
});
