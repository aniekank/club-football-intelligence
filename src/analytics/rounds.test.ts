import { describe, it, expect } from 'vitest';
import { buildRounds, latestPlayedRound, nextRound } from './rounds';
import { buildProgression } from './progression';
import { computeStandings } from './standings';
import { PREMIER_LEAGUE } from '@/domain/competitions';
import type { DatasetSnapshot, Match, Team } from '@/domain/types';

/**
 * A round summary is a set of claims about what happened, and every one of them
 * is the kind of claim that can be quietly wrong: an "upset" measured against
 * the table AFTER the round is circular (the win is what moved them), a
 * "comeback" that only checks the second half counts 1-0 into 3-0, and a goal
 * count of 0 on an unplayed round is a fact the feed never stated.
 *
 * These lock all three.
 */

function makeTeam(id: string): Team {
  return {
    id, name: `Team ${id}`, shortName: id, code: id.toUpperCase().slice(0, 3),
    country: 'England', countryCode: 'ENG', crestUrl: null, primaryColor: null,
    secondaryColor: null, venue: null, manager: null,
    elo: 1500, attackRating: 50, defenseRating: 50,
  };
}

let seq = 0;
function makeMatch(
  home: string, away: string, hs: number | null, as: number | null,
  opts: { matchweek?: number | null; roundLabel?: string; ht?: [number, number] } = {},
): Match {
  seq += 1;
  const played = hs !== null && as !== null;
  const mw = opts.matchweek === undefined ? 1 : opts.matchweek;
  return {
    id: `m${seq}`, competitionId: 'epl', seasonId: 'epl-2026',
    matchweek: mw,
    roundLabel: opts.roundLabel ?? `Matchweek ${mw}`,
    // Day of month tracks the matchweek, so rounds sort by date the way a
    // season does rather than by insertion order.
    kickoff: `2026-08-${String((mw ?? 1) + 1).padStart(2, '0')}T15:00:00Z`,
    status: played ? 'FINISHED' : 'SCHEDULED', minute: played ? 90 : 0,
    venueKind: 'home-away', venue: null, homeTeamId: home, awayTeamId: away,
    homeScore: hs, awayScore: as,
    homeScoreHT: opts.ht ? opts.ht[0] : null,
    awayScoreHT: opts.ht ? opts.ht[1] : null,
    shootoutWinnerTeamId: null, teamStats: {}, events: [], shots: [],
  };
}

