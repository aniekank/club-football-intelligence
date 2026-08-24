import { describe, it, expect } from 'vitest';
import { computeStandings } from './standings';
import {
  PREMIER_LEAGUE, LA_LIGA, BUNDESLIGA, CHAMPIONS_LEAGUE, MLS, LIGA_MX,
  zoneForRank, hasConferences,
} from '@/domain/competitions';
import type { Match, ID, Competition } from '@/domain/types';

/**
 * These tests exist because a wrong tiebreaker chain does not crash, does not
 * log, and does not look wrong — it just quietly crowns the wrong team. The
 * headline case is `describe('the same results, two different champions')`:
 * one identical set of results, run through the Premier League's chain and
 * LaLiga's, must produce DIFFERENT winners. If that test ever goes green with
 * both leagues agreeing, the per-competition chain has stopped being consulted.
 */

let seq = 0;
function match(
  home: ID, away: ID, hs: number | null, as: number | null,
  opts: { day?: number; status?: Match['status'] } = {},
): Match {
  seq += 1;
  const played = hs !== null && as !== null;
  const day = opts.day ?? seq;
  return {
    id: `m${seq}`,
    competitionId: 'test',
    seasonId: 'test-season',
    matchweek: day,
    roundLabel: `Matchweek ${day}`,
    kickoff: `2026-${String(Math.floor(day / 28) + 1).padStart(2, '0')}-${String((day % 28) + 1).padStart(2, '0')}T15:00:00Z`,
    status: opts.status ?? (played ? 'FINISHED' : 'SCHEDULED'),
    minute: played ? 90 : 0,
    venueKind: 'home-away',
    venue: null,
    homeTeamId: home,
    awayTeamId: away,
    homeScore: hs,
    awayScore: as,
    homeScoreHT: null,
    awayScoreHT: null,
    penalties: null,
    teamStats: {},
    events: [],
    shots: [],
  };
}

function table(matches: Match[], teamIds: ID[], competition: Competition) {
  return computeStandings({ matches, teamIds, competition, seasonId: 'test-season' });
}
const order = (rows: { teamId: ID }[]) => rows.map((r) => r.teamId);

describe('the same results, two different champions', () => {
  /**
   * A and B finish level on 9 points.
   *   overall goal difference → A (+6) ahead of B (+4)
   *   head-to-head           → A 1-0 at home, B 3-0 at home, so B leads the
   *                            mini-table on its goal difference (+2 vs −2)
   * The Premier League never looks at head-to-head, so A wins the league.
   * LaLiga looks at it FIRST, so B does. Same matches, different champion.
   */
  const results = () => {
    seq = 0;
    return [
      match('A', 'B', 1, 0),
      match('B', 'A', 3, 0),
      match('A', 'C', 5, 0),
      match('C', 'A', 0, 3),
      match('B', 'C', 1, 0),
      match('C', 'B', 0, 1),
    ];
  };
  const teams = ['A', 'B', 'C'];

  it('gives the Premier League title to the better goal difference', () => {
    const rows = table(results(), teams, PREMIER_LEAGUE);
    expect(order(rows)).toEqual(['A', 'B', 'C']);
    expect(rows[0]!.points).toBe(9);
    expect(rows[1]!.points).toBe(9);
    expect(rows[0]!.goalDifference).toBe(6);
    expect(rows[1]!.goalDifference).toBe(4);
    // No footnote: goal difference is the tiebreak every reader already
    // assumes, and annotating it would put an asterisk on most of the table
    // one matchweek into a season, burying the cases that need explaining.
    expect(rows[0]!.tiebreakerNote).toBeNull();
  });

  it('gives the LaLiga title to the winner of the head-to-head', () => {
    const rows = table(results(), teams, LA_LIGA);
    expect(order(rows)).toEqual(['B', 'A', 'C']);
    expect(rows[0]!.tiebreakerNote).toBe('Ahead on head-to-head');
    // ...and the demoted side still has the superior overall goal difference,
    // which is exactly what makes the rule counter-intuitive and worth testing.
    expect(rows[1]!.goalDifference).toBeGreaterThan(rows[0]!.goalDifference);
  });
});

