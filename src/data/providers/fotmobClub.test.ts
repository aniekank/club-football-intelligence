import { describe, it, expect } from 'vitest';
import { mapClubHistory } from './fotmobClub';

/**
 * The trophy payload has a shape worth pinning: FotMob returns each field as a
 * single-element ARRAY of strings, with the seasons won as one comma-joined
 * string inside that array. Written from the live response for Manchester City,
 * not from what I assumed it looked like — the last two times I invented a
 * fixture shape it passed while the feature did nothing (CFI-013, and the club
 * colours).
 */
const raw = {
  history: {
    trophyList: [
      {
        name: ['Premier League'], area: ['England'], ccode: ['ENG'],
        won: ['10'], runnerup: ['7'],
        season_won: ['2023/2024,2022/2023,2021/2022'],
      },
      { name: ['FA Cup'], area: ['England'], won: ['7'], runnerup: ['6'], season_won: ['2022/2023'] },
    ],
    historicalTableData: {
      ranks: [
        { tournamentName: 'Premier League', seasonName: '2011/2012', position: 1, numberOfTeams: 20, stats: { points: 89, wins: 28, draws: 5, loss: 5 } },
        { tournamentName: 'Premier League', seasonName: '2010/2011', position: 3, numberOfTeams: 20, stats: { points: 71, wins: 21, draws: 8, loss: 9 } },
      ],
    },
    coachHistory: [
      { id: 78702, name: 'Roberto Mancini', season: '2012/2013', leagueName: 'Premier League', win: 22, draw: 9, loss: 5, pointsPerGame: 2.08, winPercentage: 0.61 },
      { id: 78591, name: 'Manuel Pellegrini', season: '2013/2014', leagueName: 'Premier League', win: 27, draw: 5, loss: 6, pointsPerGame: 2.26, winPercentage: 0.71 },
    ],
  },
  overview: {
    venue: {
      widget: { name: 'Etihad Stadium', city: 'Manchester' },
      statPairs: [['Surface', 'Grass'], ['Capacity', 61470], ['Opened', 2002]] as [string, string | number][],
    },
  },
};

describe('club history mapping', () => {
  it('unwraps the single-element arrays the trophy list uses', () => {
    const h = mapClubHistory('8456', raw);
    const league = h.trophies.find((t) => t.competitionName === 'Premier League')!;
    expect(league.won).toBe(10);
    expect(league.runnerUp).toBe(7);
    expect(league.country).toBe('England');
  });

  it('splits the comma-joined seasons into a list', () => {
    const league = mapClubHistory('8456', raw).trophies[0]!;
    expect(league.seasons).toEqual(['2023/2024', '2022/2023', '2021/2022']);
  });

  it('orders honours by weight, not alphabetically', () => {
    // Ten league titles outrank seven cups; "FA Cup" would win on the alphabet.
    expect(mapClubHistory('8456', raw).trophies[0]!.competitionName).toBe('Premier League');
  });

  it('sorts seasons oldest first, so a chart reads left to right', () => {
    const seasons = mapClubHistory('8456', raw).seasons;
    expect(seasons.map((s) => s.season)).toEqual(['2010/2011', '2011/2012']);
    expect(seasons[1]!.position).toBe(1);
    expect(seasons[1]!.outOf).toBe(20);
  });

  it('keeps the coaching record per season, most recent first', () => {
    const coaches = mapClubHistory('8456', raw).coaches;
    expect(coaches[0]!.name).toBe('Manuel Pellegrini');
    expect(coaches[0]!.pointsPerGame).toBe(2.26);
    expect(coaches[1]!.won).toBe(22);
  });

  it('reads the venue out of its statPairs', () => {
    const v = mapClubHistory('8456', raw).venue!;
    expect(v.name).toBe('Etihad Stadium');
    expect(v.capacity).toBe(61470);
    expect(v.opened).toBe(2002);
    expect(v.surface).toBe('Grass');
  });

  it('survives a club with no history at all', () => {
    const h = mapClubHistory('1', {});
    expect(h.trophies).toEqual([]);
    expect(h.seasons).toEqual([]);
    expect(h.coaches).toEqual([]);
    expect(h.venue).toBeNull();
  });
});
