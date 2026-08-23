import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './fotmob';
import { checkSnapshot } from '@/domain/schema';

/**
 * Hermetic adapter tests — no network. They encode the bugs the live probe
 * caught, so a refactor cannot quietly reintroduce them.
 */

const team = (id: number, name: string) => ({ id: String(id), name, shortName: name });

function tableRow(id: number, name: string, idx: number) {
  return {
    id, name, shortName: name, played: 0, wins: 0, draws: 0, losses: 0,
    goalConDiff: 0, pts: 0, idx, deduction: null,
  };
}

function fixture(
  id: number, home: [number, string], away: [number, string],
  round: string | number, roundName: string | number,
  score: string | null,
) {
  return {
    id: String(id),
    round: String(round),
    roundName,
    home: team(home[0], home[1]),
    away: team(away[0], away[1]),
    status: {
      utcTime: '2026-09-16T19:00:00Z',
      finished: score !== null,
      started: score !== null,
      cancelled: false,
      scoreStr: score ?? undefined,
      reason: score !== null ? { short: 'FT', shortKey: 'finished' } : undefined,
    },
  };
}

describe('Swiss-model league phase', () => {
  /**
   * REGRESSION (found by the live probe, 2026-08-23): UEFA ships the league
   * phase and the knockout bracket in ONE fixture list. Counting the knockout
   * ties into the table gave Arsenal 15 played and PSG 17, when every club
   * plays exactly 8 in the league phase. Only numeric rounds belong in the table.
   */
  const league = {
    details: { id: 42, name: 'Champions League', selectedSeason: '2026/2027' },
    table: {
      0: undefined,
    } as never,
    fixtures: {
      allMatches: [
        fixture(1, [10, 'Alpha'], [20, 'Beta'], 1, 1, '2 - 0'),
        fixture(2, [20, 'Beta'], [30, 'Gamma'], 2, 2, '1 - 1'),
        fixture(3, [30, 'Gamma'], [10, 'Alpha'], 3, 3, '0 - 3'),
        // Knockout ties — must NOT reach the table.
        fixture(4, [10, 'Alpha'], [20, 'Beta'], 'playoff', 'playoff', '4 - 0'),
        fixture(5, [10, 'Alpha'], [30, 'Gamma'], '1/8', 'Round of 16', '5 - 0'),
        fixture(6, [10, 'Alpha'], [20, 'Beta'], 'final', 'Final', '1 - 0'),
      ],
    },
  };

  const withTable = {
    ...league,
    table: [{ data: {
      legend: [],
      table: { all: [tableRow(10, 'Alpha', 1), tableRow(20, 'Beta', 2), tableRow(30, 'Gamma', 3)] },
      isCurrentSeason: true,
      selectedSeason: '2026/2027',
    } }],
  };

  it('keeps knockout ties out of the league-phase table', async () => {
    const snap = await buildSnapshot('ucl', withTable, { maxDetailRequests: 0 });
    const alpha = snap.standings.find((r) => r.teamId === '10')!;
    // Alpha appears in 5 fixtures but only 2 are league phase.
    expect(alpha.played).toBe(2);
    expect(alpha.points).toBe(6);
    // The knockout results (4-0, 5-0, 1-0) must not inflate the goal columns.
    expect(alpha.goalsFor).toBe(5);
  });

  it('still keeps the knockout ties in the match list', async () => {
    const snap = await buildSnapshot('ucl', withTable, { maxDetailRequests: 0 });
    expect(snap.matches).toHaveLength(6);
    const knockout = snap.matches.filter((m) => m.matchweek === null);
    expect(knockout).toHaveLength(3);
    expect(knockout.map((m) => m.roundLabel).sort()).toEqual(
      ['Final', 'Knockout play-off', 'Round of 16'],
    );
  });

  it('labels league-phase rounds as matchdays, not matchweeks', async () => {
    const snap = await buildSnapshot('ucl', withTable, { maxDetailRequests: 0 });
    const md1 = snap.matches.find((m) => m.matchweek === 1)!;
    expect(md1.roundLabel).toBe('League phase MD1');
  });
});

