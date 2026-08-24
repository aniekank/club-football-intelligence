import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildFromEdition, type StatsBombEdition } from './statsbomb';
import { checkSnapshot } from '@/domain/schema';

/**
 * These run against the COMMITTED edition files, so they are hermetic despite
 * using real data. That is the point: a completed season is immutable, which
 * means it can be asserted against known football history. If the standings
 * engine, the tiebreaker chain, or the xG fold ever breaks, Leicester stop
 * winning the league and the test says so.
 */
const CACHE = path.join(process.cwd(), 'src', 'data', 'cache');

function load(file: string): StatsBombEdition | null {
  const p = path.join(CACHE, file);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as StatsBombEdition;
}

const epl = load('statsbomb-epl-2015-2016.json');

describe.runIf(epl)('Premier League 2015/16', () => {
  const snap = buildFromEdition(epl!);
  const byName = (n: string) => {
    const team = snap.teams.find((t) => t.name === n)!;
    return snap.standings.find((r) => r.teamId === team.id)!;
  };

  it('conforms to the snapshot contract', () => {
    const { ok, errors } = checkSnapshot(snap);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('reproduces the real final table', () => {
    // The actual 2015/16 Premier League, verifiable against any record.
    expect(snap.standings).toHaveLength(20);
    expect(byName('Leicester City')).toMatchObject({ rank: 1, points: 81, won: 23, drawn: 12, lost: 3 });
    expect(byName('Arsenal')).toMatchObject({ rank: 2, points: 71 });
    expect(byName('Tottenham Hotspur')).toMatchObject({ rank: 3, points: 70 });
    expect(byName('Aston Villa')).toMatchObject({ rank: 20, points: 17 });
  });

  it('separates the two Manchester clubs on goal difference, not head-to-head', () => {
    // Both finished on 66. England never consults head-to-head, so City's +30
    // beats United's +14 — and this is the assertion that would fail if the
    // competition's chain were ever swapped for LaLiga's.
    const city = byName('Manchester City');
    const united = byName('Manchester United');
    expect(city.points).toBe(united.points);
    expect(city.goalDifference).toBeGreaterThan(united.goalDifference);
    expect(city.rank).toBeLessThan(united.rank);
  });

  it('ranks Tottenham below Arsenal despite a better goal difference', () => {
    // Spurs had the division's best GD (+34) and finished third. Points first.
    const spurs = byName('Tottenham Hotspur');
    const arsenal = byName('Arsenal');
    expect(spurs.goalDifference).toBeGreaterThan(arsenal.goalDifference);
    expect(spurs.rank).toBeGreaterThan(arsenal.rank);
  });

  it('records the champion on the season', () => {
    const champion = snap.teams.find((t) => t.id === snap.season.championTeamId);
    expect(champion?.name).toBe('Leicester City');
    expect(snap.season.isCurrent).toBe(false);
  });

  it('gives every club a distinct three-letter code', () => {
    const codes = snap.teams.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    // The collision that motivated sharing the assigner across adapters.
    expect(snap.teams.find((t) => t.name === 'Manchester City')?.code).toBe('MCI');
    expect(snap.teams.find((t) => t.name === 'Manchester United')?.code).toBe('MUN');
  });

  it('carries shot-level xG for the whole season', () => {
    const shots = snap.matches.reduce((n, m) => n + m.shots.length, 0);
    expect(snap.matches).toHaveLength(380);
    expect(shots).toBeGreaterThan(9000);
    // Every club's season xG is ours, summed from those shots.
    for (const row of snap.standings) {
      expect(row.xGFor).not.toBeNull();
      expect(row.xGFor).toBeGreaterThan(20);
    }
  });

  it('reports complete coverage, unlike the windowed live edition', () => {
    expect(snap.meta.playerStatsCoverage?.complete).toBe(true);
    expect(snap.meta.playerStatsCoverage?.matchesCovered).toBe(380);
  });

  it('reports no rating rather than inventing one', () => {
    // StatsBomb publishes no match ratings. A fabricated 6.5 would be worse
    // than an honest null.
    expect(snap.playerStats.every((s) => s.averageRating === null)).toBe(true);
  });

  it('has a plausible goals-to-xG relationship', () => {
    // Across a full season, total goals and total xG should land close. A wild
    // divergence means the shot fold or the pitch normalisation is wrong.
    const goals = snap.matches.reduce((n, m) => n + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
    const xg = snap.standings.reduce((n, r) => n + (r.xGFor ?? 0), 0);
    expect(goals).toBeGreaterThan(900);
    expect(Math.abs(goals - xg) / goals).toBeLessThan(0.15);
  });
});

const laliga = load('statsbomb-laliga-2015-2016.json');

describe.runIf(laliga)('LaLiga 2015/16', () => {
  const snap = buildFromEdition(laliga!);
  it('conforms and crowns Barcelona', () => {
    expect(checkSnapshot(snap).errors).toEqual([]);
    const champion = snap.teams.find((t) => t.id === snap.season.championTeamId);
    expect(champion?.name).toBe('Barcelona');
    expect(snap.standings[0]?.points).toBe(91);
  });

  it('applies LaLiga\'s head-to-head chain, not England\'s', () => {
    expect(snap.competition.tiebreakers[1]).toBe('head-to-head');
  });
});
