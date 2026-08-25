import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildSquad, standingInSquad, byPosition, nationalities } from './squad';
import { buildFromEdition, type StatsBombEdition } from '@/data/providers/statsbomb';

/**
 * Against the committed 2015/16 Premier League, so the expectations are
 * checkable football facts. Leicester's title season: Vardy 24 league goals,
 * Mahrez 17, in a squad that scored 68.
 */
const file = path.join(process.cwd(), 'src', 'data', 'cache', 'statsbomb-epl-2015-2016.json');
const edition = existsSync(file)
  ? (JSON.parse(readFileSync(file, 'utf8')) as StatsBombEdition)
  : null;

describe.runIf(edition)('squad shares, over 2015/16', () => {
  const snapshot = buildFromEdition(edition!);
  const leicester = snapshot.teams.find((t) => /Leicester/i.test(t.name))!;
  const squad = buildSquad(snapshot, leicester.id);

  it('finds the squad', () => {
    expect(leicester).toBeDefined();
    expect(squad.members.length).toBeGreaterThan(10);
  });

  it('orders by minutes, so the first-choice side is at the top', () => {
    const mins = squad.members.map((m) => m.stats.minutes);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
  });

  it('takes the denominator from the SAME player rows, never the league table', () => {
    /**
     * The trap this module exists to avoid (CFI-014): player stats and the
     * league table can cover different windows, and dividing one by the other
     * produces a share that is silently wrong. The squad total must equal the
     * sum of its own members.
     */
    const summed = squad.members.reduce((n, m) => n + m.stats.goals, 0);
    expect(squad.totals.goals).toBe(summed);
  });

  it('gives shares that sum to one across the squad', () => {
    const total = squad.members.reduce((n, m) => n + (m.goalShare ?? 0), 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('makes the top scorer the biggest share', () => {
    const top = [...squad.members].sort((a, b) => b.stats.goals - a.stats.goals)[0]!;
    const biggest = [...squad.members].sort((a, b) => (b.goalShare ?? 0) - (a.goalShare ?? 0))[0]!;
    expect(biggest.player.id).toBe(top.player.id);
    // Vardy's share of a title-winning side is substantial by any measure.
    expect(biggest.goalShare).toBeGreaterThan(0.2);
  });

  it('never lets a minutes share exceed a whole slot', () => {
    for (const m of squad.members) {
      expect(m.minutesShare).toBeLessThanOrEqual(1);
      expect(m.minutesShare).toBeGreaterThanOrEqual(0);
    }
  });

  it('groups by position in teamsheet order', () => {
    const groups = byPosition(squad.members).map((g) => g.position);
    expect(groups).toEqual([...groups].sort(
      (a, b) => ['GK', 'DF', 'MF', 'FW'].indexOf(a) - ['GK', 'DF', 'MF', 'FW'].indexOf(b),
    ));
  });

  it('places a player within their own squad', () => {
    const top = squad.members[0]!;
    const { me, rankByMinutes } = standingInSquad(snapshot, top.player);
    expect(me?.player.id).toBe(top.player.id);
    expect(rankByMinutes).toBe(1);
  });

  it('returns an empty squad rather than throwing for an unknown club', () => {
    const empty = buildSquad(snapshot, 'no-such-team');
    expect(empty.members).toEqual([]);
    expect(empty.totals.goals).toBe(0);
  });
});

describe.runIf(edition)('squad nationalities', () => {
  const snapshot = buildFromEdition(edition!);
  const leicester = snapshot.teams.find((t) => /Leicester/i.test(t.name))!;
  const squad = buildSquad(snapshot, leicester.id);

  it('counts by minutes as well as by heads', () => {
    const nats = nationalities(squad.members);
    expect(nats.length).toBeGreaterThan(1);
    // Ordered by minutes, so the nationality that actually plays leads.
    const mins = nats.map((n) => n.minutes);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
  });

  it('shares sum to one across the squad', () => {
    const nats = nationalities(squad.members);
    const total = nats.reduce((n, x) => n + x.minutesShare, 0);
    // Players with no recorded nationality are dropped, so this is <= 1.
    expect(total).toBeGreaterThan(0.5);
    expect(total).toBeLessThanOrEqual(1.000001);
  });

  it('drops unknown nationality rather than inventing a country', () => {
    const nats = nationalities([
      ...squad.members,
      // A row with no nationality must not become "Other" or "".
      { ...squad.members[0]!, player: { ...squad.members[0]!.player, id: 'x', nationality: null } },
    ]);
    expect(nats.map((n) => n.nationality)).not.toContain('');
    expect(nats.every((n) => n.nationality)).toBe(true);
  });
});
