import { fetchJson } from '../http';
import type { BookQuote, MarketKind, Outcome } from '@/analytics/betting';

/**
 * The Odds API adapter.
 *
 * ── The budget is the design constraint ────────────────────────────────────
 * The free tier is 500 credits a MONTH, and a request costs one credit per
 * market per region. Asking for three markets across two regions is six credits
 * for a single league. Six leagues on that pattern is 36 credits per refresh —
 * fourteen refreshes and the month is gone.
 *
 * So: ONE region, three markets, three credits per league, eighteen per full
 * sweep. That affords roughly one sweep per day with headroom, which is the
 * right cadence anyway — a model-versus-market page is not a live price ticker,
 * and a stale-by-hours price is honest as long as it is LABELLED stale, which
 * it is.
 *
 * The budget is tracked and enforced in-process rather than discovered by being
 * cut off mid-month.
 *
 * ── Why the EU region and Pinnacle specifically ────────────────────────────
 * Averaging across all books sounds fairer and is worse. Soft books carry stale
 * prices, and "beating" a stale price is not an edge — it is a number that will
 * be gone before anyone could act on it. The sharp book's line is the closest
 * thing to a true probability the market publishes, so that is what the model is
 * scored against.
 */

const BASE = 'https://api.the-odds-api.com/v4';

/** Our competition ids → The Odds API sport keys. Verified live 2026-08-23. */
export const ODDS_SPORT_KEYS: Record<string, string> = {
  epl: 'soccer_epl',
  laliga: 'soccer_spain_la_liga',
  seriea: 'soccer_italy_serie_a',
  bundesliga: 'soccer_germany_bundesliga',
  ligue1: 'soccer_france_ligue_one',
  ucl: 'soccer_uefa_champs_league',
  uel: 'soccer_uefa_europa_league',
};

/** Sharpest first. The first one present in a fixture's book list wins. */
const PREFERRED_BOOKS = ['pinnacle', 'betfair_ex_eu', 'marathonbet', 'williamhill', 'unibet_eu'];

const MARKETS: MarketKind[] = ['h2h', 'spreads', 'totals'];
const REGION = 'eu';

/** Credits a single league sweep costs: one per market per region. */
export const CREDITS_PER_LEAGUE = MARKETS.length;

interface OddsGlobals {
  __cfiOddsBudget?: { used: number; remaining: number | null; resetHint: string | null };
  __cfiOddsCache?: Map<string, { fetchedAt: number; events: OddsEvent[] }>;
}
const G = globalThis as unknown as OddsGlobals;

/** How long a league's odds stay fresh before another sweep is allowed. */
export const ODDS_TTL_MS = 20 * 3600_000; // ~1 sweep/day across 6 leagues

export interface OddsEvent {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  quotes: BookQuote[];
}

interface RawOutcome { name: string; price: number; point?: number }
interface RawMarket { key: string; last_update: string; outcomes: RawOutcome[] }
interface RawBook { key: string; title: string; markets: RawMarket[] }
interface RawEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: RawBook[];
}

export function oddsBudget() {
  if (!G.__cfiOddsBudget) {
    G.__cfiOddsBudget = { used: 0, remaining: null, resetHint: null };
  }
  return G.__cfiOddsBudget;
}

function cache() {
  if (!G.__cfiOddsCache) G.__cfiOddsCache = new Map();
  return G.__cfiOddsCache;
}

/**
 * Pick the sharpest book that actually quoted this fixture. Falls back to the
 * first available rather than returning nothing — a soft price clearly labelled
 * is more useful than a blank row, and the book name is always displayed so the
 * reader can judge it.
 */
function pickBook(books: RawBook[]): RawBook | undefined {
  for (const preferred of PREFERRED_BOOKS) {
    const hit = books.find((b) => b.key === preferred);
    if (hit) return hit;
  }
  return books[0];
}

function toQuotes(book: RawBook): BookQuote[] {
  return book.markets
    .filter((m) => MARKETS.includes(m.key as MarketKind))
    .map((m) => ({
      bookmaker: book.title,
      market: m.key as MarketKind,
      lastUpdate: m.last_update,
      outcomes: m.outcomes.map(
        (o): Outcome => ({ label: o.name, price: o.price, point: o.point }),
      ),
    }));
}

