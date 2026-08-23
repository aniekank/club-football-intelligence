import { describe, it, expect, beforeEach } from 'vitest';
import {
  setSnapshot, activateSnapshot, getTeam, getTeams, getMatch, getLiveMatches,
  getStandingFor, loadedKeys, activeKey, getSnapshot, __resetStore, capabilities,
} from './store';
import type { DatasetSnapshot, Match, Team } from '@/domain/types';
import { PREMIER_LEAGUE } from '@/domain/competitions';

function makeTeam(id: string, name: string): Team {
  return {
    id, name, shortName: name, code: id.toUpperCase().slice(0, 3),
    country: 'England', countryCode: 'ENG', crestUrl: null,
    primaryColor: null, secondaryColor: null, venue: null, manager: null,
    elo: 1500, attackRating: 50, defenseRating: 50,
  };
}

function makeMatch(id: string, home: string, away: string, over: Partial<Match> = {}): Match {
  return {
    id, competitionId: 'epl', seasonId: 's', matchweek: 1, roundLabel: 'Matchweek 1',
    kickoff: new Date().toISOString(), status: 'SCHEDULED', minute: 0,
    venueKind: 'home-away', venue: null, homeTeamId: home, awayTeamId: away,
    homeScore: null, awayScore: null, homeScoreHT: null, awayScoreHT: null,
    penalties: null, teamStats: {}, events: [], shots: [], ...over,
  };
}

function makeSnapshot(teams: Team[], matches: Match[]): DatasetSnapshot {
  return {
    competition: PREMIER_LEAGUE,
    season: {
      id: 's', competitionId: 'epl', label: '2026/2027', startYear: 2026,
      startDate: '2026-08-01', endDate: '2027-05-20', numTeams: teams.length,
      totalMatchweeks: 38, currentMatchweek: 1, isCurrent: true, championTeamId: null,
    },
    relatedCompetitions: [], memberships: [], teams, players: [], playerStats: [],
    matches, standings: [],
    generatedAt: new Date().toISOString(),
    meta: {
      source: 'test', sourceLabel: 'Test',
      capabilities: {
        hasXG: true, hasShotLocations: false, hasLineups: false, hasPlayerStats: false,
        hasMomentum: false, hasFormations: false, hasManagers: false,
        hasMarketValues: false, hasOdds: false, modeledMetrics: [],
      },
      fetchedAt: new Date().toISOString(), degraded: false,
    },
  };
}

beforeEach(() => __resetStore());

describe('index invalidation on snapshot swap', () => {
  /**
   * THE bug this store exists to prevent. Read through the indexes first so
   * they are populated, then swap the snapshot and read again. If the indexes
   * are keyed to anything other than snapshot identity, the second read hits a
   * stale map, every lookup misses, and the app renders blank while the data is
   * demonstrably present.
   */
  it('serves the new snapshot after a swap, not the stale index', () => {
    const first = makeSnapshot([makeTeam('1', 'Arsenal')], [makeMatch('m1', '1', '1')]);
    setSnapshot(first, 'epl-2026');
    expect(getTeam('1')?.name).toBe('Arsenal');
    expect(getMatch('m1')).toBeDefined();

    const second = makeSnapshot([makeTeam('2', 'Chelsea')], [makeMatch('m2', '2', '2')]);
    setSnapshot(second, 'epl-2027');

    expect(getTeam('2')?.name).toBe('Chelsea');
    expect(getMatch('m2')).toBeDefined();
    // The old snapshot's entities must be gone from the ACTIVE view.
    expect(getTeam('1')).toBeUndefined();
    expect(getMatch('m1')).toBeUndefined();
    // The list accessor and the keyed accessor must agree — disagreement
    // between them is the exact signature of the stale-index bug.
    expect(getTeams().map((t) => t.id)).toEqual(['2']);
  });

  it('keeps both editions cached and switches between them', () => {
    setSnapshot(makeSnapshot([makeTeam('1', 'Arsenal')], []), 'epl-2026');
    setSnapshot(makeSnapshot([makeTeam('2', 'Chelsea')], []), 'epl-2027');
    expect(loadedKeys().sort()).toEqual(['epl-2026', 'epl-2027']);

    expect(activateSnapshot('epl-2026')).toBe(true);
    expect(activeKey()).toBe('epl-2026');
    expect(getTeam('1')?.name).toBe('Arsenal');
    expect(getTeam('2')).toBeUndefined();

    expect(activateSnapshot('nope')).toBe(false);
    expect(activeKey()).toBe('epl-2026');
  });
});

describe('misses never throw', () => {
  it('returns undefined before any snapshot is loaded', () => {
    expect(getSnapshot()).toBeUndefined();
    expect(getTeam('anything')).toBeUndefined();
    expect(getTeams()).toEqual([]);
    expect(getStandingFor('x')).toBeUndefined();
    // Conservative defaults so a pre-load render hides metrics rather than
    // claiming to have them.
    expect(capabilities().hasXG).toBe(false);
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    setSnapshot(makeSnapshot([makeTeam('1', 'Arsenal')], []), 'k');
    // A knockout fixture with an undecided opponent hits this path constantly.
    expect(() => getTeam('tbd')).not.toThrow();
    expect(getTeam('tbd')).toBeUndefined();
  });
});

describe('stale live guard', () => {
  it('drops a match still flagged live long after kick-off', () => {
    const fresh = makeMatch('live', '1', '2', {
      status: 'LIVE', minute: 30,
      kickoff: new Date(Date.now() - 30 * 60_000).toISOString(),
    });
    const stale = makeMatch('stale', '1', '2', {
      status: 'LIVE', minute: 90,
      // Six hours ago: the provider simply never sent full time.
      kickoff: new Date(Date.now() - 6 * 3600_000).toISOString(),
    });
    setSnapshot(makeSnapshot([makeTeam('1', 'A'), makeTeam('2', 'B')], [fresh, stale]), 'k');
    expect(getLiveMatches().map((m) => m.id)).toEqual(['live']);
  });
});