describe('head-to-head only applies once the mini-league is complete', () => {
  /**
   * A and B are level on 6 points. They have met ONCE (B won 2-0), so LaLiga's
   * head-to-head rule is not yet in force and the table must fall through to
   * overall goal difference — where A is well ahead. An implementation that
   * applies head-to-head unconditionally puts B top and is wrong from August
   * until the reverse fixture is played.
   */
  const partial = () => {
    seq = 0;
    return [
      match('B', 'A', 2, 0),
      match('A', 'C', 4, 0),
      match('A', 'D', 4, 0),
      match('B', 'C', 1, 0),
      match('D', 'B', 1, 0),
      match('A', 'B', null, null), // reverse fixture still to come
    ];
  };
  const teams = ['A', 'B', 'C', 'D'];

  it('falls through to goal difference while a meeting is outstanding', () => {
    const rows = table(partial(), teams, LA_LIGA);
    expect(rows[0]!.points).toBe(6);
    expect(rows[1]!.points).toBe(6);
    expect(order(rows).slice(0, 2)).toEqual(['A', 'B']);
    expect(rows[0]!.tiebreakerNote).toBeNull(); // goal difference goes unannotated
  });

  it('switches to head-to-head once the reverse fixture is played', () => {
    seq = 0;
    const complete = [
      match('B', 'A', 2, 0),
      match('A', 'C', 4, 0),
      match('A', 'D', 4, 0),
      match('B', 'C', 1, 0),
      match('D', 'B', 1, 0),
      match('A', 'B', 0, 0), // now played — A still cannot win the mini-table
    ];
    const rows = table(complete, ['A', 'B', 'C', 'D'], LA_LIGA);
    const a = rows.find((r) => r.teamId === 'A')!;
    const b = rows.find((r) => r.teamId === 'B')!;
    expect(a.points).toBe(b.points);
    expect(b.rank).toBeLessThan(a.rank);
    expect(b.tiebreakerNote).toBe('Ahead on head-to-head');
  });
});

describe('Bundesliga puts goal difference ahead of head-to-head', () => {
  it('ranks on goal difference even when head-to-head disagrees', () => {
    seq = 0;
    const results = [
      match('A', 'B', 1, 0),
      match('B', 'A', 3, 0),
      match('A', 'C', 5, 0),
      match('C', 'A', 0, 3),
      match('B', 'C', 1, 0),
      match('C', 'B', 0, 1),
    ];
    // Identical fixtures to the LaLiga case, but Germany consults goal
    // difference first — so this must agree with England, not Spain.
    const rows = table(results, ['A', 'B', 'C'], BUNDESLIGA);
    expect(order(rows)).toEqual(['A', 'B', 'C']);
  });
});

describe('Champions League league phase', () => {
  it('never uses head-to-head and separates on away goals', () => {
    // In the Swiss model teams play different opponents, so two level sides may
    // never have met. Points, GD and goals scored are all identical here; away
    // goals is the first criterion that can actually separate them.
    seq = 0;
    const results = [
      match('C', 'A', 1, 1), // A draws away and scores  -> 1 away goal
      match('A', 'D', 0, 0),
      match('B', 'C', 1, 1), // B draws at home          -> 0 away goals
      match('D', 'B', 0, 0),
    ];
    const rows = table(results, ['A', 'B', 'C', 'D'], CHAMPIONS_LEAGUE);
    const a = rows.find((r) => r.teamId === 'A')!;
    const b = rows.find((r) => r.teamId === 'B')!;
    expect(a.points).toBe(b.points);
    expect(a.goalDifference).toBe(b.goalDifference);
    expect(a.goalsFor).toBe(b.goalsFor);
    expect(a.rank).toBeLessThan(b.rank);
    expect(a.tiebreakerNote).toBe('Ahead on away goals');
  });
});

describe('unplayed fixtures are not goalless draws', () => {
  it('ignores scheduled and postponed matches entirely', () => {
    seq = 0;
    const rows = table(
      [
        match('A', 'B', 2, 1),
        match('B', 'A', null, null),
        match('A', 'B', null, null, { status: 'POSTPONED' }),
      ],
      ['A', 'B'],
      PREMIER_LEAGUE,
    );
    const a = rows.find((r) => r.teamId === 'A')!;
    const b = rows.find((r) => r.teamId === 'B')!;
    expect(a.played).toBe(1);
    expect(b.played).toBe(1);
    expect(a.points).toBe(3);
    expect(b.points).toBe(0);
    // The bug this guards: counting nulls as 0-0 would give both sides an extra
    // two draws, two points and a clean sheet apiece.
    expect(a.drawn).toBe(0);
    expect(b.drawn).toBe(0);
  });
});

describe('points deductions', () => {
  it('applies before tiebreakers, not after', () => {
    seq = 0;
    const matches = [match('A', 'B', 1, 0), match('B', 'A', 1, 0)];
    const rows = computeStandings({
      matches,
      teamIds: ['A', 'B'],
      competition: PREMIER_LEAGUE,
      seasonId: 's',
      deductions: { A: 3 },
    });
    // Both won once; A is docked 3 and drops below B on points, so the tie is
    // never formed in the first place.
    expect(order(rows)).toEqual(['B', 'A']);
    expect(rows.find((r) => r.teamId === 'A')!.points).toBe(0);
    expect(rows.find((r) => r.teamId === 'B')!.points).toBe(3);
  });
});

