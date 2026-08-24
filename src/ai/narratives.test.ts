import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { generateInsights } from './narratives';
import { buildFromEdition, type StatsBombEdition } from '@/data/providers/statsbomb';
import { minutesFloor } from '@/server/players';
import { predictMatch } from '@/analytics/poisson';
import { rateTeams } from '@/analytics/ratings';
import { simulateSeason } from '@/analytics/season';
import type { Team, VenueKind } from '@/domain/types';

/**
 * Run against the committed 2015/16 Premier League, so every expectation is a
 * checkable football fact rather than a fixture invented to pass. Leicester
 * won it on 81; Kane's 25 goals took the Golden Boot.
 */
const file = path.join(process.cwd(), 'src', 'data', 'cache', 'statsbomb-epl-2015-2016.json');
const edition = existsSync(file)
  ? (JSON.parse(readFileSync(file, 'utf8')) as StatsBombEdition)
  : null;

describe.runIf(edition)('narratives, over the 2015/16 Premier League', () => {
  const snapshot = buildFromEdition(edition!);
  const { teams, leagueAvgGoals } = rateTeams(snapshot);
  const { forecasts } = simulateSeason(snapshot, teams, { goalModel: { leagueAvgGoals } });
  const insights = generateInsights({
    snapshot,
    forecasts,
    predict: (home: Team, away: Team, venueKind: VenueKind) =>
      predictMatch(home, away, { venueKind }),
    minutesFloor: minutesFloor(snapshot),
  });

  it('names real players among the ones who decide games', () => {
    const players = insights.filter((i) => i.kind === 'player');
    expect(players.length).toBeGreaterThan(0);
    // Every one must resolve to a player actually in the snapshot.
    const byId = new Map(snapshot.players.map((p) => [p.id, p]));
    for (const p of players) {
      expect(byId.get(p.entityId!), `${p.title} is not in the squad list`).toBeDefined();
    }
  });

  it('reports goal counts that match the underlying stats', () => {
    const players = insights.filter((i) => i.kind === 'player');
    for (const insight of players) {
      const stats = snapshot.playerStats.find((s) => s.playerId === insight.entityId);
      expect(stats).toBeDefined();
      const claimed = insight.metrics.find((m) => m.label === 'Goals')?.value;
      expect(claimed).toBe(String(stats!.goals));
    }
  });

  it('claims no key fixtures in a completed season', () => {
    /**
     * The whole 2015/16 season is played, so there is nothing upcoming. A
     * generator that produced "key fixtures" here would be inventing them — the
     * honest output is none, and the briefing then omits the section entirely
     * rather than showing an empty heading.
     */
    expect(snapshot.matches.every((m) => m.status !== 'SCHEDULED')).toBe(true);
    expect(insights.filter((i) => i.kind === 'fixture')).toEqual([]);
  });

  it('gives every insight the evidence for its own claim', () => {
    for (const i of insights) {
      expect(i.metrics.length, `${i.id} has no metrics`).toBeGreaterThan(0);
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.body.length).toBeGreaterThan(0);
    }
  });

  it('orders by severity, so the liveliest story leads', () => {
    const weight = { high: 0, medium: 1, low: 2 } as const;
    const seq = insights.map((i) => weight[i.severity]);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
  });
});

describe.runIf(edition)('a claim never outruns its data', () => {
  const snapshot = buildFromEdition(edition!);
  const { teams, leagueAvgGoals } = rateTeams(snapshot);
  const { forecasts } = simulateSeason(snapshot, teams, { goalModel: { leagueAvgGoals } });

  it('states the coverage window when player stats are partial', () => {
    /**
     * REGRESSION: player stats cover only the matches detail was fetched for —
     * 29 of Brasileirão's 234. The rest of the product says so on every player
     * page; this generator did not, so "2 goals and 1 assist" read as a season
     * total and made a league's top scorer look like a squad player.
     */
    const partial = {
      ...snapshot,
      meta: {
        ...snapshot.meta,
        playerStatsCoverage: { matchesCovered: 29, matchesPlayed: 234, from: null, complete: false },
      },
    };
    const insights = generateInsights({
      snapshot: partial,
      forecasts,
      minutesFloor: 0,
    });
    const players = insights.filter((i) => i.kind === 'player');
    expect(players.length).toBeGreaterThan(0);
    for (const p of players) {
      expect(p.body, `${p.title} claims a total without naming its window`).toContain('29 of 234');
    }
  });

  it('says nothing about a window when coverage is complete', () => {
    const full = {
      ...snapshot,
      meta: {
        ...snapshot.meta,
        playerStatsCoverage: { matchesCovered: 380, matchesPlayed: 380, from: null, complete: true },
      },
    };
    const players = generateInsights({ snapshot: full, forecasts, minutesFloor: 0 })
      .filter((i) => i.kind === 'player');
    for (const p of players) {
      expect(p.body).not.toContain('Over the last');
    }
  });
});
