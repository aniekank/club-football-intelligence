import { fetchOdds, findOddsFor, type OddsEvent } from '@/data/providers/oddsApi';
import {
  devig, computeEdge, edgeStrength, isUsableMarket, assessReadiness,
  type Edge, type EdgeStrength, type ModelReadiness,
} from '@/analytics/betting';
import { predictMatch, scoreMatrix, handicapProbabilities, totalsProbabilities } from '@/analytics/poisson';
import type { DatasetSnapshot, Match, Team } from '@/domain/types';

/**
 * Assemble the model-versus-market view.
 *
 * Everything that can invalidate a comparison is checked BEFORE an edge is
 * produced, not filtered out of the display afterwards. A number that reaches
 * the page has already survived: a real market (plausible overround), a matched
 * fixture, and a model with enough of the season behind it to be worth quoting.
 */

export interface MarketRow {
  market: 'Match result' | 'Asian handicap' | 'Over/Under';
  selection: string;
  line: number | null;
  price: number;
  modelProbability: number;
  marketProbability: number;
  edge: Edge;
  strength: EdgeStrength;
}

export interface EdgeFixture {
  match: Match;
  home: Team;
  away: Team;
  bookmaker: string;
  lastUpdate: string;
  rows: MarketRow[];
  /** The best genuinely credible row, if any. */
  best: MarketRow | null;
}

export interface EdgeView {
  readiness: ModelReadiness;
  fixtures: EdgeFixture[];
  /** Fixtures dropped because their market was not real, for honest reporting. */
  skippedUnusableMarkets: number;
  /** Fixtures with no odds at all — beyond the book's horizon. */
  skippedNoOdds: number;
  hasOddsKey: boolean;
}

/** Median matches played — a fairer readiness measure than the max, which one
 *  rearranged fixture can inflate. */
function medianPlayed(snapshot: DatasetSnapshot): number {
  const counts = snapshot.standings.map((r) => r.played).sort((a, b) => a - b);
  if (!counts.length) return 0;
  return counts[Math.floor(counts.length / 2)] ?? 0;
}

export async function buildEdgeView(snapshot: DatasetSnapshot): Promise<EdgeView> {
  const readiness = assessReadiness(medianPlayed(snapshot));
  const hasOddsKey = Boolean(process.env.ODDS_API_KEY);

  const base: EdgeView = {
    readiness,
    fixtures: [],
    skippedUnusableMarkets: 0,
    skippedNoOdds: 0,
    hasOddsKey,
  };

  if (!hasOddsKey) return base;

  // Fetch even when not ready: the page still shows the market, it just
  // withholds the edge column. Seeing the prices is useful on its own.
  const events = await fetchOdds(snapshot.competition.id);
  if (!events?.length) return base;

  const byId = new Map(snapshot.teams.map((t) => [t.id, t]));
  const upcoming = snapshot.matches
    .filter((m) => m.status === 'SCHEDULED')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 30);

  const fixtures: EdgeFixture[] = [];
  let unusable = 0;
  let noOdds = 0;

  for (const match of upcoming) {
    const home = byId.get(match.homeTeamId);
    const away = byId.get(match.awayTeamId);
    if (!home || !away) continue;

    const event = findOddsFor(events, home.name, away.name, match.kickoff);
    if (!event) { noOdds += 1; continue; }

    const rows = buildRows(match, home, away, event, snapshot);
    if (!rows.length) { unusable += 1; continue; }

    const credible = rows.filter((r) => r.strength !== 'none' && r.strength !== 'implausible');
    const best = credible.length
      ? credible.reduce((a, b) => (b.edge.expectedValue > a.edge.expectedValue ? b : a))
      : null;

    fixtures.push({
      match,
      home,
      away,
      bookmaker: event.quotes[0]?.bookmaker ?? 'unknown',
      lastUpdate: event.quotes[0]?.lastUpdate ?? '',
      rows,
      best: readiness.ready ? best : null,
    });
  }

  return {
    readiness,
    fixtures,
    skippedUnusableMarkets: unusable,
    skippedNoOdds: noOdds,
    hasOddsKey,
  };
}

