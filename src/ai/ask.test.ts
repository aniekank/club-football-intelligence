import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ask } from './ask';
import { extractTeams, extractPlayers, rankTeams, search } from './resolver';
import { buildFromEdition, type StatsBombEdition } from '@/data/providers/statsbomb';

/**
 * Run against the committed 2015/16 edition, so the expected answers are
 * verifiable football facts rather than fixtures invented to pass.
 */
const file = path.join(process.cwd(), 'src', 'data', 'cache', 'statsbomb-epl-2015-2016.json');
const edition = existsSync(file)
  ? (JSON.parse(readFileSync(file, 'utf8')) as StatsBombEdition)
  : null;

describe.runIf(edition)('ask, over the 2015/16 Premier League', () => {
  const snapshot = buildFromEdition(edition!);
  const ctx = { snapshot, forecasts: [], competitionId: 'epl', seasonParam: '2015-2016' };
  const q = (s: string) => ask(ctx, s);

  it('answers a leaderboard question with the real golden boot', () => {
    const r = q('Who has the most goals?');
    expect(r.understood).toBe(true);
    expect(r.intent).toBe('leaderboard');
    expect(r.answer).toContain('Harry Kane');
    expect(r.rows[0]?.[1]).toBe('Harry Kane');
    expect(r.rows[0]?.[3]).toBe('25');
  });

  it('answers the table question with the real champions', () => {
    const r = q('Show me the table');
    expect(r.intent).toBe('table');
    expect(r.answer).toContain('Leicester City');
  });

  it('names the clubs that actually went down', () => {
    const r = q('Who went down?');
    expect(r.understood).toBe(true);
    // Newcastle, Norwich and Aston Villa were relegated in 2015/16.
    expect(r.answer).toContain('Aston Villa');
    expect(r.rows).toHaveLength(3);
  });

  it('compares two named clubs', () => {
    const r = q('Compare Arsenal and Tottenham');
    expect(r.intent).toBe('team-comparison');
    expect(r.answer).toContain('Arsenal');
    expect(r.answer).toContain('2nd');
  });

  it('looks up a named player', () => {
    const r = q('How is Riyad Mahrez doing?');
    expect(r.intent).toBe('player-lookup');
    expect(r.answer).toContain('Mahrez');
    expect(r.answer).toContain('17 goals');
  });

  it('reads a specific metric off a named player', () => {
    const r = q('How many assists does Mesut Özil have?');
    expect(r.intent).toBe('player-stat');
    // Özil's 19 assists in 2015/16 were a Premier League near-record.
    expect(r.answer).toMatch(/1[89] assists/);
  });

  describe('refusing rather than guessing', () => {
    /**
     * These are the accidents observed against real questions before strict
     * extraction existed. Each one produced a confident answer to a question
     * nobody asked, which is worse than no answer.
     */
    it('does not read a stray possessive "s" as Swansea', () => {
      // "Leicester's" normalises to "leicester s", and that orphan token
      // scored 0.8 against Swansea through the startsWith bonus — giving TWO
      // clubs and a comparison nobody wanted.
      const teams = extractTeams(snapshot, "What are Leicester's title chances?");
      expect(teams).toHaveLength(1);
      expect(teams[0]?.name).toBe('Leicester City');
    });

    it('does not read "per 90" as Per Mertesacker', () => {
      const players = extractPlayers(snapshot, 'Who leads on xG per 90?');
      expect(players.map((p) => p.name)).not.toContain('Per Mertesacker');
      expect(q('Who leads on xG per 90?').intent).toBe('leaderboard');
    });

    it('does not read "tower" as Toner', () => {
      // One edit apart. Fuzzy matching is right for a search box and wrong
      // inside a sentence.
      const r = q('how tall is the eiffel tower');
      expect(r.understood).toBe(false);
      expect(r.intent).toBe('unknown');
    });

    it('says what it can do when it does not understand', () => {
      const r = q('what is the meaning of life');
      expect(r.understood).toBe(false);
      expect(r.rows.length).toBeGreaterThan(3);
    });
  });

  describe('the search box stays forgiving', () => {
    it('still tolerates a typo when the whole query is a name', () => {
      // Strict mode applies to sentences, not to search. "Leicster" must
      // still find Leicester.
      expect(rankTeams(snapshot, 'Leicster')[0]?.name).toBe('Leicester City');
      expect(rankTeams(snapshot, 'spurs')[0]?.name).toBe('Tottenham Hotspur');
      expect(rankTeams(snapshot, 'MCI')[0]?.name).toBe('Manchester City');
    });
  });

  it('keeps cameos off a full-season per-90 board', () => {
    // Observed live: a player with a handful of minutes topped xG per 90 at
    // 1.28. The floor scales with the busiest player's minutes.
    const r = q('Who leads on xG per 90?');
    const leader = snapshot.players.find((p) => p.name === r.rows[0]?.[1]);
    const stats = snapshot.playerStats.find((s) => s.playerId === leader?.id);
    expect(stats!.minutes).toBeGreaterThan(400);
  });
});

describe.runIf(edition)('search, over the 2015/16 Premier League', () => {
  const snapshot = buildFromEdition(edition!);
  const go = (q: string) => search(snapshot, q, 'epl', '2015-2016');

  it('finds a club despite a typo', () => {
    const hits = go('Leicster');
    expect(hits[0]?.kind).toBe('team');
    expect(hits[0]?.label).toBe('Leicester City');
    expect(hits[0]?.href).toContain('season=2015-2016');
  });

  it('finds a club by nickname and by code', () => {
    expect(go('spurs')[0]?.label).toBe('Tottenham Hotspur');
    expect(go('MUN')[0]?.label).toBe('Manchester United');
  });

  it('finds a player by surname alone', () => {
    const hits = go('Mahrez');
    const player = hits.find((h) => h.kind === 'player');
    expect(player?.label).toBe('Riyad Mahrez');
    expect(player?.sublabel).toContain('Leicester');
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(go('zzzzqqq')).toHaveLength(0);
  });

  it('ignores a query too short to be meaningful', () => {
    expect(go('a')).toHaveLength(0);
  });
});
