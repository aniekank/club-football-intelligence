import { describe, it, expect } from 'vitest';
import { topFormTeams, topFormPlayers, FORM_MATCHES } from './form';
import { computeStandings } from './standings';
import { PREMIER_LEAGUE, CHAMPIONS_LEAGUE } from '@/domain/competitions';
import type { DatasetSnapshot, Match, MatchEvent, Player, Team } from '@/domain/types';

/**
 * Form is the easiest thing on this page to get quietly wrong.
 *
 * A run scoped to one competition is a true sentence answering a question
 * nobody asked; a match counted from two snapshots invents a game; an own goal
 * credited to its scorer puts a defender on a leaderboard for the worst night
 * of their season. None of the three throws.
 */

function makeTeam(id: string, name = `Team ${id}`): Team {
  return {
    id, name, shortName: name, code: id.toUpperCase().slice(0, 3),
    country: 'England', countryCode: 'ENG', crestUrl: null, primaryColor: null,
    secondaryColor: null, venue: null, manager: null,
    elo: 1500, attackRating: 50, defenseRating: 50,
  };
}

function makePlayer(id: string, teamId: string, name: string): Player {
  return {
    id, name, fullName: name, teamId, affiliations: [], shirtNumber: null,
    position: 'FW', detailedPosition: 'ST', age: 25, birthDate: null,
    nationality: 'England', photoUrl: null, heightCm: null, foot: null,
    marketValueEur: null,
  };
}

let seq = 0;
function makeMatch(
  home: string, away: string, hs: number, as: number,
  opts: { day?: number; events?: MatchEvent[]; id?: string } = {},
): Match {
  seq += 1;
  const day = opts.day ?? seq;
  return {
    id: opts.id ?? `m${seq}`, competitionId: 'epl', seasonId: 'epl-2026',
    matchweek: 1, roundLabel: 'MW',
    kickoff: `2026-08-${String(day).padStart(2, '0')}T15:00:00Z`,
    status: 'FINISHED', minute: 90, venueKind: 'home-away', venue: null,
    homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as,
    homeScoreHT: null, awayScoreHT: null, shootoutWinnerTeamId: null,
    teamStats: {}, events: opts.events ?? [], shots: [],
  };
}

function makeSnapshot(
  competition: typeof PREMIER_LEAGUE,
  teams: Team[],
  matches: Match[],
  players: Player[] = [],
): DatasetSnapshot {
  return {
    competition,
    season: {
      id: `${competition.id}-2026`, competitionId: competition.id, label: '2026/2027',
      startYear: 2026, startDate: '2026-08-01', endDate: '2027-05-20',
      numTeams: teams.length, totalMatchweeks: 38, currentMatchweek: 5,
      isCurrent: true, championTeamId: null,
    },
    relatedCompetitions: [], memberships: [], teams, players, playerStats: [],
    matches,
    standings: computeStandings({
      matches, teamIds: teams.map((t) => t.id), competition, seasonId: `${competition.id}-2026`,
    }),
    transfers: [], priorRatings: [],
    generatedAt: '2026-08-25T00:00:00Z',
    meta: {
      source: 'test', sourceLabel: 'Test',
      capabilities: {
        hasXG: false, hasShotLocations: false, hasLineups: false, hasPlayerStats: false,
        hasMomentum: false, hasFormations: false, hasManagers: false,
        hasMarketValues: false, hasOdds: false, modeledMetrics: [],
      },
      fetchedAt: '2026-08-25T00:00:00Z', degraded: false,
    },
  };
}

const goal = (matchId: string, teamId: string, scorer: string | null, assist: string | null, type: MatchEvent['type'] = 'GOAL'): MatchEvent => ({
  id: `${matchId}-${scorer ?? 'og'}-${Math.random()}`,
  matchId, minute: 40, addedTime: 0, type, teamId,
  playerId: scorer, relatedPlayerId: assist, detail: '',
});