function buildRows(
  match: Match,
  home: Team,
  away: Team,
  event: OddsEvent,
  snapshot: DatasetSnapshot,
): MarketRow[] {
  const rows: MarketRow[] = [];
  const leagueAvgGoals = leagueRate(snapshot);
  const model = predictMatch(home, away, { leagueAvgGoals, venueKind: match.venueKind });
  const matrix = scoreMatrix(model.expectedGoals.home, model.expectedGoals.away);

  // ── 1X2 ──────────────────────────────────────────────────────────────────
  const h2h = event.quotes.find((q) => q.market === 'h2h');
  if (h2h) {
    const order = [event.homeTeam, 'Draw', event.awayTeam];
    const prices = order.map((label) => h2h.outcomes.find((o) => o.label === label)?.price ?? 0);
    if (isUsableMarket(prices)) {
      const fair = devig(prices);
      const modelP = [model.homeWin, model.draw, model.awayWin];
      const names = [home.shortName, 'Draw', away.shortName];
      modelP.forEach((p, i) => {
        const edge = computeEdge({
          modelProbability: p,
          price: prices[i] as number,
          marketProbability: fair[i] as number,
        });
        rows.push({
          market: 'Match result',
          selection: names[i] as string,
          line: null,
          price: prices[i] as number,
          modelProbability: p,
          marketProbability: fair[i] as number,
          edge,
          strength: edgeStrength(edge),
        });
      });
    }
  }

  // ── Asian handicap ───────────────────────────────────────────────────────
  const spreads = event.quotes.find((q) => q.market === 'spreads');
  if (spreads && spreads.outcomes.length === 2) {
    const [a, b] = spreads.outcomes as [typeof spreads.outcomes[0], typeof spreads.outcomes[1]];
    const prices = [a.price, b.price];
    if (isUsableMarket(prices) && a.point !== undefined && b.point !== undefined) {
      const fair = devig(prices);
      // The book states the line from each side's perspective; the model needs
      // it from the HOME side's, so flip when the quoted side is the away team.
      const homeIsFirst = a.label === event.homeTeam;
      const homeLine = homeIsFirst ? a.point : b.point;
      const probs = handicapProbabilities(matrix, homeLine);
      // Pushes return the stake, so they leave the win/lose comparison.
      const live = probs.home + probs.away;
      const modelHome = live > 0 ? probs.home / live : 0;
      const modelAway = live > 0 ? probs.away / live : 0;

      const entries = homeIsFirst
        ? [{ o: a, p: modelHome, name: home.shortName }, { o: b, p: modelAway, name: away.shortName }]
        : [{ o: a, p: modelAway, name: away.shortName }, { o: b, p: modelHome, name: home.shortName }];

      entries.forEach((entry, i) => {
        const edge = computeEdge({
          modelProbability: entry.p,
          price: entry.o.price,
          marketProbability: fair[i] as number,
        });
        rows.push({
          market: 'Asian handicap',
          selection: `${entry.name} ${entry.o.point! > 0 ? '+' : ''}${entry.o.point}`,
          line: entry.o.point ?? null,
          price: entry.o.price,
          modelProbability: entry.p,
          marketProbability: fair[i] as number,
          edge,
          strength: edgeStrength(edge),
        });
      });
    }
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const totals = event.quotes.find((q) => q.market === 'totals');
  if (totals && totals.outcomes.length === 2) {
    const over = totals.outcomes.find((o) => o.label === 'Over');
    const under = totals.outcomes.find((o) => o.label === 'Under');
    if (over && under && over.point !== undefined) {
      const prices = [over.price, under.price];
      if (isUsableMarket(prices)) {
        const fair = devig(prices);
        const probs = totalsProbabilities(matrix, over.point);
        const live = probs.over + probs.under;
        const modelOver = live > 0 ? probs.over / live : 0;
        const modelUnder = live > 0 ? probs.under / live : 0;

        [
          { label: `Over ${over.point}`, price: over.price, p: modelOver, fair: fair[0] as number },
          { label: `Under ${under.point}`, price: under.price, p: modelUnder, fair: fair[1] as number },
        ].forEach((entry) => {
          const edge = computeEdge({
            modelProbability: entry.p,
            price: entry.price,
            marketProbability: entry.fair,
          });
          rows.push({
            market: 'Over/Under',
            selection: entry.label,
            line: over.point ?? null,
            price: entry.price,
            modelProbability: entry.p,
            marketProbability: entry.fair,
            edge,
            strength: edgeStrength(edge),
          });
        });
      }
    }
  }

  return rows;
}

/** The competition's own scoring rate, measured from played fixtures. */
function leagueRate(snapshot: DatasetSnapshot): number {
  const played = snapshot.matches.filter(
    (m) => m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null,
  );
  if (!played.length) return 1.38;
  const goals = played.reduce((s, m) => s + (m.homeScore as number) + (m.awayScore as number), 0);
  return goals / (played.length * 2);
}
