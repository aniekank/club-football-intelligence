import { describe, it, expect } from 'vitest';
import { solveLeagueStrength, rankClubsAcrossLeagues, crossLeagueMatches, MIN_CROSS_MATCHES } from './crossLeague';
import { PREMIER_LEAGUE, LA_LIGA, SERIE_A, CHAMPIONS_LEAGUE } from '@/domain/competitions';
import type { DatasetSnapshot, Match, Team } from '@/domain/types';

const team = (id: string, elo: number): Team => ({
  id, name: `T${id}`, shortName: `T${id}`, code: id.slice(0, 3).toUpperCase(),
  country: 'X', countryCode: 'X', crestUrl: null, primaryColor: null, secondaryColor: null,
  venue: null, manager: null, elo, attackRating: 60, defenseRating: 60,
});

const match = (home: string, away: string, hs: number, as: number): Match => ({
  id: `${home}-${away}`, competitionId: 'ucl', seasonId: 's',
  homeTeamId: home, awayTeamId: away, kickoff: '2026-01-01T00:00:00Z',
  status: 'FINISHED', homeScore: hs, awayScore: as, homeScoreHT: null, awayScoreHT: null,
  shootoutWinnerTeamId: null, matchweek: 1, roundLabel: 'MD1',
  venue: null, venueKind: 'home-away', referee: null, attendance: null,
  minute: 90, livePhase: null, teamStats: {}, shots: [], events: [],
  lineups: {}, formations: { home: null, away: null }, momentum: null,
  aggregateMatchId: null,
} as unknown as Match);

const snap = (
  competition: typeof PREMIER_LEAGUE, teams: Team[], matches: Match[] = [],
): DatasetSnapshot => ({
  competition, teams, matches,
  season: { id: 's', competitionId: competition.id, label: '2026', startYear: 2026, isCurrent: true, currentMatchweek: 1, totalMatchweeks: 38 },
  players: [], playerStats: [], standings: [], transfers: [], memberships: [],
  priorRatings: [], markets: [], meta: {} as DatasetSnapshot['meta'],
} as unknown as DatasetSnapshot);

/** Two leagues, and a continental competition where they meet. */
function world(results: [string, string, number, number][]) {
  const eng = snap(PREMIER_LEAGUE, [team('e1', 1600), team('e2', 1500)]);
  const esp = snap(LA_LIGA, [team('s1', 1600), team('s2', 1500)]);
  const ucl = snap(CHAMPIONS_LEAGUE, [], results.map(([h, a, hs, as]) => match(h, a, hs, as)));
  return [eng, esp, ucl];
}

describe('what counts as evidence', () => {
  it('ignores a continental tie between two clubs of the SAME league', () => {
    // Arsenal v Spurs in the Champions League says everything about those two
    // clubs and nothing about England versus anywhere.
    const { observations } = crossLeagueMatches(world([['e1', 'e2', 3, 0]]));
    expect(observations).toEqual([]);
  });

  it('counts a tie between clubs of different leagues', () => {
    const { observations } = crossLeagueMatches(world([['e1', 's1', 2, 0]]));
    expect(observations).toHaveLength(1);
    expect(observations[0]!.diff).toBe(2);
  });

  it('ignores domestic matches entirely', () => {
    const eng = snap(PREMIER_LEAGUE, [team('e1', 1600), team('e2', 1500)], [match('e1', 'e2', 5, 0)]);
    const esp = snap(LA_LIGA, [team('s1', 1600)]);
    expect(crossLeagueMatches([eng, esp]).observations).toEqual([]);
  });
});

