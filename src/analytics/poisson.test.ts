import { describe, it, expect } from 'vitest';
import {
  predictMatch, expectedGoals, scoreMatrix, handicapProbabilities,
  totalsProbabilities, fairHandicapLine, HOME_MULTIPLIER, AWAY_MULTIPLIER,
} from './poisson';
import type { Team } from '@/domain/types';

const team = (id: string, name: string, atk: number, dfn: number): Team =>
  ({ id, name, shortName: name, code: id.toUpperCase(), attackRating: atk, defenseRating: dfn }) as Team;

const strong = team('str', 'Strong FC', 90, 86);
const mid = team('mid', 'Middling United', 75, 75);
const weak = team('wek', 'Weak Rovers', 62, 60);

describe('venue handling — inverted from the tournament model', () => {
  /**
   * The parent product's property test, kept but re-scoped. There, mirror
   * symmetry had to hold for EVERY fixture, because World Cup venues are
   * quasi-neutral and letting listing order matter produced their WC-087 bug
   * (England read 55/45 over Argentina purely for being listed first).
   *
   * In club football listing order is REAL information — it says who is at
   * home. So symmetry must hold only on a neutral pitch, and must NOT hold
   * otherwise. Both halves are asserted; testing only the first would let a
   * regression that silently drops home advantage pass.
   */
  it('mirrors exactly on a neutral venue', () => {
    const ab = predictMatch(strong, weak, { venueKind: 'neutral' });
    const ba = predictMatch(weak, strong, { venueKind: 'neutral' });
    expect(ab.homeWin).toBeCloseTo(ba.awayWin, 10);
    expect(ab.awayWin).toBeCloseTo(ba.homeWin, 10);
    expect(ab.draw).toBeCloseTo(ba.draw, 10);
    expect(ab.expectedGoals.home).toBeCloseTo(ba.expectedGoals.away, 10);
  });

  it('does NOT mirror on a home-away fixture — that asymmetry is the point', () => {
    const atHome = predictMatch(mid, mid);
    // Two identical sides: on a neutral pitch this is a dead heat, at home it
    // is not. If these ever come out equal, home advantage has been lost.
    expect(atHome.homeWin).toBeGreaterThan(atHome.awayWin);
    const neutralised = predictMatch(mid, mid, { venueKind: 'neutral' });
    expect(neutralised.homeWin).toBeCloseTo(neutralised.awayWin, 10);
  });

  it('applies the calibrated multipliers exactly', () => {
    const base = expectedGoals(mid, mid, 'neutral');
    expect(expectedGoals(mid, mid, 'home')).toBeCloseTo(base * HOME_MULTIPLIER, 10);
    expect(expectedGoals(mid, mid, 'away')).toBeCloseTo(base * AWAY_MULTIPLIER, 10);
  });

  it('can flip a fixture the away side would win on neutral ground', () => {
    // A modest quality gap plus home advantage is enough to reverse the
    // favourite — the single most important thing the club model must capture.
    const slightlyBetter = team('a', 'A', 78, 77);
    const home = predictMatch(mid, slightlyBetter);
    const neutral = predictMatch(mid, slightlyBetter, { venueKind: 'neutral' });
    expect(neutral.homeWin).toBeLessThan(neutral.awayWin);
    expect(home.homeWin).toBeGreaterThan(neutral.homeWin);
  });

  it('respects a per-competition scoring rate', () => {
    const high = predictMatch(mid, mid, { leagueAvgGoals: 1.8 });
    const low = predictMatch(mid, mid, { leagueAvgGoals: 1.0 });
    expect(high.over25Prob).toBeGreaterThan(low.over25Prob);
    expect(high.expectedGoals.home).toBeGreaterThan(low.expectedGoals.home);
  });
});