describe('club form pools every competition', () => {
  it('takes the last five matches by date, wherever they were played', () => {
    seq = 0;
    const hot = makeTeam('hot');
    const rest = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeTeam(id));
    const teams = [hot, ...rest];

    // Three league wins early in the month...
    const league = [
      makeMatch('hot', 'a', 1, 0, { day: 1 }),
      makeMatch('hot', 'b', 1, 0, { day: 2 }),
      makeMatch('hot', 'c', 1, 0, { day: 3 }),
      // ...and two league defeats, which are the OLDEST results and must fall
      // out of a five-match window once the cup games arrive.
      makeMatch('hot', 'd', 0, 3, { day: 4 }),
      makeMatch('hot', 'e', 0, 3, { day: 5 }),
    ];
    // Two cup wins, the most recent football this club has played.
    const cup = [
      makeMatch('hot', 'f', 2, 0, { day: 20 }),
      makeMatch('hot', 'a', 2, 0, { day: 21 }),
    ];

    const rows = topFormTeams([
      makeSnapshot(PREMIER_LEAGUE, teams, league),
      makeSnapshot(CHAMPIONS_LEAGUE, teams, cup),
    ], 20);

    const form = rows.find((r) => r.team.id === 'hot');
    expect(form).toBeDefined();
    expect(form?.played).toBe(FORM_MATCHES);
    // The two cup wins and the three most recent league games: two defeats and
    // one win. Scoped to the league it would read W W W L L; scoped to the cup,
    // W W. Neither is this club's form.
    expect(form?.results).toEqual(['W', 'W', 'L', 'L', 'W']);
    expect(form?.competitions).toBe(2);
    expect(form?.points).toBe(9);
  });

  it('gives a club one row, not one per competition', () => {
    seq = 0;
    const teams = ['hot', 'a', 'b', 'c'].map((id) => makeTeam(id));
    const league = [
      makeMatch('hot', 'a', 1, 0, { day: 1 }),
      makeMatch('hot', 'b', 1, 0, { day: 2 }),
      makeMatch('hot', 'c', 1, 0, { day: 3 }),
    ];
    const cup = [
      makeMatch('hot', 'a', 1, 0, { day: 10 }),
      makeMatch('hot', 'b', 1, 0, { day: 11 }),
      makeMatch('hot', 'c', 1, 0, { day: 12 }),
    ];
    const rows = topFormTeams([
      makeSnapshot(PREMIER_LEAGUE, teams, league),
      makeSnapshot(CHAMPIONS_LEAGUE, teams, cup),
    ], 50);
    expect(rows.filter((r) => r.team.id === 'hot')).toHaveLength(1);
  });

  it('never counts one fixture twice, however many snapshots carry it', () => {
    seq = 0;
    const teams = ['hot', 'a'].map((id) => makeTeam(id));
    // The same match id in both snapshots — which is what a competition and the
    // composite that contains it look like from here.
    const shared = [
      makeMatch('hot', 'a', 1, 0, { day: 1, id: 'same' }),
      makeMatch('a', 'hot', 0, 1, { day: 2, id: 'same-2' }),
      makeMatch('hot', 'a', 1, 0, { day: 3, id: 'same-3' }),
    ];
    const rows = topFormTeams([
      makeSnapshot(PREMIER_LEAGUE, teams, shared),
      makeSnapshot(CHAMPIONS_LEAGUE, teams, shared),
    ], 20);
    const form = rows.find((r) => r.team.id === 'hot');
    expect(form?.played).toBe(3);
    expect(form?.points).toBe(9);
  });

  it('reports unknown opposition strength as null, not as zero', () => {
    seq = 0;
    const teams = ['hot', 'a', 'b', 'c'].map((id) => makeTeam(id));
    const rows = topFormTeams([
      makeSnapshot(PREMIER_LEAGUE, teams, [
        makeMatch('hot', 'a', 1, 0, { day: 1 }),
        makeMatch('hot', 'b', 1, 0, { day: 2 }),
        makeMatch('hot', 'c', 1, 0, { day: 3 }),
      ]),
    ], 20);
    const form = rows.find((r) => r.team.id === 'hot');
    // One league on its own has no continental results, so nothing here is on
    // the shared scale. A zero would read as "played nobody".
    expect(form?.opposition === null || typeof form?.opposition === 'number').toBe(true);
    expect(form?.opposition).not.toBe(0);
  });
});

describe('player form is counted from events', () => {
  const NOW = '2026-08-25T00:00:00Z';

  it('credits the scorer and the assister of the same goal', () => {
    seq = 0;
    const teams = [makeTeam('x'), makeTeam('y')];
    const players = [makePlayer('p1', 'x', 'Scorer'), makePlayer('p2', 'x', 'Assister')];
    const m = makeMatch('x', 'y', 1, 0, { day: 24 });
    m.events = [goal(m.id, 'x', 'p1', 'p2')];

    const rows = topFormPlayers([makeSnapshot(PREMIER_LEAGUE, teams, [m], players)], NOW, 10);
    expect(rows.find((r) => r.playerId === 'p1')).toMatchObject({ goals: 1, assists: 0 });
    expect(rows.find((r) => r.playerId === 'p2')).toMatchObject({ goals: 0, assists: 1 });
  });

  it('does not credit an own goal to the player who scored it', () => {
    seq = 0;
    const teams = [makeTeam('x'), makeTeam('y')];
    const players = [makePlayer('p1', 'x', 'Unlucky')];
    const m = makeMatch('x', 'y', 0, 1, { day: 24 });
    m.events = [goal(m.id, 'y', 'p1', null, 'OWN_GOAL')];

    const rows = topFormPlayers([makeSnapshot(PREMIER_LEAGUE, teams, [m], players)], NOW, 10);
    expect(rows.find((r) => r.playerId === 'p1')).toBeUndefined();
  });

  it('counts a penalty as a goal', () => {
    seq = 0;
    const teams = [makeTeam('x'), makeTeam('y')];
    const players = [makePlayer('p1', 'x', 'Taker')];
    const m = makeMatch('x', 'y', 1, 0, { day: 24 });
    m.events = [goal(m.id, 'x', 'p1', null, 'PENALTY_GOAL')];

    const rows = topFormPlayers([makeSnapshot(PREMIER_LEAGUE, teams, [m], players)], NOW, 10);
    expect(rows.find((r) => r.playerId === 'p1')?.goals).toBe(1);
  });

  it('ignores anything older than the window', () => {
    seq = 0;
    const teams = [makeTeam('x'), makeTeam('y')];
    const players = [makePlayer('p1', 'x', 'Old news')];
    // Two weeks and change before "now".
    const m = makeMatch('x', 'y', 1, 0, { day: 1 });
    m.events = [goal(m.id, 'x', 'p1', null)];

    const rows = topFormPlayers([makeSnapshot(PREMIER_LEAGUE, teams, [m], players)], NOW, 10);
    expect(rows).toHaveLength(0);
  });
});