/**
 * Fetch one competition's odds, honouring the cache and the budget.
 * Returns null when skipped, so a caller can tell "no odds" from "not refreshed".
 */
export async function fetchOdds(
  competitionId: string,
  opts: { force?: boolean } = {},
): Promise<OddsEvent[] | null> {
  const sportKey = ODDS_SPORT_KEYS[competitionId];
  const apiKey = process.env.ODDS_API_KEY;
  if (!sportKey || !apiKey) return null;

  const cached = cache().get(competitionId);
  if (!opts.force && cached && Date.now() - cached.fetchedAt < ODDS_TTL_MS) {
    return cached.events;
  }

  const budget = oddsBudget();
  // Stop before the wall, not at it: leaving a reserve means a manual refresh
  // during a big matchweek is still possible late in the month.
  if (budget.remaining !== null && budget.remaining < CREDITS_PER_LEAGUE * 2) {
    return cached?.events ?? null;
  }

  const url =
    `${BASE}/sports/${sportKey}/odds/?apiKey=${apiKey}` +
    `&regions=${REGION}&markets=${MARKETS.join(',')}&oddsFormat=decimal`;

  try {
    const raw = await fetchJson<RawEvent[]>(url, { label: `odds:${competitionId}`, retries: 1 });
    budget.used += CREDITS_PER_LEAGUE;
    if (budget.remaining !== null) budget.remaining -= CREDITS_PER_LEAGUE;

    const events: OddsEvent[] = raw.map((e) => {
      const book = pickBook(e.bookmakers ?? []);
      return {
        id: e.id,
        commenceTime: e.commence_time,
        homeTeam: e.home_team,
        awayTeam: e.away_team,
        quotes: book ? toQuotes(book) : [],
      };
    });

    cache().set(competitionId, { fetchedAt: Date.now(), events });
    return events;
  } catch {
    // A failed odds fetch must never take the page down; the Betting Edge
    // surface simply reports that it has no prices.
    return cached?.events ?? null;
  }
}

// ── Joining odds to fixtures ────────────────────────────────────────────────

/**
 * Team-name aliases between the odds feed and the match feed.
 *
 * Joining on provider fixture IDs is impossible — they are different vendors —
 * so the join is by NAME plus DATE. Names disagree constantly ("Wolverhampton
 * Wanderers" vs "Wolves", "Internazionale" vs "Inter Milan", accents present or
 * absent), and a missed join silently drops a fixture from the Betting Edge
 * rather than erroring, which is the worst kind of failure: invisible.
 *
 * Keys are normalised forms; values are the canonical normalised form.
 */
