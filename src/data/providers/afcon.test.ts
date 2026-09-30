import { describe, it, expect } from 'vitest';
import { buildSnapshot, priorResultsFrom } from './fotmob';
import { checkSnapshot } from '@/domain/schema';
import { rateTeams, fitPriorsFromResults } from '@/analytics/ratings';
import { simulateSeason } from '@/analytics/season';

/**
 * AFCON: national teams, groups, and two qualification rules that are not a
 * band on a rank — host nations in qualifying, best third-placed teams in the
 * finals. Recorded-shape payloads, no network.
 */

const team = (id: number, name: string) => ({ id: String(id), name, shortName: name });

function tableRow(id: number, name: string, idx: number) {
  return {
    id, name, shortName: name, played: 0, wins: 0, draws: 0, losses: 0,
    goalConDiff: 0, pts: 0, idx, deduction: null,
  };
}

function fixture(
  id: number, home: [number, string], away: [number, string], round: string, score: string | null,
  reason?: { short: string; long?: string },
) {
  return {
    id: String(id),
    round,
    roundName: round,
    home: team(home[0], home[1]),
    away: team(away[0], away[1]),
    status: {
      utcTime: '2026-09-16T19:00:00Z',
      finished: score !== null,
      started: score !== null,
      cancelled: false,
      scoreStr: score ?? undefined,
      reason: score !== null ? reason ?? { short: 'FT', shortKey: 'finished' } : undefined,
    },
  };
}

const group = (name: string, members: [number, string][]) => ({
  leagueName: name,
  table: { all: members.map(([id, n], i) => tableRow(id, n, i + 1)) },
});

/** Every pairing home and away, with the results given (null = still to play). */
function doubleRoundRobin(
  members: [number, string][], startId: number, results: Record<string, string> = {},
) {
  const out = [];
  let id = startId;
  for (const h of members) {
    for (const a of members) {
      if (h === a) continue;
      out.push(fixture(id++, h, a, '1', results[`${h[1]}-${a[1]}`] ?? null));
    }
  }
  return out;
}

describe('AFCON qualifying: host groups', () => {
  // Group D: Kenya is a host, so only the best of the other three qualifies.
  const D: [number, string][] = [[1, 'South Africa'], [2, 'Eritrea'], [3, 'Kenya'], [4, 'Guinea']];
  // Group A: an ordinary group, top two qualify.
  const A: [number, string][] = [[11, 'Morocco'], [12, 'Gabon'], [13, 'Niger'], [14, 'Lesotho']];

  const league = {
    details: { id: 10608, name: 'Africa Cup of Nations Qualification', selectedSeason: '2026/2027' },
    table: [{ data: { composite: true, tables: [group('Grp. A', A), group('Grp. D', D)], isCurrentSeason: true } }],
    fixtures: {
      allMatches: [
        // Kenya has lost its opening games and sits bottom; Eritrea is second.
        ...doubleRoundRobin(D, 100, {
          'South Africa-Kenya': '3 - 0', 'Eritrea-Kenya': '1 - 0',
          'South Africa-Eritrea': '2 - 0', 'Guinea-Kenya': '1 - 0',
        }),
        ...doubleRoundRobin(A, 200, { 'Morocco-Gabon': '2 - 0' }),
      ],
    },
  };

  it('marks the host and the best other side as qualifying, whatever the host\'s rank', async () => {
    const snap = await buildSnapshot('afconq', league as never, { maxDetailRequests: 0 });
    expect(checkSnapshot(snap).errors).toEqual([]);
    const zoneOf = (name: string) => {
      const t = snap.teams.find((x) => x.name === name);
      return snap.standings.find((r) => r.teamId === t?.id)?.zone;
    };
    expect(zoneOf('Kenya')).toBe('qualified');
    expect(zoneOf('South Africa')).toBe('qualified');
    // Second in the group, but the second place belongs to the host.
    expect(zoneOf('Eritrea')).toBe('eliminated');
    // An ordinary group is untouched: top two through.
    expect(zoneOf('Morocco')).toBe('qualified');
  });

  it('simulates the host as certain and fills exactly one other place per host group', async () => {
    const snap = await buildSnapshot('afconq', league as never, { maxDetailRequests: 0 });
    const { teams, leagueAvgGoals } = rateTeams(snap);
    const { forecasts } = simulateSeason(snap, teams, { runs: 2000, goalModel: { leagueAvgGoals } });
    const byName = new Map(forecasts.map((f) => [teams.find((t) => t.id === f.teamId)?.name, f]));
    expect(byName.get('Kenya')?.qualify).toBe(1);
    const qualifyIn = (members: [number, string][]) =>
      members.reduce((s, [, n]) => s + (byName.get(n)?.qualify ?? 0), 0);
    // Host group: the host plus one. Ordinary group: two.
    expect(qualifyIn(D)).toBeCloseTo(2, 6);
    expect(qualifyIn(A)).toBeCloseTo(2, 6);
    // Group winning is per group, so each group's chances sum to one.
    expect(D.reduce((s, [, n]) => s + (byName.get(n)?.groupWin ?? 0), 0)).toBeCloseTo(1, 6);
  });
});