describe('determinism', () => {
  it('produces the same table regardless of input order', () => {
    seq = 0;
    const base = [
      match('A', 'B', 1, 0),
      match('B', 'A', 3, 0),
      match('A', 'C', 5, 0),
      match('C', 'A', 0, 3),
      match('B', 'C', 1, 0),
      match('C', 'B', 0, 1),
    ];
    const expected = order(table(base, ['A', 'B', 'C'], LA_LIGA));
    // Reversing both the fixture list and the team list must not move anybody.
    const shuffled = order(table([...base].reverse(), ['C', 'B', 'A'], LA_LIGA));
    expect(shuffled).toEqual(expected);
  });
});

describe('zones', () => {
  it('gives rank 1 the champion band, not the wider UCL band', () => {
    // Bands overlap by design; the narrowest must win or the title winner
    // renders with a generic Champions League rail.
    expect(zoneForRank(PREMIER_LEAGUE, 1)?.kind).toBe('champion');
    expect(zoneForRank(PREMIER_LEAGUE, 2)?.kind).toBe('ucl-league-phase');
    expect(zoneForRank(PREMIER_LEAGUE, 4)?.kind).toBe('ucl-league-phase');
    expect(zoneForRank(PREMIER_LEAGUE, 5)?.kind).toBe('uel-league-phase');
    expect(zoneForRank(PREMIER_LEAGUE, 10)).toBeNull();
    expect(zoneForRank(PREMIER_LEAGUE, 18)?.kind).toBe('relegation');
  });

  it('models the Bundesliga relegation play-off as its own band', () => {
    expect(zoneForRank(BUNDESLIGA, 16)?.kind).toBe('relegation-playoff');
    expect(zoneForRank(BUNDESLIGA, 17)?.kind).toBe('relegation');
  });

  it('models the Swiss-model cutoffs at 8 and 24', () => {
    expect(zoneForRank(CHAMPIONS_LEAGUE, 8)?.kind).toBe('knockout-direct');
    expect(zoneForRank(CHAMPIONS_LEAGUE, 9)?.kind).toBe('knockout-playoff');
    expect(zoneForRank(CHAMPIONS_LEAGUE, 24)?.kind).toBe('knockout-playoff');
    expect(zoneForRank(CHAMPIONS_LEAGUE, 25)?.kind).toBe('eliminated');
  });
});

describe('home and away splits', () => {
  it('separates the two records and keeps form chronological', () => {
    seq = 0;
    const rows = table(
      [
        match('A', 'B', 2, 0, { day: 1 }),
        match('B', 'A', 1, 1, { day: 2 }),
        match('C', 'A', 2, 1, { day: 3 }),
      ],
      ['A', 'B', 'C'],
      PREMIER_LEAGUE,
    );
    const a = rows.find((r) => r.teamId === 'A')!;
    expect(a.homeRecord).toMatchObject({ played: 1, won: 1, goalsFor: 2, points: 3 });
    expect(a.awayRecord).toMatchObject({ played: 2, drawn: 1, lost: 1, points: 1 });
    // Most recent LAST, so the badge row reads left-to-right in time order.
    expect(a.form).toEqual(['W', 'D', 'L']);
  });
});