describe('the score distribution is a distribution', () => {
  it('sums to 1 after the truncation correction', () => {
    const m = scoreMatrix(1.6, 1.2);
    const total = m.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('produces outcome probabilities that sum to 1', () => {
    const p = predictMatch(strong, weak);
    expect(p.homeWin + p.draw + p.awayWin).toBeCloseTo(1, 6);
  });

  it('prices draws higher than an independent-Poisson model would', () => {
    // The shared component is the whole reason to use a BIVARIATE Poisson.
    // Without it draws and both-teams-to-score are systematically under-priced,
    // and those are two of the four markets the Betting Edge quotes.
    const correlated = predictMatch(mid, mid, { covariance: 0.12 });
    const independent = predictMatch(mid, mid, { covariance: 0 });
    expect(correlated.draw).toBeGreaterThan(independent.draw);
  });

  it('makes the stronger side the favourite', () => {
    const p = predictMatch(strong, weak);
    expect(p.homeWin).toBeGreaterThan(p.awayWin);
    expect(p.expectedGoals.home).toBeGreaterThan(p.expectedGoals.away);
  });
});

describe('Asian handicap', () => {
  const m = scoreMatrix(1.7, 1.1);

  it('partitions all probability across home, away and push', () => {
    for (const line of [-1.5, -1, -0.5, 0, 0.5, 1]) {
      const { home, away, push } = handicapProbabilities(m, line);
      expect(home + away + push).toBeCloseTo(1, 10);
    }
  });

  it('has no push on a half line and a real push on a whole line', () => {
    expect(handicapProbabilities(m, -0.5).push).toBeCloseTo(0, 12);
    expect(handicapProbabilities(m, 0).push).toBeGreaterThan(0);
    expect(handicapProbabilities(m, -1).push).toBeGreaterThan(0);
  });

  it('settles a quarter line as the mean of its two neighbours', () => {
    // A quarter line really is two half-stakes on adjacent lines. Treating it
    // as one line is a genuine mis-pricing, not a rounding detail.
    const q = handicapProbabilities(m, -0.75);
    const a = handicapProbabilities(m, -0.5);
    const b = handicapProbabilities(m, -1);
    expect(q.home).toBeCloseTo((a.home + b.home) / 2, 10);
    expect(q.away).toBeCloseTo((a.away + b.away) / 2, 10);
  });

  it('gets harder for the favourite as the line grows', () => {
    const easy = handicapProbabilities(m, 0).home;
    const hard = handicapProbabilities(m, -2).home;
    expect(hard).toBeLessThan(easy);
  });

  it('quotes a negative fair line when the home side is favoured', () => {
    const line = fairHandicapLine(scoreMatrix(2.1, 0.9));
    expect(line).toBeLessThan(0);
    // ...and roughly a coin flip at that line, which is what "fair" means.
    const { home, away } = handicapProbabilities(scoreMatrix(2.1, 0.9), line);
    expect(Math.abs(home - away)).toBeLessThan(0.1);
  });

  it('quotes a line near zero for an even fixture', () => {
    const even = scoreMatrix(1.3, 1.3);
    expect(Math.abs(fairHandicapLine(even))).toBeLessThanOrEqual(0.25);
  });
});

describe('totals', () => {
  const m = scoreMatrix(1.5, 1.3);

  it('partitions all probability across over, under and push', () => {
    for (const line of [1.5, 2, 2.5, 3, 3.5]) {
      const { over, under, push } = totalsProbabilities(m, line);
      expect(over + under + push).toBeCloseTo(1, 10);
    }
  });

  it('agrees with the prediction object on the 2.5 line', () => {
    const p = predictMatch(mid, mid);
    const direct = totalsProbabilities(
      scoreMatrix(p.expectedGoals.home, p.expectedGoals.away),
      2.5,
    );
    // Both routes read the same distribution, so they must agree closely.
    expect(direct.over).toBeCloseTo(p.over25Prob, 1);
  });

  it('falls monotonically as the line rises', () => {
    const lines = [1.5, 2.5, 3.5, 4.5];
    const overs = lines.map((l) => totalsProbabilities(m, l).over);
    for (let i = 1; i < overs.length; i++) {
      expect(overs[i]!).toBeLessThan(overs[i - 1]!);
    }
  });
});