function makeSnapshot(teams: Team[], matches: Match[]): DatasetSnapshot {
  const standings = computeStandings({
    matches: matches.filter((m) => m.status === 'FINISHED'),
    teamIds: teams.map((t) => t.id), competition: PREMIER_LEAGUE, seasonId: 'epl-2026',
  });
  return {
    competition: PREMIER_LEAGUE,
    season: {
      id: 'epl-2026', competitionId: 'epl', label: '2026/2027', startYear: 2026,
      startDate: '2026-08-01', endDate: '2027-05-20', numTeams: teams.length,
      totalMatchweeks: 38, currentMatchweek: 2, isCurrent: true, championTeamId: null,
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

const IDS = Array.from({ length: 12 }, (_, i) => `t${i + 1}`);
const TEAMS = IDS.map(makeTeam);

/**
 * A first matchweek that produces a clear table: t1..t6 win, t12..t7 lose, and
 * the margins spread them out so the order is not a tiebreak accident.
 */
function matchweekOne(): Match[] {
  return [
    makeMatch('t1', 't12', 3, 0),
    makeMatch('t2', 't11', 3, 0),
    makeMatch('t3', 't10', 2, 0),
    makeMatch('t4', 't9', 2, 0),
    makeMatch('t5', 't8', 1, 0),
    makeMatch('t6', 't7', 1, 0),
  ];
}

describe('an upset is measured against the table before the round', () => {
  it('names the winner\'s position as it stood at kick-off, not after', () => {
    seq = 0;
    const matches = [
      ...matchweekOne(),
      // The bottom club beats the top one. Everyone else draws, so the round is
      // complete and nothing else disturbs the table.
      makeMatch('t12', 't1', 1, 0, { matchweek: 2 }),
      makeMatch('t11', 't2', 0, 0, { matchweek: 2 }),
      makeMatch('t10', 't3', 0, 0, { matchweek: 2 }),
      makeMatch('t9', 't4', 0, 0, { matchweek: 2 }),
      makeMatch('t8', 't5', 0, 0, { matchweek: 2 }),
      makeMatch('t7', 't6', 0, 0, { matchweek: 2 }),
    ];
    const snap = makeSnapshot(TEAMS, matches);
    const progression = buildProgression(snap);
    const rounds = buildRounds(snap, progression);

    const second = rounds.find((r) => r.matchweek === 2);
    expect(second).toBeDefined();

    const upset = second?.highlights.find((h) => h.kind === 'upset');
    expect(upset).toBeDefined();

    const t12 = progression?.clubs.find((c) => c.teamId === 't12');
    const before = t12?.points.find((p) => p.matchweek === 1)?.position;
    const after = t12?.points.find((p) => p.matchweek === 2)?.position;

    // The win itself lifts t12 several places. If the highlight quoted the
    // table it produced rather than the one it overturned, this would be the
    // number printed — so the two must differ for the assertion to mean
    // anything, and the detail must carry the earlier one.
    expect(before).not.toBe(after);
    expect(upset?.detail).toContain(String(before));
    expect(upset?.detail).not.toContain(`${after}th before`);
  });

  it('does not call a win by the higher-placed club an upset', () => {
    seq = 0;
    const matches = [
      ...matchweekOne(),
      makeMatch('t1', 't12', 1, 0, { matchweek: 2 }),
      makeMatch('t2', 't11', 0, 0, { matchweek: 2 }),
      makeMatch('t3', 't10', 0, 0, { matchweek: 2 }),
      makeMatch('t4', 't9', 0, 0, { matchweek: 2 }),
      makeMatch('t5', 't8', 0, 0, { matchweek: 2 }),
      makeMatch('t6', 't7', 0, 0, { matchweek: 2 }),
    ];
    const snap = makeSnapshot(TEAMS, matches);
    const rounds = buildRounds(snap, buildProgression(snap));
    const second = rounds.find((r) => r.matchweek === 2);
    expect(second?.highlights.some((h) => h.kind === 'upset')).toBe(false);
  });

  it('claims no upset in the opening round, where no prior table exists', () => {
    seq = 0;
    const snap = makeSnapshot(TEAMS, matchweekOne());
    const rounds = buildRounds(snap, buildProgression(snap));
    const first = rounds.find((r) => r.matchweek === 1);
    expect(first?.highlights.some((h) => h.kind === 'upset')).toBe(false);
  });
});

describe('a comeback needs the lead to change hands', () => {
  it('counts a half-time deficit turned into a win', () => {
    seq = 0;
    const snap = makeSnapshot(
      [makeTeam('a'), makeTeam('b')],
      [makeMatch('a', 'b', 2, 1, { ht: [0, 1] })],
    );
    const round = buildRounds(snap, null)[0];
    const comeback = round?.highlights.find((h) => h.kind === 'comeback');
    expect(comeback?.detail).toContain('a');
  });

  it('does not count a side that led at half-time and led by more at the end', () => {
    seq = 0;
    const snap = makeSnapshot(
      [makeTeam('a'), makeTeam('b')],
      [makeMatch('a', 'b', 3, 0, { ht: [1, 0] })],
    );
    const round = buildRounds(snap, null)[0];
    expect(round?.highlights.some((h) => h.kind === 'comeback')).toBe(false);
  });

  it('makes no comeback claim where half-time is not recorded', () => {
    seq = 0;
    const snap = makeSnapshot(
      [makeTeam('a'), makeTeam('b')],
      [makeMatch('a', 'b', 2, 1)],
    );
    const round = buildRounds(snap, null)[0];
    expect(round?.highlights.some((h) => h.kind === 'comeback')).toBe(false);
  });
});

describe('an unplayed round reports no goals rather than none', () => {
  it('leaves goals null until something is played', () => {
    seq = 0;
    const snap = makeSnapshot(
      [makeTeam('a'), makeTeam('b')],
      [makeMatch('a', 'b', null, null, { matchweek: 5 })],
    );
    const round = buildRounds(snap, null)[0];
    expect(round?.goals).toBeNull();
    expect(round?.complete).toBe(false);
    expect(round?.played).toBe(0);
  });

  it('reports a genuine goalless round as zero, not null', () => {
    seq = 0;
    const snap = makeSnapshot(
      [makeTeam('a'), makeTeam('b')],
      [makeMatch('a', 'b', 0, 0, { matchweek: 5 })],
    );
    const round = buildRounds(snap, null)[0];
    expect(round?.goals).toBe(0);
    expect(round?.complete).toBe(true);
  });
});

describe('rounds are ordered and grouped the way a season is read', () => {
  it('returns the newest round first', () => {
    seq = 0;
    const snap = makeSnapshot(TEAMS, [
      ...matchweekOne(),
      makeMatch('t1', 't2', 1, 1, { matchweek: 2 }),
    ]);
    const rounds = buildRounds(snap, null);
    expect(rounds[0]?.matchweek).toBe(2);
    expect(rounds[1]?.matchweek).toBe(1);
  });

  it('groups a knockout by its round label, where there is no matchweek', () => {
    seq = 0;
    const snap = makeSnapshot([makeTeam('a'), makeTeam('b'), makeTeam('c'), makeTeam('d')], [
      makeMatch('a', 'b', 1, 0, { matchweek: null, roundLabel: 'Semi-final' }),
      makeMatch('c', 'd', 2, 1, { matchweek: null, roundLabel: 'Semi-final' }),
      makeMatch('a', 'c', 1, 0, { matchweek: null, roundLabel: 'Final' }),
    ]);
    const rounds = buildRounds(snap, null);
    const semi = rounds.find((r) => r.label === 'Semi-final');
    expect(semi?.matches).toHaveLength(2);
    expect(semi?.matchweek).toBeNull();
    expect(rounds.find((r) => r.label === 'Final')?.matches).toHaveLength(1);
  });

  it('picks the last round played and the next one still to come', () => {
    seq = 0;
    const snap = makeSnapshot(TEAMS, [
      ...matchweekOne(),
      makeMatch('t1', 't2', 1, 1, { matchweek: 2 }),
      makeMatch('t3', 't4', null, null, { matchweek: 3 }),
    ]);
    const rounds = buildRounds(snap, null);
    expect(latestPlayedRound(rounds)?.matchweek).toBe(2);
    expect(nextRound(rounds)?.matchweek).toBe(3);
  });
});
