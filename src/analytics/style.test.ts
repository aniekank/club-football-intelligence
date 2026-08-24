import { describe, it, expect } from 'vitest';
import { teamStyle, styleContrasts, styleHeadline } from './style';
import { PREMIER_LEAGUE } from '@/domain/competitions';
import type { DatasetSnapshot, MatchTeamStats } from '@/domain/types';

const stats = (teamId: string, over: Partial<MatchTeamStats> = {}): MatchTeamStats => ({
  teamId,
  possession: 50, shots: 10, shotsOnTarget: 4, xG: 1.2, xGOnTarget: 1.0,
  corners: 5, fouls: 10, offsides: 2, passes: 400, passAccuracy: 80,
  bigChances: 2, saves: 3, yellowCards: 1, redCards: 0,
  fieldTilt: 50, ppda: 12,
  xGOpenPlay: 1.0, xGSetPlay: 0.2, shotsInsideBox: 6, shotsOutsideBox: 4,
  touchesInBox: 20, longBalls: 20, crosses: 10, aerialsWon: 15, duelsWon: 40,
  tackles: 15, interceptions: 8, clearances: 20,
  ...over,
});

function snapshot(rows: { home: MatchTeamStats; away: MatchTeamStats }[]): DatasetSnapshot {
  return {
    competition: PREMIER_LEAGUE,
    season: { id: 's', competitionId: 'epl', label: '2026', startYear: 2026, isCurrent: true, currentMatchweek: 1, totalMatchweeks: 38 },
    teams: [], players: [], playerStats: [], standings: [], transfers: [],
    memberships: [], priorRatings: [], markets: [],
    matches: rows.map((r, i) => ({
      id: String(i), competitionId: 'epl', seasonId: 's',
      homeTeamId: r.home.teamId, awayTeamId: r.away.teamId,
      kickoff: '2026-08-01T12:00:00Z', status: 'FINISHED' as const,
      homeScore: 1, awayScore: 1, matchweek: 1, roundLabel: 'MW1',
      venue: null, venueKind: 'home-away' as const, referee: null, attendance: null,
      minute: 90, livePhase: null,
      teamStats: { [r.home.teamId]: r.home, [r.away.teamId]: r.away },
      shots: [], events: [], lineups: {}, formations: { home: null, away: null }, momentum: null,
    })),
    meta: {} as DatasetSnapshot['meta'],
  } as unknown as DatasetSnapshot;
}

describe('teamStyle', () => {
  it('averages only the matches that carry detail', () => {
    const snap = snapshot([
      { home: stats('a', { possession: 60 }), away: stats('b', { possession: 40 }) },
      { home: stats('b', { possession: 44 }), away: stats('a', { possession: 56 }) },
      // Never fetched: an all-null stats row must not drag the average toward 0.
      { home: stats('a', { possession: null }), away: stats('b', { possession: null }) },
    ]);
    const a = teamStyle(snap, 'a');
    expect(a.matches).toBe(2);
    expect(a.possession).toBeCloseTo(58, 5);
  });

  it('reports set-piece share as a share, not a total', () => {
    const snap = snapshot([
      { home: stats('a', { xGOpenPlay: 0.07, xGSetPlay: 0.94 }), away: stats('b') },
    ]);
    // The Hull 2-0: nearly all of their threat came from dead balls.
    expect(teamStyle(snap, 'a').setPieceShare).toBeCloseTo(93.07, 1);
  });

  it('returns null for a measure the competition does not supply', () => {
    const snap = snapshot([
      { home: stats('a', { xG: null, xGOpenPlay: null, xGSetPlay: null }), away: stats('b') },
    ]);
    const a = teamStyle(snap, 'a');
    expect(a.setPieceShare).toBeNull();
    expect(a.shotQuality).toBeNull();
    // Possession still works — one missing measure does not void the profile.
    expect(a.possession).toBe(50);
  });
});

describe('styleContrasts', () => {
  it('omits a row neither side has data for', () => {
    const snap = snapshot([
      { home: stats('a', { ppda: null }), away: stats('b', { ppda: null }) },
    ]);
    const rows = styleContrasts(teamStyle(snap, 'a'), teamStyle(snap, 'b'));
    expect(rows.map((r) => r.key)).not.toContain('press');
    expect(rows.map((r) => r.key)).toContain('possession');
  });
});

describe('styleHeadline', () => {
  it('names the side that will have the ball', () => {
    const snap = snapshot([
      { home: stats('a', { possession: 65 }), away: stats('b', { possession: 35 }) },
    ]);
    const line = styleHeadline(teamStyle(snap, 'a'), teamStyle(snap, 'b'), 'Alpha', 'Beta');
    expect(line).toContain('Alpha');
    expect(line).toMatch(/have the ball/);
  });

  it('reads PPDA the right way round', () => {
    /**
     * Passes allowed per defensive action: LOWER is the more intense press.
     * Getting this backwards would name the passive side as the aggressive one
     * and read entirely plausibly.
     */
    const snap = snapshot([
      { home: stats('a', { possession: 50, ppda: 7 }), away: stats('b', { possession: 50, ppda: 18 }) },
    ]);
    const line = styleHeadline(teamStyle(snap, 'a'), teamStyle(snap, 'b'), 'Alpha', 'Beta');
    expect(line).toBe('Alpha press higher up than Beta do.');
  });

  it('says nothing when the sides are genuinely alike', () => {
    const snap = snapshot([{ home: stats('a'), away: stats('b') }]);
    expect(styleHeadline(teamStyle(snap, 'a'), teamStyle(snap, 'b'), 'Alpha', 'Beta')).toBeNull();
  });
});

describe('a thin sample does not get a confident sentence', () => {
  it('still produces the numbers', () => {
    const snap = snapshot([
      { home: stats('a', { possession: 65 }), away: stats('b', { possession: 35 }) },
    ]);
    const a = teamStyle(snap, 'a');
    expect(a.matches).toBe(1);
    expect(styleContrasts(a, teamStyle(snap, 'b')).length).toBeGreaterThan(0);
  });

  it('leaves the suppression to the surface, which knows the sample', () => {
    /**
     * `styleHeadline` deliberately does NOT gate on sample size: it is a pure
     * function of two profiles, and the profiles carry `matches` so the caller
     * can decide. Keeping the policy in the component means the engine stays
     * testable on its arithmetic alone.
     */
    const snap = snapshot([
      { home: stats('a', { possession: 65 }), away: stats('b', { possession: 35 }) },
    ]);
    expect(styleHeadline(teamStyle(snap, 'a'), teamStyle(snap, 'b'), 'Alpha', 'Beta')).not.toBeNull();
  });
});
