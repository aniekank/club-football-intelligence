import { describe, it, expect } from 'vitest';
import { computePer90, buildPlayerView, leaderboard, PEER_MINUTES_FLOOR } from './players';
import { PREMIER_LEAGUE } from '@/domain/competitions';
import type { DatasetSnapshot, Player, PlayerStats, Team } from '@/domain/types';

function stats(playerId: string, over: Partial<PlayerStats> = {}): PlayerStats {
  return {
    playerId, seasonId: 's', competitionId: 'epl',
    minutes: 900, appearances: 10, starts: 10, goals: 0, assists: 0,
    xG: 0, xA: 0, shots: 0, shotsOnTarget: 0, bigChancesCreated: 0, bigChancesMissed: 0,
    passes: 0, passesCompleted: 0, keyPasses: 0, passesFinalThird: 0,
    progressiveCarries: 0, tackles: 0, tacklesWon: 0, interceptions: 0, clearances: 0,
    ballRecoveries: 0, duelsWon: 0, duelsTotal: 0, aerialsWon: 0, touches: 0,
    touchesInBox: 0, dribblesCompleted: 0, dribblesAttempted: 0, dispossessed: 0,
    yellowCards: 0, redCards: 0, foulsCommitted: 0, foulsWon: 0,
    saves: 0, goalsConceded: 0, cleanSheets: 0, averageRating: null, ...over,
  };
}

function player(id: string, position: Player['position'] = 'MF'): Player {
  return {
    id, name: `Player ${id}`, teamId: 't1',
    affiliations: [{ teamId: 't1', from: '2026-08-01', to: null, onLoan: false }],
    shirtNumber: null, position, detailedPosition: 'CM', age: 25, birthDate: null,
    nationality: null, photoUrl: null, heightCm: null, foot: null, marketValueEur: null,
  };
}

const team: Team = {
  id: 't1', name: 'Test FC', shortName: 'Test', code: 'TST', country: 'England',
  countryCode: 'ENG', crestUrl: null, primaryColor: null, secondaryColor: null,
  venue: null, manager: null, elo: 1500, attackRating: 75, defenseRating: 75,
};

function snapshot(players: Player[], playerStats: PlayerStats[]): DatasetSnapshot {
  return {
    competition: PREMIER_LEAGUE,
    season: {
      id: 's', competitionId: 'epl', label: '2026/2027', startYear: 2026,
      startDate: '2026-08-01', endDate: '2027-05-20', numTeams: 20,
      totalMatchweeks: 38, currentMatchweek: 10, isCurrent: true, championTeamId: null,
    },
    relatedCompetitions: [], memberships: [], teams: [team], players, playerStats,
    matches: [], standings: [], priorRatings: [],
    generatedAt: '2026-08-23T00:00:00Z',
    meta: {
      source: 'test', sourceLabel: 'Test',
      capabilities: {
        hasXG: true, hasShotLocations: true, hasLineups: true, hasPlayerStats: true,
        hasMomentum: false, hasFormations: false, hasManagers: false,
        hasMarketValues: false, hasOdds: false, modeledMetrics: [],
      },
      fetchedAt: '2026-08-23T00:00:00Z', degraded: false,
    },
  };
}

describe('per-90 rates', () => {
  it('scales counting stats by minutes', () => {
    const p = computePer90(stats('a', { minutes: 450, goals: 5 }));
    expect(p.goals).toBe(1); // 5 in 450 minutes = 1 per 90
  });

  it('leaves ratios alone rather than dividing them by minutes', () => {
    // Pass accuracy is already normalised; a per-90 pass accuracy is nonsense.
    const p = computePer90(stats('a', { minutes: 450, passes: 100, passesCompleted: 80 }));
    expect(p.passAccuracy).toBe(80);
  });

  it('reports finishing over-performance as goals minus xG', () => {
    const p = computePer90(stats('a', { goals: 5, xG: 3.2 }));
    expect(p.goalsMinusXg).toBeCloseTo(1.8, 5);
  });
});

describe('percentiles', () => {
  /**
   * The bug this guards, found by reading a real player page: a midfielder with
   * zero interceptions showed "0th percentile" even though most of his peers
   * also had zero. The naive definition counts everyone tied with you as above
   * you, so a large tied block at zero all score 0 — which reads as a damning
   * weakness rather than "middle of a crowd".
   */
  it('gives a tied block its mid-rank, not the bottom of the range', () => {
    // Six players on zero interceptions, four with some.
    const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
    const rows = players.map((p, i) =>
      stats(p.id, { interceptions: i < 6 ? 0 : i, tackles: i + 1 }),
    );
    const snap = snapshot(players, rows);
    const view = buildPlayerView(snap, 'p0')!;
    // Mid-rank of a 6-strong tied block at the bottom of 10 = 30th percentile.
    expect(view.percentiles.interceptions).toBe(30);
    expect(view.percentiles.interceptions).not.toBe(0);
  });

  it('omits a metric the source never supplies rather than ranking it zero', () => {
    // Every player on zero: the metric is missing, not universally terrible.
    const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
    const rows = players.map((p, i) => stats(p.id, { touchesInBox: 0, tackles: i + 1 }));
    const view = buildPlayerView(snapshot(players, rows), 'p3')!;
    expect(view.percentiles.touchesInBox).toBeUndefined();
    expect(view.percentiles.tackles).toBeDefined();
  });

  it('ranks the best performer at the top', () => {
    const players = Array.from({ length: 10 }, (_, i) => player(`p${i}`));
    const rows = players.map((p, i) => stats(p.id, { goals: i }));
    const view = buildPlayerView(snapshot(players, rows), 'p9')!;
    expect(view.percentiles.goals).toBeGreaterThanOrEqual(95);
  });

  it('withholds percentiles when the peer pool is too small', () => {
    const players = [player('a'), player('b')];
    const rows = players.map((p, i) => stats(p.id, { goals: i + 1 }));
    const view = buildPlayerView(snapshot(players, rows), 'a')!;
    expect(view.peerCount).toBe(2);
    expect(Object.keys(view.percentiles)).toHaveLength(0);
  });

  it('keeps low-minute players out of the peer pool', () => {
    const players = Array.from({ length: 12 }, (_, i) => player(`p${i}`));
    const rows = players.map((p, i) =>
      stats(p.id, { minutes: i === 0 ? PEER_MINUTES_FLOOR - 1 : 900, goals: 1 }),
    );
    const view = buildPlayerView(snapshot(players, rows), 'p5')!;
    expect(view.peerCount).toBe(11);
  });
});

describe('leaderboards', () => {
  it('excludes cameos from per-90 boards', () => {
    // A single goal in 10 minutes is 9.0 per 90 and would top the board.
    const players = [player('cameo'), ...Array.from({ length: 10 }, (_, i) => player(`p${i}`))];
    const rows = [
      stats('cameo', { minutes: 10, goals: 1 }),
      ...Array.from({ length: 10 }, (_, i) => stats(`p${i}`, { minutes: 900, goals: 5 })),
    ];
    const board = leaderboard(snapshot(players, rows), 'goals', { per90: true });
    expect(board.some((r) => r.player.id === 'cameo')).toBe(false);
  });

  it('keeps cameos on TOTAL boards, where volume is the point', () => {
    const players = [player('cameo'), player('p0')];
    const rows = [stats('cameo', { minutes: 10, goals: 1 }), stats('p0', { goals: 5 })];
    const board = leaderboard(snapshot(players, rows), 'goals');
    expect(board.map((r) => r.player.id)).toEqual(['p0', 'cameo']);
  });
});