const NAME_ALIASES: Record<string, string> = {
  wolverhamptonwanderers: 'wolves',
  brightonandhovealbion: 'brighton',
  brightonhovealbion: 'brighton',
  tottenhamhotspur: 'tottenham',
  manchesterunited: 'manunited',
  manchestercity: 'mancity',
  newcastleunited: 'newcastle',
  westhamunited: 'westham',
  nottinghamforest: 'nottmforest',
  leedsunited: 'leeds',
  leicestercity: 'leicester',
  afcbournemouth: 'bournemouth',
  ipswichtown: 'ipswich',
  hullcity: 'hull',
  coventrycity: 'coventry',
  sheffieldunited: 'sheffutd',
  westbromwichalbion: 'westbrom',
  stokecity: 'stoke',
  internazionale: 'inter',
  intermilan: 'inter',
  acmilan: 'milan',
  asroma: 'roma',
  sslazio: 'lazio',
  atalantabc: 'atalanta',
  acffiorentina: 'fiorentina',
  bolognafc: 'bologna',
  atleticomadrid: 'atletico',
  clubatleticodemadrid: 'atletico',
  athleticbilbao: 'athletic',
  athleticclub: 'athletic',
  realsociedad: 'sociedad',
  realbetis: 'betis',
  deportivoalaves: 'alaves',
  rcceltadevigo: 'celtavigo',
  celtavigo: 'celtavigo',
  rayovallecano: 'rayo',
  realoviedo: 'oviedo',
  bayernmunchen: 'bayern',
  bayernmunich: 'bayern',
  fcbayernmunchen: 'bayern',
  borussiadortmund: 'dortmund',
  bvbborussiadortmund: 'dortmund',
  bayer04leverkusen: 'leverkusen',
  bayerleverkusen: 'leverkusen',
  rbleipzig: 'leipzig',
  eintrachtfrankfurt: 'frankfurt',
  borussiamonchengladbach: 'gladbach',
  vfbstuttgart: 'stuttgart',
  werderbremen: 'bremen',
  svwerderbremen: 'bremen',
  vflwolfsburg: 'wolfsburg',
  scfreiburg: 'freiburg',
  tsghoffenheim: 'hoffenheim',
  tsg1899hoffenheim: 'hoffenheim',
  unionberlin: 'unionberlin',
  fcunionberlin: 'unionberlin',
  fcaugsburg: 'augsburg',
  mainz05: 'mainz',
  fsvmainz05: 'mainz',
  parissaintgermain: 'psg',
  parissg: 'psg',
  olympiquemarseille: 'marseille',
  olympiquedemarseille: 'marseille',
  olympiquelyonnais: 'lyon',
  asmonaco: 'monaco',
  losclille: 'lille',
  ognicenice: 'nice',
  ogcnice: 'nice',
  rclens: 'lens',
  staderennais: 'rennes',
  fcnantes: 'nantes',
  rcstrasbourgalsace: 'strasbourg',
  toulousefc: 'toulouse',
  stadebrestois29: 'brest',
};

/**
 * Legal-form noise that vendors include inconsistently: "AFC Bournemouth" one
 * side, "Bournemouth" the other. Stripped as whole TOKENS only.
 */
const LEGAL_TOKENS = new Set([
  'fc', 'afc', 'ac', 'as', 'sc', 'ss', 'ssc', 'rc', 'cf', 'cd', 'sv', 'vfb',
  'vfl', 'tsg', 'fsv', 'ogc', 'losc', 'bv', 'bsc', 'us', 'ud', 'rcd', 'club',
]);

/**
 * Reduce a club name to a comparable key.
 *
 * Tokenised deliberately. An earlier version stripped these prefixes with a
 * regex over the CONCATENATED name, which turned "Aston Villa" into "tonvilla"
 * because it matched the "as" inside "aston" — and a mangled key does not throw,
 * it just silently fails to join and the fixture vanishes from the Betting Edge.
 * Only a whole token can be legal-form noise.
 *
 * A token is also never stripped if it is the ONLY one, so a club genuinely
 * called "Club" or "AC" does not normalise to the empty string.
 */
export function normaliseTeamName(name: string): string {
  const tokens = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const meaningful = tokens.filter((t) => !LEGAL_TOKENS.has(t));
  const base = (meaningful.length ? meaningful : tokens).join('');
  return NAME_ALIASES[base] ?? base;
}

/** Do two names refer to the same club? */
export function sameTeam(a: string, b: string): boolean {
  const na = normaliseTeamName(a);
  const nb = normaliseTeamName(b);
  if (na === nb) return true;
  // One name being a prefix of the other catches "Brighton" vs "Brighton Hove".
  if (na.length >= 5 && nb.length >= 5 && (na.startsWith(nb) || nb.startsWith(na))) return true;
  return false;
}

/**
 * Match an odds event to a fixture: both clubs and a kick-off within a day.
 *
 * The date window matters because two clubs meet twice a season, so names alone
 * would join a fixture to its reverse leg. A day of slack absorbs timezone and
 * rescheduling drift without being loose enough to collide.
 */
export function findOddsFor(
  events: OddsEvent[],
  homeName: string,
  awayName: string,
  kickoff: string,
): OddsEvent | undefined {
  const target = Date.parse(kickoff);
  return events.find(
    (e) =>
      sameTeam(e.homeTeam, homeName) &&
      sameTeam(e.awayTeam, awayName) &&
      Math.abs(Date.parse(e.commenceTime) - target) < 26 * 3600_000,
  );
}