describe('AFCON finals', () => {
  const groups: [number, string][][] = Array.from({ length: 6 }, (_, g) =>
    Array.from({ length: 4 }, (__, i): [number, string] => [g * 10 + i + 1, `N${g * 10 + i + 1}`]),
  );
  const league = {
    details: { id: 289, name: 'Africa Cup of Nations', selectedSeason: '2027' },
    table: [{
      data: {
        composite: true,
        tables: [
          ...groups.map((m, g) => group(`Grp. ${'ABCDEF'[g]}`, m)),
          // FotMob's derived ranking of the third-placed sides — not a group.
          group('Best 3rd placed teams', groups.map((m) => m[2] as [number, string])),
        ],
        isCurrentSeason: true,
      },
    }],
    fixtures: {
      allMatches: groups.flatMap((m, g) => doubleRoundRobin(m, 1000 + g * 100).slice(0, 6)),
    },
  };

  it('ignores the derived best-thirds table instead of reading it as a seventh group', async () => {
    const snap = await buildSnapshot('afcon', league as never, { maxDetailRequests: 0 });
    expect(snap.teams).toHaveLength(24);
    expect(snap.competition.conferences).toHaveLength(6);
    expect(checkSnapshot(snap).errors).toEqual([]);
  });

  it('plays at neutral grounds except when a host is at home', async () => {
    const hosted = {
      ...league,
      details: { ...league.details, selectedSeason: '2027' },
      fixtures: { allMatches: [fixture(1, [1, 'Kenya'], [2, 'N2'], '1', null), fixture(2, [2, 'N2'], [3, 'N3'], '1', null)] },
      table: [{ data: { composite: true, tables: [group('Grp. A', [[1, 'Kenya'], [2, 'N2'], [3, 'N3'], [4, 'N4']]), group('Grp. B', [[5, 'N5'], [6, 'N6']])], isCurrentSeason: true } }],
    };
    const snap = await buildSnapshot('afcon', hosted as never, { maxDetailRequests: 0 });
    const venueOf = (id: string) => snap.matches.find((m) => m.id === id)?.venueKind;
    expect(venueOf('1')).toBe('home-away');
    expect(venueOf('2')).toBe('neutral');
  });

  it('sends sixteen through: two per group plus the four best thirds', async () => {
    const snap = await buildSnapshot('afcon', league as never, { maxDetailRequests: 0 });
    const { teams, leagueAvgGoals } = rateTeams(snap);
    const { forecasts } = simulateSeason(snap, teams, { runs: 2000, goalModel: { leagueAvgGoals } });
    const total = forecasts.reduce((s, f) => s + (f.qualify ?? 0), 0);
    expect(total).toBeCloseTo(16, 6);
  });
});

