import { describe, it, expect } from 'vitest';
import { simulateSeason } from './season';
import { rateTeams, derivePriors } from './ratings';
import { computeStandings } from './standings';
import { PREMIER_LEAGUE } from '@/domain/competitions';
import type { DatasetSnapshot, Match, Team } from '@/domain/types';

function makeTeam(id: string, atk = 50, def = 50): Team {
  return {
    id, name: `Team ${id}`, shortName: id, code: id.toUpperCase().slice(0, 3),
    country: 'England', countryCode: 'ENG', crestUrl: null, primaryColor: null,
    secondaryColor: null, venue: null, manager: null,
    elo: 1500, attackRating: atk, defenseRating: def,
  };
}

let seq = 0;
function makeMatch(home: string, away: string, hs: number | null, as: number | null): Match {
  seq += 1;
  const played = hs !== null && as !== null;
  return {
    id: `m${seq}`, competitionId: 'epl', seasonId: 'epl-2026', matchweek: 1,
    roundLabel: 'MW', kickoff: `2026-08-${String((seq % 27) + 1).padStart(2, '0')}T15:00:00Z`,
    status: played ? 'FINISHED' : 'SCHEDULED', minute: played ? 90 : 0,
    venueKind: 'home-away', venue: null, homeTeamId: home, awayTeamId: away,
    homeScore: hs, awayScore: as, homeScoreHT: null, awayScoreHT: null,
    shootoutWinnerTeamId: null, teamStats: {}, events: [], shots: [],
  };
}

function makeSnapshot(teams: Team[], matches: Match[]): DatasetSnapshot {
  const standings = computeStandings({
    matches, teamIds: teams.map((t) => t.id), competition: PREMIER_LEAGUE, seasonId: 'epl-2026',
  });
  return {
    competition: PREMIER_LEAGUE,
    season: {
      id: 'epl-2026', competitionId: 'epl', label: '2026/2027', startYear: 2026,
      startDate: '2026-08-01', endDate: '2027-05-20', numTeams: teams.length,
      totalMatchweeks: 38, currentMatchweek: 1, isCurrent: true, championTeamId: null,
    },
    relatedCompetitions: [], memberships: [], teams, players: [], playerStats: [],
    matches, standings, transfers: [], priorRatings: [],
    generatedAt: '2026-08-23T00:00:00Z',
    meta: {
      source: 'test', sourceLabel: 'Test',
      capabilities: {
        hasXG: false, hasShotLocations: false, hasLineups: false, hasPlayerStats: false,
        hasMomentum: false, hasFormations: false, hasManagers: false,
        hasMarketValues: false, hasOdds: false, modeledMetrics: [],
      },
      fetchedAt: '2026-08-23T00:00:00Z', degraded: false,
    },
  };
}

/** A round-robin among `ids`, all unplayed. */
function roundRobin(ids: string[]): Match[] {
  const out: Match[] = [];
  for (const a of ids) for (const b of ids) if (a !== b) out.push(makeMatch(a, b, null, null));
  return out;
}