describe('domestic league mapping', () => {
  const league = {
    details: { id: 47, name: 'Premier League', selectedSeason: '2026/2027' },
    table: [{ data: {
      legend: [
        { title: 'Champions League', tKey: 'championsleague', indices: [0, 1] },
        { title: 'Relegation', tKey: 'relegation', indices: [3] },
      ],
      table: {
        all: [
          { ...tableRow(10, 'Alpha', 1) },
          { ...tableRow(20, 'Beta', 2), deduction: 6 },
          { ...tableRow(30, 'Gamma', 3) },
          { ...tableRow(40, 'Delta', 4) },
        ],
        xg: [{ id: 10, xg: 4.5, xgConceded: 1.2, xPoints: 5.1 }],
      },
      isCurrentSeason: true,
      selectedSeason: '2026/2027',
    } }],
    fixtures: {
      allMatches: [
        fixture(1, [10, 'Alpha'], [20, 'Beta'], 1, 1, '2 - 0'),
        fixture(2, [30, 'Gamma'], [40, 'Delta'], 1, 1, '1 - 1'),
        fixture(3, [20, 'Beta'], [30, 'Gamma'], 2, 2, '3 - 0'),
        fixture(4, [40, 'Delta'], [10, 'Alpha'], 2, 2, null), // not yet played
      ],
    },
  };

  it('conforms to the snapshot contract', async () => {
    const snap = await buildSnapshot('epl', league, { maxDetailRequests: 0 });
    const { ok, errors } = checkSnapshot(snap);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('leaves an unplayed fixture scoreless rather than 0-0', async () => {
    const snap = await buildSnapshot('epl', league, { maxDetailRequests: 0 });
    const pending = snap.matches.find((m) => m.id === '4')!;
    expect(pending.status).toBe('SCHEDULED');
    expect(pending.homeScore).toBeNull();
    expect(pending.awayScore).toBeNull();
  });

  it('applies the upstream points deduction', async () => {
    const snap = await buildSnapshot('epl', league, { maxDetailRequests: 0 });
    const beta = snap.standings.find((r) => r.teamId === '20')!;
    // Beta won once (3 pts) and lost once, minus a 6-point deduction.
    expect(beta.points).toBe(-3);
  });

  it("prefers the source's qualification legend over the static registry", async () => {
    const snap = await buildSnapshot('epl', league, { maxDetailRequests: 0 });
    // The registry says 1-4 are Champions League places; this feed says 1-2,
    // and the feed reflects the season's real allocation.
    const ucl = snap.competition.zones.find((z) => z.kind === 'ucl-league-phase')!;
    expect(ucl.fromRank).toBe(1);
    expect(ucl.toRank).toBe(2);
    const rel = snap.competition.zones.find((z) => z.kind === 'relegation')!;
    expect(rel.fromRank).toBe(4);
  });

  it('carries upstream season xG onto the table', async () => {
    const snap = await buildSnapshot('epl', league, { maxDetailRequests: 0 });
    const alpha = snap.standings.find((r) => r.teamId === '10')!;
    expect(alpha.xGFor).toBe(4.5);
    expect(alpha.xGAgainst).toBe(1.2);
    expect(alpha.expectedPoints).toBe(5.1);
    // A team the xG feed does not cover stays null — never a fabricated zero.
    const delta = snap.standings.find((r) => r.teamId === '40')!;
    expect(delta.xGFor).toBeNull();
  });

  it('assigns distinct three-letter codes', async () => {
    const collide = {
      ...league,
      table: [{ data: {
        legend: [],
        table: { all: [tableRow(1, 'Manchester United', 1), tableRow(2, 'Manchester City', 2)] },
        isCurrentSeason: true, selectedSeason: '2026/2027',
      } }],
      fixtures: { allMatches: [fixture(9, [1, 'Manchester United'], [2, 'Manchester City'], 1, 1, '1 - 1')] },
    };
    const snap = await buildSnapshot('epl', collide, { maxDetailRequests: 0 });
    const codes = snap.teams.map((t) => t.code);
    expect(codes).toContain('MUN');
    expect(codes).toContain('MCI');
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('capability honesty', () => {
  it('reports no xG when the feed carries none', async () => {
    const bare = {
      details: { id: 47, name: 'Premier League', selectedSeason: '2026/2027' },
      table: [{ data: {
        legend: [],
        table: { all: [tableRow(10, 'Alpha', 1), tableRow(20, 'Beta', 2)] },
        isCurrentSeason: true, selectedSeason: '2026/2027',
      } }],
      fixtures: { allMatches: [fixture(1, [10, 'Alpha'], [20, 'Beta'], 1, 1, '1 - 0')] },
    };
    const snap = await buildSnapshot('epl', bare, { maxDetailRequests: 0 });
    // No xg table and no match detail fetched, so the honest answer is false —
    // claiming xG here is what produced the parent product's "shows 0" bugs.
    expect(snap.meta.capabilities.hasXG).toBe(false);
    expect(snap.meta.capabilities.hasShotLocations).toBe(false);
    expect(checkSnapshot(snap).ok).toBe(true);
  });
});