describe('national-team priors', () => {
  it('credits a win over a strong side more than the same win over a weak one', () => {
    // A and B both beat C 1-0. C is strong: it thrashes D. B's other result is
    // a draw with D, so A — who beat D — should rate above B.
    const r = (h: string, a: string, hg: number, ag: number) => ({ homeTeamId: h, awayTeamId: a, homeGoals: hg, awayGoals: ag, neutral: true });
    const priors = fitPriorsFromResults(
      [r('A', 'C', 1, 0), r('B', 'C', 1, 0), r('C', 'D', 4, 0), r('A', 'D', 2, 0), r('B', 'D', 0, 0)],
      ['A', 'B', 'Z'],
    );
    const p = new Map(priors.map((x) => [x.teamId, x]));
    expect((p.get('A')?.attackRatio ?? 0)).toBeGreaterThan(p.get('B')?.attackRatio ?? 0);
    // A nation with no results gets a cautious below-average prior, not average.
    expect(p.get('Z')?.promoted).toBe(true);
  });

  it('leaves awarded results out of the history', () => {
    const payload = {
      fixtures: {
        allMatches: [
          fixture(1, [1, 'X'], [2, 'Y'], '1', '0 - 3', { short: 'AW', long: 'Awarded win' }),
          fixture(2, [1, 'X'], [2, 'Y'], '2', '1 - 1'),
        ],
      },
    };
    expect(priorResultsFrom(payload as never)).toHaveLength(1);
  });
});

describe('AFCON finals knockout', () => {
  // Six groups of four; the lower number always wins its group games 1-0, except
  // that each third place beats fourth by more in later groups, so the best
  // thirds are C, D, E, F — AFCON 2025's combination.
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const members = letters.map((g, gi) =>
    [1, 2, 3, 4].map((r): [number, string] => [gi * 10 + r, `${r}${g}`]));
  const groupFixtures = members.flatMap((m, gi) => {
    const out = [];
    let id = 5000 + gi * 100;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const margin = i === 2 && j === 3 ? gi + 1 : 1;
      out.push(fixture(id++, m[i]!, m[j]!, '1', `${margin} - 0`));
    }
    return out;
  });
  const ko = (id: number, a: [number, string], b: [number, string], round: string, score: string | null) =>
    ({ ...fixture(id, a, b, '1/8', score), round, roundName: round });
  const t = (label: string) => members.flat().find(([, n]) => n === label)!;

  const league = (knockout: ReturnType<typeof ko>[]) => ({
    details: { id: 289, name: 'Africa Cup of Nations', selectedSeason: '2025' },
    table: [{ data: { composite: true, tables: members.map((m, gi) => group(`Grp. ${letters[gi]}`, m)), isCurrentSeason: true } }],
    fixtures: { allMatches: [...groupFixtures, ...knockout] },
  });

  it('plays a full bracket: sixteen, eight, four, two, one', async () => {
    const snap = await buildSnapshot('afcon', league([]) as never, { maxDetailRequests: 0 });
    const { teams, leagueAvgGoals } = rateTeams(snap);
    const { forecasts } = simulateSeason(snap, teams, { runs: 2000, goalModel: { leagueAvgGoals } });
    const sum = (k: 'quarterFinal' | 'semiFinal' | 'final' | 'champion') =>
      forecasts.reduce((s, f) => s + (f.knockout?.[k] ?? 0), 0);
    expect(sum('quarterFinal')).toBeCloseTo(8, 6);
    expect(sum('semiFinal')).toBeCloseTo(4, 6);
    expect(sum('final')).toBeCloseTo(2, 6);
    expect(sum('champion')).toBeCloseTo(1, 6);
    // The title is the tournament now, so winTitle is the champion chance.
    for (const f of forecasts) expect(f.winTitle).toBeCloseTo(f.knockout?.champion ?? 0, 9);
  });

  it('uses real results, including a shoot-out, instead of replaying them', async () => {
    const snap = await buildSnapshot('afcon', league([
      ko(9001, t('2A'), t('2C'), 'Round of 16', '1 - 1'),   // 2C win on penalties
      ko(9002, t('1D'), t('3E'), 'Round of 16', '0 - 2'),   // the third wins
    ]) as never, { maxDetailRequests: 0 });
    const pens = snap.matches.find((m) => m.id === '9001')!;
    pens.shootoutWinnerTeamId = String(t('2C')[0]);
    const { teams, leagueAvgGoals } = rateTeams(snap);
    const { forecasts } = simulateSeason(snap, teams, { runs: 500, goalModel: { leagueAvgGoals } });
    const qf = (label: string) => forecasts.find((f) => f.teamId === String(t(label)[0]))?.knockout?.quarterFinal;
    expect(qf('2C')).toBe(1);
    expect(qf('2A')).toBe(0);
    expect(qf('3E')).toBe(1);
    expect(qf('1D')).toBe(0);
  });
});
