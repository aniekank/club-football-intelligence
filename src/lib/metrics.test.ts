import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  TEAM_METRICS, PLAYER_METRICS, availableTeamMetrics, availablePlayerMetrics,
  findTeamMetric, teamRows, grouped, minutesDefault,
} from './metrics';
import { formatValue } from './formatKind';
import { buildFromEdition, type StatsBombEdition } from '@/data/providers/statsbomb';

const file = path.join(process.cwd(), 'src', 'data', 'cache', 'statsbomb-epl-2015-2016.json');
const edition = existsSync(file)
  ? (JSON.parse(readFileSync(file, 'utf8')) as StatsBombEdition)
  : null;

describe('metric registry', () => {
  it('has no duplicate keys', () => {
    for (const set of [TEAM_METRICS, PLAYER_METRICS]) {
      const keys = set.map((m) => m.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('keeps every definition serialisable', () => {
    /**
     * Metric definitions cross the server/client boundary — a server page hands
     * one straight to the scatter, which is a client component. React cannot
     * serialise a function, and `format: (v) => ...` threw "Functions cannot be
     * passed directly to Client Components" at request time, not at build time.
     * Only `get` may be a function, and it is always called server-side.
     */
    for (const m of [...TEAM_METRICS, ...PLAYER_METRICS]) {
      expect(typeof m.format, `${m.key} format must be a string kind`).toBe('string');
      expect(typeof m.label).toBe('string');
      expect(typeof m.higherIsBetter).toBe('boolean');
    }
  });

  it('marks the direction of every metric deliberately', () => {
    // Goals conceded and points are both numbers; only one is better when
    // large, and nothing in the data says which.
    expect(findTeamMetric('points')?.higherIsBetter).toBe(true);
    expect(findTeamMetric('goalsAgainst')?.higherIsBetter).toBe(false);
    expect(findTeamMetric('rank')?.higherIsBetter).toBe(false);
    expect(findTeamMetric('relegationProbability')?.higherIsBetter).toBe(false);
    expect(findTeamMetric('xGAgainst')?.higherIsBetter).toBe(false);
  });

  it('formats each kind as intended', () => {
    expect(formatValue('int', 3.6)).toBe('4');
    // Not 1.005 — that is 1.00499… in binary floating point, and asserting
    // otherwise tests JavaScript's number representation rather than this code.
    expect(formatValue('two', 1.234)).toBe('1.23');
    expect(formatValue('signed', 4)).toBe('+4');
    expect(formatValue('signed', -4)).toBe('-4');
    expect(formatValue('signedOne', 0)).toBe('0.0');
    expect(formatValue('pct1', 0.6031)).toBe('60.3%');
  });
});

describe.runIf(edition)('availability against a real edition', () => {
  const snapshot = buildFromEdition(edition!);

  it('offers xG metrics when the source has xG', () => {
    const keys = availableTeamMetrics(snapshot).map((m) => m.key);
    expect(keys).toContain('xGFor');
    expect(keys).toContain('pointsOverExpected');
  });

  it('withholds a metric no club has a value for', () => {
    // Title probability is null across a completed season — nothing left to
    // simulate — so it must not be offered as an axis. Offering it and plotting
    // a column of nulls is the control-layer version of showing a fake zero.
    const keys = availableTeamMetrics(snapshot).map((m) => m.key);
    expect(keys).not.toContain('titleProbability');
    expect(keys).not.toContain('relegationProbability');
  });

  it('withholds every player metric when the source has none', () => {
    const bare = {
      ...snapshot,
      meta: {
        ...snapshot.meta,
        capabilities: { ...snapshot.meta.capabilities, hasPlayerStats: false },
      },
    };
    expect(availablePlayerMetrics(bare)).toHaveLength(0);
    expect(availablePlayerMetrics(snapshot).length).toBeGreaterThan(20);
  });

  it('reads real values off the 2015/16 table', () => {
    const rows = teamRows(snapshot);
    const leicester = rows.find((r) => r.team.name === 'Leicester City')!;
    expect(findTeamMetric('points')!.get(leicester)).toBe(81);
    expect(findTeamMetric('goalDifference')!.get(leicester)).toBe(32);
    // Leicester famously outran their expected points by a wide margin.
    const over = findTeamMetric('pointsOverExpected')!.get(leicester);
    expect(over).not.toBeNull();
    expect(over!).toBeGreaterThan(5);
  });

  it('never invents a zero for a missing value', () => {
    const rows = teamRows(snapshot);
    const metric = findTeamMetric('titleProbability')!;
    // Null, not 0 — "no forecast" and "no chance" are different statements.
    expect(rows.every((r) => metric.get(r) === null)).toBe(true);
  });

  it('scales the default minutes floor to the season', () => {
    // A full season needs a far higher bar than an opening matchweek, or a
    // single substitute appearance tops every per-90 chart.
    expect(minutesDefault(snapshot)).toBeGreaterThan(300);
  });

  it('groups metrics for the picker without losing any', () => {
    const metrics = availableTeamMetrics(snapshot);
    const total = grouped(metrics).reduce((n, [, ms]) => n + ms.length, 0);
    expect(total).toBe(metrics.length);
  });
});
