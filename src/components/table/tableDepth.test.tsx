import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeagueTable } from './LeagueTable';
import { PREMIER_LEAGUE } from '@/domain/competitions';
import type { StandingRow, Team } from '@/domain/types';

/**
 * A fifteen-column league table is a data dump rather than a standing. The
 * default answers "how is my club doing" — rank, played, goal difference,
 * points, form, projection — and the breakdown is one click away.
 *
 * These assert the SPLIT, because the easy way to break it is to add a column
 * to the essential set without noticing that essential is the default every
 * reader sees first.
 */
const team = (id: string, name: string): Team => ({
  id, name, shortName: name, code: name.slice(0, 3).toUpperCase(),
  country: 'England', countryCode: 'ENG', crestUrl: null, primaryColor: null,
  secondaryColor: null, venue: null, manager: null,
  elo: 1500, attackRating: 60, defenseRating: 60,
});

const split = () => ({ played: 5, won: 3, drawn: 1, lost: 1, goalsFor: 9, goalsAgainst: 5, points: 10 });

const row = (teamId: string, rank: number): StandingRow => ({
  seasonId: 's', competitionId: 'epl', disciplinaryPoints: 0,
  teamId, rank, played: 10, won: 6, drawn: 2, lost: 2,
  goalsFor: 18, goalsAgainst: 10, goalDifference: 8, points: 20,
  xGFor: 17.5, xGAgainst: 9.4, expectedPoints: 19.1,
  form: ['W', 'W', 'D', 'L', 'W'], groupId: null, zone: null,
  titleProbability: 0.3, top4Probability: 0.6, relegationProbability: 0.01,
  tiebreakerNote: null,
  homeRecord: split(), awayRecord: split(),
});

const render = (detail: 'essential' | 'full') =>
  renderToStaticMarkup(
    <LeagueTable
      competition={PREMIER_LEAGUE}
      standings={[row('a', 1), row('b', 2)]}
      teams={[team('a', 'Alpha'), team('b', 'Beta')]}
      suffix="?competition=epl"
      detail={detail}
    />,
  );

const headers = (html: string) =>
  [...html.matchAll(/<th[^>]*>(?:<[^>]+>)*([A-Za-z#]+)/g)].map((m) => m[1]);

describe('league table depth', () => {
  it('leads with the columns that answer the question', () => {
    expect(headers(render('essential'))).toEqual(['#', 'Club', 'Pl', 'GD', 'Pts', 'Form', 'Title', 'Rel']);
  });

  it('keeps the results breakdown behind the full view', () => {
    const essential = headers(render('essential'));
    for (const col of ['W', 'D', 'L', 'GF', 'GA', 'xG', 'xGA']) {
      expect(essential, `${col} should not be in the default view`).not.toContain(col);
    }
  });

  it('restores every column when asked', () => {
    const full = headers(render('full'));
    for (const col of ['W', 'D', 'L', 'GF', 'GA', 'xG', 'xGA', 'GD', 'Pts']) {
      expect(full, `${col} missing from the full view`).toContain(col);
    }
    expect(full.length).toBeGreaterThan(headers(render('essential')).length);
  });

  it('never loses a club between the two depths', () => {
    for (const d of ['essential', 'full'] as const) {
      const html = render(d);
      expect(html).toContain('Alpha');
      expect(html).toContain('Beta');
    }
  });
});