describe('solving league strength', () => {
  const many = (h: string, a: string, hs: number, as: number, n: number) =>
    Array.from({ length: n }, (_, i) => [h, a, hs, as] as [string, string, number, number])
      .map(([x, y, p, q], i) => [x, y, p, q] as [string, string, number, number]);

  it('puts the league that wins ahead', () => {
    const leagues = solveLeagueStrength(world(many('e1', 's1', 2, 0, 10)));
    const eng = leagues.find((l) => l.competitionId === 'epl')!;
    const esp = leagues.find((l) => l.competitionId === 'laliga')!;
    expect(eng.offset).toBeGreaterThan(esp.offset);
  });

  it('centres the system on zero, so it cannot drift', () => {
    const leagues = solveLeagueStrength(world(many('e1', 's1', 2, 0, 10)));
    const sum = leagues.reduce((n, l) => n + l.rawOffset, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-6);
  });

  it('shrinks a figure that rests on almost nothing', () => {
    /**
     * Two leagues, one 6-0 thrashing. The raw signal is enormous and worthless;
     * shrinkage has to pull it most of the way back or a single freak result
     * reorders the world.
     */
    const leagues = solveLeagueStrength(world(many('e1', 's1', 6, 0, 1)));
    const eng = leagues.find((l) => l.competitionId === 'epl')!;
    expect(Math.abs(eng.rawOffset)).toBeGreaterThan(2);
    expect(Math.abs(eng.offset)).toBeLessThan(Math.abs(eng.rawOffset) / 3);
  });

  it('keeps most of a figure that rests on a lot', () => {
    const leagues = solveLeagueStrength(world(many('e1', 's1', 1, 0, 100)));
    const eng = leagues.find((l) => l.competitionId === 'epl')!;
    expect(eng.confidence).toBeGreaterThan(0.8);
  });
});

describe('refusing to rank', () => {
  it('leaves a league unranked below the evidence floor', () => {
    const leagues = solveLeagueStrength(world([['e1', 's1', 1, 0]]));
    expect(leagues.every((l) => !l.ranked)).toBe(true);
    expect(leagues[0]!.matches).toBeLessThan(MIN_CROSS_MATCHES);
  });

  it('excludes clubs from unranked leagues rather than flooring them', () => {
    // A club cannot be placed on a shared scale when the gap between its league
    // and everyone else's has not been measured.
    const { clubs } = rankClubsAcrossLeagues(world([['e1', 's1', 1, 0]]));
    expect(clubs).toEqual([]);
  });

  it('needs more than one opponent league, not just enough matches', () => {
    /**
     * Two leagues playing each other twenty times is a rivalry, not a place in
     * a world order — the pair could both be strong or both weak and the
     * matches between them could not tell you which. The rule requires a second
     * opponent, and this asserts it holds even when match COUNT is plentiful.
     */
    const results: [string, string, number, number][] = Array.from(
      { length: 20 }, () => ['e1', 's1', 2, 0],
    );
    const leagues = solveLeagueStrength(world(results));
    expect(leagues.every((l) => l.matches >= MIN_CROSS_MATCHES)).toBe(true);
    expect(leagues.every((l) => l.ranked)).toBe(false);
  });

  it('ranks clubs once the leagues are genuinely connected', () => {
    const ita = snap(SERIE_A, [team('i1', 1600), team('i2', 1500)]);
    const results: [string, string, number, number][] = [
      ...Array.from({ length: 8 }, () => ['e1', 's1', 2, 0] as [string, string, number, number]),
      ...Array.from({ length: 8 }, () => ['e1', 'i1', 2, 0] as [string, string, number, number]),
      ...Array.from({ length: 8 }, () => ['s1', 'i1', 1, 0] as [string, string, number, number]),
    ];
    const [eng, esp] = world(results);
    const ucl = snap(CHAMPIONS_LEAGUE, [], results.map(([h, a, hs, as]) => match(h, a, hs, as)));
    const { clubs, leagues } = rankClubsAcrossLeagues([eng!, esp!, ita, ucl]);

    expect(leagues.every((l) => l.ranked)).toBe(true);
    expect(clubs.length).toBe(6);
    // Sorted by the shared scale, not by domestic rating.
    const ratings = clubs.map((c) => c.crossElo);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
    // England beat both others; its clubs carry the largest adjustment.
    const adj = new Map(leagues.map((l) => [l.competitionId, l.offset]));
    expect(adj.get('epl')!).toBeGreaterThan(adj.get('laliga')!);
    expect(adj.get('laliga')!).toBeGreaterThan(adj.get('seriea')!);
  });
});