describe('the forecast is a probability distribution', () => {
  it('title probabilities sum to 1 across the division', () => {
    seq = 0;
    const teams = ['a', 'b', 'c', 'd'].map((id) => makeTeam(id));
    const snap = makeSnapshot(teams, roundRobin(['a', 'b', 'c', 'd']));
    const { forecasts } = simulateSeason(snap, teams, { runs: 2000 });
    const total = forecasts.reduce((s, f) => s + f.winTitle, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('relegation probabilities sum to the number of relegation places', () => {
    seq = 0;
    // 20 clubs so the Premier League's 18-20 relegation band is meaningful.
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const teams = ids.map((id) => makeTeam(id));
    const snap = makeSnapshot(teams, roundRobin(ids.slice(0, 6)));
    const { forecasts } = simulateSeason(snap, teams, { runs: 500 });
    const total = forecasts.reduce((s, f) => s + f.relegation, 0);
    expect(total).toBeCloseTo(3, 5);
  });

  it('orders the points quantiles', () => {
    seq = 0;
    const teams = ['a', 'b', 'c', 'd'].map((id) => makeTeam(id));
    const snap = makeSnapshot(teams, roundRobin(['a', 'b', 'c', 'd']));
    const { forecasts } = simulateSeason(snap, teams, { runs: 1000 });
    for (const f of forecasts) {
      const p = f.projectedPoints;
      expect(p.p10).toBeLessThanOrEqual(p.p25);
      expect(p.p25).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p75);
      expect(p.p75).toBeLessThanOrEqual(p.p90);
      expect(f.projectedRank.p10).toBeLessThanOrEqual(f.projectedRank.p90);
    }
  });
});

describe('reconciliation against results already played', () => {
  it('gives a completed season a certain champion', () => {
    seq = 0;
    // Every fixture played; A wins the lot. Nothing is left to simulate, so the
    // forecast must be a statement of fact, not a probability.
    const teams = ['a', 'b', 'c'].map((id) => makeTeam(id));
    const matches = [
      makeMatch('a', 'b', 3, 0), makeMatch('b', 'a', 0, 1),
      makeMatch('a', 'c', 2, 0), makeMatch('c', 'a', 0, 2),
      makeMatch('b', 'c', 1, 0), makeMatch('c', 'b', 0, 1),
    ];
    const snap = makeSnapshot(teams, matches);
    const { forecasts, remainingFixtures } = simulateSeason(snap, teams, { runs: 200 });
    expect(remainingFixtures).toBe(0);
    expect(forecasts.find((f) => f.teamId === 'a')!.winTitle).toBe(1);
    expect(forecasts.find((f) => f.teamId === 'b')!.winTitle).toBe(0);
    expect(forecasts.find((f) => f.teamId === 'c')!.winTitle).toBe(0);
  });

  it('carries an existing lead into the forecast', () => {
    seq = 0;
    const teams = ['a', 'b'].map((id) => makeTeam(id));
    // Identical strength, but A has banked three wins and only one game is left.
    const matches = [
      makeMatch('a', 'b', 5, 0), makeMatch('a', 'b', 5, 0), makeMatch('a', 'b', 5, 0),
      makeMatch('b', 'a', null, null),
    ];
    const snap = makeSnapshot(teams, matches);
    const { forecasts } = simulateSeason(snap, teams, { runs: 1000 });
    // A cannot be caught: 9 points and a +15 goal difference against 0.
    expect(forecasts.find((f) => f.teamId === 'a')!.winTitle).toBe(1);
  });

  it('respects a points deduction already applied to the table', () => {
    seq = 0;
    const teams = ['a', 'b'].map((id) => makeTeam(id));
    const matches = [makeMatch('a', 'b', 1, 0), makeMatch('b', 'a', null, null)];
    const snap = makeSnapshot(teams, matches);
    // Simulate the published table carrying a heavy deduction for A.
    const docked = {
      ...snap,
      standings: snap.standings.map((r) =>
        r.teamId === 'a' ? { ...r, points: r.points - 12 } : r,
      ),
    };
    const { forecasts } = simulateSeason(docked, teams, { runs: 1000 });
    // Docked to -9, A cannot win from one remaining fixture.
    expect(forecasts.find((f) => f.teamId === 'a')!.winTitle).toBe(0);
  });
});

describe('determinism', () => {
  it('replays identically for the same seed', () => {
    seq = 0;
    const teams = ['a', 'b', 'c'].map((id) => makeTeam(id));
    const snap = makeSnapshot(teams, roundRobin(['a', 'b', 'c']));
    const one = simulateSeason(snap, teams, { runs: 400, seed: 42 });
    const two = simulateSeason(snap, teams, { runs: 400, seed: 42 });
    expect(one.forecasts.map((f) => f.winTitle)).toEqual(two.forecasts.map((f) => f.winTitle));
  });

  it('does not favour a club alphabetically when clubs are identical', () => {
    seq = 0;
    // Four indistinguishable sides: each should win roughly a quarter of the
    // time. A deterministic tiebreak would hand every tie to the same club.
    const teams = ['a', 'b', 'c', 'd'].map((id) => makeTeam(id));
    const snap = makeSnapshot(teams, roundRobin(['a', 'b', 'c', 'd']));
    const { forecasts } = simulateSeason(snap, teams, { runs: 4000, seed: 7 });
    for (const f of forecasts) {
      expect(f.winTitle).toBeGreaterThan(0.18);
      expect(f.winTitle).toBeLessThan(0.32);
    }
  });
});

describe('strength drives the forecast', () => {
  it('makes the better side the favourite', () => {
    seq = 0;
    const teams = [makeTeam('good', 95, 90), makeTeam('mid'), makeTeam('poor', 35, 30)];
    const snap = makeSnapshot(teams, roundRobin(['good', 'mid', 'poor']));
    const { forecasts } = simulateSeason(snap, teams, { runs: 2000 });
    const good = forecasts.find((f) => f.teamId === 'good')!;
    const poor = forecasts.find((f) => f.teamId === 'poor')!;
    expect(good.winTitle).toBeGreaterThan(poor.winTitle);
    expect(good.projectedPoints.mean).toBeGreaterThan(poor.projectedPoints.mean);
  });
});

describe('early-season shrinkage', () => {
  it('does not crown a club on one 4-0 win', () => {
    seq = 0;
    /**
     * The scenario that motivated shrinkage. Twenty clubs, one matchweek
     * played, one of them won 4-0. Without shrinkage its per-game scoring rate
     * dwarfs the league and the model hands it the title. Its ratings must
     * still sit close to average, and its title probability must stay modest.
     */
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const teams = ids.map((id) => makeTeam(id));
    const played = [makeMatch('t0', 't1', 4, 0)];
    const rest = roundRobin(ids.slice(0, 8));
    const snap = makeSnapshot(teams, [...played, ...rest]);

    const { teams: rated } = rateTeams(snap);
    const hot = rated.find((t) => t.id === 't0')!;
    // 75 is exactly league average on this scale.
    expect(hot.attackRating).toBeLessThan(105);
    expect(hot.attackRating).toBeGreaterThan(75);

    const { forecasts } = simulateSeason(snap, rated, { runs: 1500 });
    const hotForecast = forecasts.find((f) => f.teamId === 't0')!;
    expect(hotForecast.winTitle).toBeLessThan(0.6);
  });

  it('leaves every club at the anchor rating before a ball is kicked', () => {
    seq = 0;
    const ids = ['a', 'b', 'c'];
    const teams = ids.map((id) => makeTeam(id));
    const snap = makeSnapshot(teams, roundRobin(ids));
    const { teams: rated } = rateTeams(snap);
    for (const t of rated) {
      expect(t.elo).toBe(1500);
      expect(t.attackRating).toBeCloseTo(75, 5);
    }
  });
});

describe('previous-season priors', () => {
  it('ranks last season on evidence, and promoted clubs below average', () => {
    const previous = [
      { teamId: 'champ', played: 38, goalsFor: 90, goalsAgainst: 28, xGFor: 84, xGAgainst: 30 },
      { teamId: 'mid', played: 38, goalsFor: 52, goalsAgainst: 52, xGFor: 51, xGAgainst: 53 },
      { teamId: 'poor', played: 38, goalsFor: 30, goalsAgainst: 80, xGFor: 33, xGAgainst: 78 },
    ];
    const priors = derivePriors(previous, ['champ', 'mid', 'poor', 'newcomer']);
    const by = new Map(priors.map((p) => [p.teamId, p]));

    expect(by.get('champ')!.attackRatio).toBeGreaterThan(1);
    expect(by.get('champ')!.defenseRatio).toBeLessThan(1); // concedes less
    expect(by.get('poor')!.attackRatio).toBeLessThan(1);
    expect(by.get('poor')!.defenseRatio).toBeGreaterThan(1);
    // The ordering is the property that matters. Not asserting mid ~= 1.0:
    // the average of this three-club set is dragged up by a 90-goal champion,
    // so a genuinely mid-table side sits slightly below it — correctly.
    expect(by.get('champ')!.attackRatio).toBeGreaterThan(by.get('mid')!.attackRatio);
    expect(by.get('mid')!.attackRatio).toBeGreaterThan(by.get('poor')!.attackRatio);
    expect(by.get('champ')!.defenseRatio).toBeLessThan(by.get('mid')!.defenseRatio);
    expect(by.get('mid')!.defenseRatio).toBeLessThan(by.get('poor')!.defenseRatio);

    // A club with no previous season in this division is promoted, and gets a
    // below-average prior rather than being silently treated as average.
    const promoted = by.get('newcomer')!;
    expect(promoted.promoted).toBe(true);
    expect(promoted.attackRatio).toBeLessThan(1);
    expect(promoted.defenseRatio).toBeGreaterThan(1);
  });

  it('regresses the prior rather than replaying last season outright', () => {
    const previous = [
      { teamId: 'a', played: 38, goalsFor: 100, goalsAgainst: 20, xGFor: 100, xGAgainst: 20 },
      { teamId: 'b', played: 38, goalsFor: 40, goalsAgainst: 40, xGFor: 40, xGAgainst: 40 },
      { teamId: 'c', played: 38, goalsFor: 40, goalsAgainst: 40, xGFor: 40, xGAgainst: 40 },
    ];
    const priors = derivePriors(previous, ['a', 'b', 'c']);
    const a = priors.find((p) => p.teamId === 'a')!;
    // A outscored the league by ~66%; the prior must keep the direction but not
    // the full magnitude — last year's champions are not certain to repeat.
    const rawRatio = (100 / 38) / (180 / 114);
    expect(a.attackRatio).toBeGreaterThan(1);
    expect(a.attackRatio).toBeLessThan(rawRatio);
  });

  it('returns nothing when there is no previous season to learn from', () => {
    expect(derivePriors([], ['a', 'b'])).toEqual([]);
    expect(derivePriors([{ teamId: 'a', played: 0, goalsFor: 0, goalsAgainst: 0 }], ['a'])).toEqual([]);
  });

  it('lets the prior dominate in August and the season take over by spring', () => {
    seq = 0;
    const teams = ['strong', 'weak'].map((id) => makeTeam(id));
    const priorRatings = [
      { teamId: 'strong', attackRatio: 1.4, defenseRatio: 0.7, promoted: false },
      { teamId: 'weak', attackRatio: 0.7, defenseRatio: 1.4, promoted: false },
    ];

    // One game in: 'weak' has won, but the prior should still dominate.
    const august = { ...makeSnapshot(teams, [makeMatch('weak', 'strong', 1, 0)]), priorRatings };
    const augustRated = rateTeams(august).teams;
    const augStrong = augustRated.find((t) => t.id === 'strong')!;
    const augWeak = augustRated.find((t) => t.id === 'weak')!;
    expect(augStrong.attackRating).toBeGreaterThan(augWeak.attackRating);

    // Twenty games in with 'weak' winning them all: the evidence must now win.
    seq = 0;
    const played = Array.from({ length: 20 }, () => makeMatch('weak', 'strong', 3, 0));
    const spring = { ...makeSnapshot(teams, played), priorRatings };
    const springRated = rateTeams(spring).teams;
    const sprStrong = springRated.find((t) => t.id === 'strong')!;
    const sprWeak = springRated.find((t) => t.id === 'weak')!;
    expect(sprWeak.attackRating).toBeGreaterThan(sprStrong.attackRating);
  });
});
