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
          // A REAL FotMob deduction row: the feed signs it negative and its
          // `pts` already reflects it. Beta won once and lost once (3 from
          // results) and is docked 6, so the feed publishes -3.
          { ...tableRow(20, 'Beta', 2), wins: 1, draws: 0, pts: -3, deduction: -6 },
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

  it('does not turn a deduction into a bonus', async () => {
    /**
     * REGRESSION (found live, Championship): FotMob signs deductions NEGATIVE
     * and the engine's contract is a positive magnitude to subtract, so passing
     * the value straight through subtracted a negative. Southampton, docked
     * four points and bottom of the Championship on -1, came out top of our
     * table on 7 — above three clubs with two wins each — and the table looked
     * completely ordinary.
     */
    const snap = await buildSnapshot('epl', league, { maxDetailRequests: 0 });
    const beta = snap.standings.find((r) => r.teamId === '20')!;
    const alpha = snap.standings.find((r) => r.teamId === '10')!;
    // The docked club must be BELOW a club it would otherwise be level with.
    expect(beta.points).toBeLessThan(alpha.points);
    // And must never out-rank on the strength of its own punishment.
    expect(beta.rank).toBeGreaterThan(alpha.rank);
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

describe('stats coverage while a match is in progress', () => {
  /**
   * REGRESSION (found live, mid-matchday): detail is fetched for LIVE matches as
   * well as finished ones, but coverage counted only finished matches as the
   * denominator. The moment a game kicked off, matchesCovered exceeded
   * matchesPlayed, conformance rejected the snapshot, and the entire EPL refresh
   * failed. The previous snapshot kept serving, so nothing broke visibly — which
   * is exactly why it needs a test.
   */
  const league = {
    details: { id: 47, name: 'Premier League', selectedSeason: '2026/2027' },
    table: [{ data: {
      legend: [],
      table: { all: [tableRow(10, 'Alpha', 1), tableRow(20, 'Beta', 2)] },
      isCurrentSeason: true, selectedSeason: '2026/2027',
    } }],
    fixtures: {
      allMatches: [
        fixture(1, [10, 'Alpha'], [20, 'Beta'], 1, 1, '1 - 0'),
        // In progress: started, not finished.
        {
          ...fixture(2, [20, 'Beta'], [10, 'Alpha'], 2, 2, null),
          status: {
            utcTime: '2026-09-16T19:00:00Z',
            started: true, finished: false, cancelled: false,
            liveTime: { short: "63'" },
          },
        },
      ],
    },
  };

  it('counts an in-progress match in the denominator', async () => {
    const details = {
      content: {
        playerStats: {
          '1': {
            id: 1, teamId: '10', name: 'Someone', usualPosition: 2,
            stats: [{ stats: { 'Minutes played': { key: 'minutes_played', stat: { value: 63 } } } }],
          },
        },
      },
    };
    const snap = await buildSnapshot('epl', league, {
      maxDetailRequests: 5,
      fetchDetails: async () => details,
    });

    const coverage = snap.meta.playerStatsCoverage!;
    expect(coverage.matchesCovered).toBeLessThanOrEqual(coverage.matchesPlayed);
    // Both the finished match and the live one are counted.
    expect(coverage.matchesPlayed).toBe(2);
    expect(checkSnapshot(snap).errors).toEqual([]);
  });
});

describe('composite tables without a combined block', () => {
  /**
   * REGRESSION: the combined table was found by taking the WIDEST block, which
   * assumes one exists. A group stage has eight groups of four and no combined
   * table, so the widest was simply the first group — the Club World Cup loaded
   * as a four-club competition and looked entirely plausible.
   *
   * Comparing sizes does not fix it: AFC's West-16 + East-16 is arithmetically
   * identical to a combined-16 + one group of 16. The test has to be semantic.
   */
  const group = (name: string, ids: number[]) => ({
    leagueName: name,
    table: { all: ids.map((id, i) => tableRow(id, `T${id}`, i + 1)) },
  });

  const composite = (tables: ReturnType<typeof group>[], fixtures: ReturnType<typeof fixture>[]) => ({
    details: { id: 78, name: 'FIFA Club World Cup', selectedSeason: '2025' },
    table: [{ data: { composite: true, tables, isCurrentSeason: true, selectedSeason: '2025' } }],
    fixtures: { allMatches: fixtures },
  });

  it('takes the union of the groups when no combined table exists', async () => {
    const league = composite(
      [group('Grp. A', [1, 2, 3, 4]), group('Grp. B', [5, 6, 7, 8])],
      [
        fixture(1, [1, 'T1'], [2, 'T2'], 1, 1, '1 - 0'),
        fixture(2, [5, 'T5'], [6, 'T6'], 1, 1, '2 - 2'),
      ],
    );
    const snap = await buildSnapshot('cwc', league, { maxDetailRequests: 0 });
    // Eight clubs, not the four of the first group.
    expect(snap.teams).toHaveLength(8);
    expect(snap.standings).toHaveLength(8);
    // Each group is ranked on its own, so both groups have a rank 1.
    const firsts = snap.standings.filter((r) => r.rank === 1);
    expect(firsts).toHaveLength(2);
  });

  it('still finds a genuine combined table and does not double-count it', async () => {
    // MLS: East, West, and a Shield table containing every club in both.
    const league = composite(
      [
        group('Eastern', [1, 2]),
        group('Western', [3, 4]),
        group('Overall', [1, 2, 3, 4]),
      ],
      [fixture(1, [1, 'T1'], [3, 'T3'], 1, 1, '1 - 0')],
    );
    const snap = await buildSnapshot('mls', league, { maxDetailRequests: 0 });
    // Four clubs — the Shield table is the roster, not a fifth group.
    expect(snap.teams).toHaveLength(4);
    expect(snap.standings).toHaveLength(4);
    expect(snap.competition.conferences).toEqual(['Eastern', 'Western']);
  });

  it('does not mistake two equal-sized regions for a combined table', async () => {
    // AFC: West and East are the same size and share no clubs.
    const league = composite(
      [group('West', [1, 2]), group('East', [3, 4])],
      [fixture(1, [1, 'T1'], [2, 'T2'], 1, 1, '1 - 0')],
    );
    const snap = await buildSnapshot('afc', league, { maxDetailRequests: 0 });
    expect(snap.teams).toHaveLength(4);
    expect(snap.competition.conferences).toEqual(['West', 'East']);
  });
});

describe('pure knockout competitions', () => {
  /**
   * REGRESSION: named rounds are excluded from the table (a final is not a
   * matchweek), which is correct — but a competition made entirely of named
   * rounds then produced a full standings table with every club on played 0,
   * points 0. CONCACAF Champions Cup rendered as an authoritative-looking
   * ranking of nothing. An empty table is the honest answer, and the format
   * already supports saying so.
   */
  const league = {
    details: { id: 297, name: 'CONCACAF Champions Cup', selectedSeason: '2026' },
    table: [{ data: {
      legend: [],
      table: { all: [tableRow(10, 'Alpha', 1), tableRow(20, 'Beta', 2)] },
      isCurrentSeason: true, selectedSeason: '2026',
    } }],
    fixtures: {
      allMatches: [
        fixture(1, [10, 'Alpha'], [20, 'Beta'], 'quarter', 'Quarter-final', '2 - 1'),
        fixture(2, [20, 'Beta'], [10, 'Alpha'], 'semi', 'Semi-final', '0 - 3'),
      ],
    },
  };

  it('produces no standings at all', async () => {
    const snap = await buildSnapshot('concacaf', league, { maxDetailRequests: 0 });
    expect(snap.standings).toEqual([]);
  });

  it('still carries the clubs and the matches', async () => {
    const snap = await buildSnapshot('concacaf', league, { maxDetailRequests: 0 });
    expect(snap.teams).toHaveLength(2);
    expect(snap.matches).toHaveLength(2);
    expect(snap.matches.every((m) => m.matchweek === null)).toBe(true);
    expect(checkSnapshot(snap).errors).toEqual([]);
  });
});

describe('group-stage qualification labels', () => {
  /**
   * REGRESSION: the feed's legend labels position 1 of every block "Champions".
   * That is right for the Premier League and wrong for Group A of the Club
   * World Cup — topping a group of four wins nothing, and the product spends
   * real effort elsewhere (`titleDecidedByPlayoff`) refusing to call a leader
   * champions. The legend must not reintroduce it.
   */
  const league = {
    details: { id: 78, name: 'FIFA Club World Cup', selectedSeason: '2025' },
    table: [{ data: {
      composite: true,
      legend: [{ title: 'Champions', tKey: 'champion', indices: [0] }],
      tables: [
        { leagueName: 'Grp. A', legend: [{ title: 'Champions', tKey: 'champion', indices: [0] }],
          table: { all: [tableRow(1, 'A1', 1), tableRow(2, 'A2', 2)] } },
        { leagueName: 'Grp. B', table: { all: [tableRow(3, 'B1', 1), tableRow(4, 'B2', 2)] } },
      ],
      isCurrentSeason: true, selectedSeason: '2025',
    } }],
    fixtures: { allMatches: [fixture(1, [1, 'A1'], [2, 'A2'], 1, 1, '1 - 0')] },
  };

  it('never labels a group winner "champions"', async () => {
    const snap = await buildSnapshot('cwc', league, { maxDetailRequests: 0 });
    const kinds = snap.competition.zones.map((z) => z.kind);
    expect(kinds).not.toContain('champion');
    // The registry's own bands survive instead.
    expect(kinds).toContain('knockout-direct');
    expect(snap.competition.zones.find((z) => z.fromRank === 1)?.label).toBe('Round of 16');
  });
});

describe('a season containing two separate tournaments', () => {
  /**
   * Argentina and Panama return FOUR blocks in one response — Apertura and
   * Clausura, each split into two zones — because their season contains two
   * distinct championships. Treated as four conferences of one competition,
   * every club appears twice and two titles merge into a ranking that exists
   * nowhere.
   *
   * Which tournament is live is decided by PLAY, not position: the feed listed
   * Apertura first for Panama and second for Argentina, so order is a trap. The
   * finished tournament has every club on a full identical count; the live one
   * is mid-way.
   */
  const zone = (name: string, ids: number[], played: number) => ({
    leagueName: name,
    table: {
      all: ids.map((id, i) => ({ ...tableRow(id, `T${id}`, i + 1), played })),
    },
  });

  const build = (tables: ReturnType<typeof zone>[]) => ({
    details: { id: 112, name: 'Liga Profesional', selectedSeason: '2026' },
    table: [{ data: { composite: true, tables, isCurrentSeason: true, selectedSeason: '2026' } }],
    fixtures: {
      allMatches: [
        fixture(1, [1, 'T1'], [2, 'T2'], 1, 1, '1 - 0'),
        fixture(2, [3, 'T3'], [4, 'T4'], 1, 1, '2 - 2'),
      ],
    },
  });

  it('keeps only the tournament still being played', async () => {
    const league = build([
      zone('Clausura - Group A', [1, 2], 6),
      zone('Clausura - Group B', [3, 4], 6),
      zone('Apertura - Group A', [1, 2], 16),
      zone('Apertura - Group B', [3, 4], 16),
    ]);
    const snap = await buildSnapshot('argentina', league, { maxDetailRequests: 0 });
    // Four clubs, not eight: no club appears in two tournaments at once.
    expect(snap.teams).toHaveLength(4);
    expect(snap.standings).toHaveLength(4);
    expect(new Set(snap.standings.map((r) => r.teamId)).size).toBe(4);
  });

  it('ignores feed order when picking the live tournament', async () => {
    // Panama's shape: the LIVE tournament is listed FIRST here, and second in
    // the case above. Both must resolve to the mid-way one.
    const league = build([
      zone('Apertura - Eastern', [1, 2], 4),
      zone('Apertura - Western', [3, 4], 4),
      zone('Clausura - Eastern', [1, 2], 16),
      zone('Clausura - Western', [3, 4], 16),
    ]);
    const snap = await buildSnapshot('panama', league, { maxDetailRequests: 0 });
    expect(snap.teams).toHaveLength(4);
    expect(snap.competition.conferences).toEqual(['Eastern', 'Western']);
  });

  it('names the tournament in the season and strips it from the groups', async () => {
    const league = build([
      zone('Clausura - Group A', [1, 2], 6),
      zone('Clausura - Group B', [3, 4], 6),
      zone('Apertura - Group A', [1, 2], 16),
      zone('Apertura - Group B', [3, 4], 16),
    ]);
    const snap = await buildSnapshot('argentina', league, { maxDetailRequests: 0 });
    expect(snap.season.label).toBe('2026 - Clausura');
    // Stated once in the season, not repeated on every table heading.
    expect(snap.competition.conferences).toEqual(['Group A', 'Group B']);
  });

  it('leaves a single-tournament composite alone', async () => {
    // MLS must not be touched by any of this.
    const mls = {
      details: { id: 130, name: 'MLS', selectedSeason: '2026' },
      table: [{ data: { composite: true, isCurrentSeason: true, selectedSeason: '2026', tables: [
        { leagueName: 'Eastern', table: { all: [tableRow(1, 'A', 1), tableRow(2, 'B', 2)] } },
        { leagueName: 'Western', table: { all: [tableRow(3, 'C', 1), tableRow(4, 'D', 2)] } },
        { leagueName: 'Overall', table: { all: [1, 2, 3, 4].map((i, n) => tableRow(i, String(i), n + 1)) } },
      ] } }],
      fixtures: { allMatches: [fixture(1, [1, 'A'], [3, 'C'], 1, 1, '1 - 0')] },
    };
    const snap = await buildSnapshot('mls', mls, { maxDetailRequests: 0 });
    expect(snap.competition.conferences).toEqual(['Eastern', 'Western']);
    expect(snap.season.label).toBe('2026');
  });
});