describe('tiebreaker footnotes are signal, not noise', () => {
  it('annotates head-to-head and away goals but never goal difference', () => {
    seq = 0;
    // Head-to-head: worth explaining, because the reader can see the table and
    // cannot see why the club with the worse goal difference is above.
    const h2h = table(
      [
        match('A', 'B', 1, 0), match('B', 'A', 3, 0),
        match('A', 'C', 5, 0), match('C', 'A', 0, 3),
        match('B', 'C', 1, 0), match('C', 'B', 0, 1),
      ],
      ['A', 'B', 'C'],
      LA_LIGA,
    );
    expect(h2h[0]!.tiebreakerNote).toBe('Ahead on head-to-head');

    // Goal difference: needs no explanation, so carries none.
    seq = 0;
    const gd = table(
      [
        match('A', 'B', 1, 0), match('B', 'A', 3, 0),
        match('A', 'C', 5, 0), match('C', 'A', 0, 3),
        match('B', 'C', 1, 0), match('C', 'B', 0, 1),
      ],
      ['A', 'B', 'C'],
      PREMIER_LEAGUE,
    );
    expect(gd[0]!.tiebreakerNote).toBeNull();
  });

  it('annotates an unresolved tie only where it decides something', () => {
    /**
     * The regression this rule exists for: one matchweek in, every club is
     * level on points, so a naive "level on points" trigger asterisked all
     * twenty rows and the footnote became wallpaper.
     *
     * An unresolved tie is genuinely worth flagging when it straddles a zone
     * boundary — 4th versus 5th decides a Champions League place — and worth
     * nothing when it is ten mid-table clubs in an arbitrary order.
     */
    seq = 0;
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const opening = ids.slice(0, 10).map((id, i) => match(id, ids[i + 10] as string, i % 3, 0));
    const rows = table(opening, ids, PREMIER_LEAGUE);

    const annotated = rows.filter((r) => r.tiebreakerNote !== null);
    // Far fewer than the whole table...
    expect(annotated.length).toBeLessThan(rows.length / 2);

    // ...and every annotation sits on a genuine boundary: the row above or
    // below is in a different zone.
    for (const row of annotated) {
      const above = rows[row.rank - 2];
      const below = rows[row.rank];
      const onBoundary =
        (above !== undefined && above.zone !== row.zone) ||
        (below !== undefined && below.zone !== row.zone);
      expect(onBoundary).toBe(true);
    }

    // The big block of level mid-table clubs, in no zone at all, is silent.
    const midTable = rows.filter((r) => r.zone === null && r.points === 1);
    expect(midTable.length).toBeGreaterThan(4);
    expect(midTable.filter((r) => r.tiebreakerNote !== null).length).toBeLessThanOrEqual(1);
  });
});

describe('MLS ranks on wins before goal difference', () => {
  it('separates level clubs by wins, not by goal difference', () => {
    /**
     * The distinctive chain, and the reason tiebreakers are data. Two clubs on
     * the same points: England splits them on goal difference, MLS on who won
     * more often. Same results, different order.
     *
     * A: 3 wins, 3 losses        -> 9 pts, 3 wins,  GD +6
     * B: 2 wins, 3 draws, 1 loss  -> 9 pts, 2 wins,  GD +10
     * England gives it to B on goal difference; MLS gives it to A on wins.
     */
    seq = 0;
    const results = [
      // A wins three, loses three.
      match('A', 'C', 3, 0), match('A', 'D', 3, 0), match('A', 'E', 3, 0),
      match('C', 'A', 1, 0), match('D', 'A', 1, 0), match('E', 'A', 1, 0),
      // B wins two, draws three, loses one.
      match('B', 'C', 6, 0), match('B', 'D', 6, 0),
      match('B', 'E', 1, 1), match('C', 'B', 1, 1), match('D', 'B', 1, 1),
      match('E', 'B', 2, 0),
    ];
    const teams = ['A', 'B', 'C', 'D', 'E'];

    const mls = table(results, teams, MLS);
    const a = mls.find((r) => r.teamId === 'A')!;
    const b = mls.find((r) => r.teamId === 'B')!;
    expect(a.points).toBe(b.points);
    expect(b.goalDifference).toBeGreaterThan(a.goalDifference);
    expect(a.won).toBeGreaterThan(b.won);
    // MLS: more wins takes it.
    expect(a.rank).toBeLessThan(b.rank);
    expect(a.tiebreakerNote).toBe('Ahead on wins');

    // England, identical results: goal difference takes it instead.
    seq = 0;
    const epl = table(
      [
        match('A', 'C', 3, 0), match('A', 'D', 3, 0), match('A', 'E', 3, 0),
        match('C', 'A', 1, 0), match('D', 'A', 1, 0), match('E', 'A', 1, 0),
        match('B', 'C', 6, 0), match('B', 'D', 6, 0),
        match('B', 'E', 1, 1), match('C', 'B', 1, 1), match('D', 'B', 1, 1),
        match('E', 'B', 2, 0),
      ],
      teams,
      PREMIER_LEAGUE,
    );
    expect(epl.find((r) => r.teamId === 'B')!.rank)
      .toBeLessThan(epl.find((r) => r.teamId === 'A')!.rank);
  });

  it('does not call a play-off league\'s leader champions', () => {
    // Topping this table wins a seeding, not a trophy.
    expect(MLS.titleDecidedByPlayoff).toBe(true);
    expect(MLS.zones.some((z) => z.kind === 'champion')).toBe(false);
    expect(PREMIER_LEAGUE.zones.some((z) => z.kind === 'champion')).toBe(true);
  });

  it('models MLS conferences and Liga MX split seasons', () => {
    expect(MLS.conferences).toEqual(['Eastern', 'Western']);
    expect(hasConferences(MLS)).toBe(true);
    // Liga MX is one table; its split is across SEASONS, not conferences.
    expect(hasConferences(LIGA_MX)).toBe(false);
    expect(LIGA_MX.titleDecidedByPlayoff).toBe(true);
  });
});
