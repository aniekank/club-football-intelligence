import type { simulateSeason } from '@/analytics/season';
import { COMPETITIONS } from '@/domain/competitions';

/**
 * The edition registry.
 *
 * An EDITION is one competition in one season — "the Premier League, 2026/27"
 * or "the Premier League, 2015/16". It is the unit the app switches between,
 * and the reason the store is keyed by an arbitrary string rather than by
 * competition id: the same competition can have several editions loaded at once.
 *
 * Live editions stream from the provider. Historical ones load instantly from a
 * committed cache built offline by `scripts/fetch-statsbomb.mjs`, because a
 * StatsBomb season is 380 matches at ~3MB of event data and ingesting that at
 * boot would mean a gigabyte of downloads before the first page rendered.
 *
 * Deliberately free of any Node built-in: `bootstrap.ts` reads the filesystem
 * and therefore cannot be reached from anything the client bundle touches, but
 * page code needs the registry and the forecasts.
 */

export type EditionSource = 'fotmob' | 'statsbomb';

export interface Edition {
  /** Store key. Live editions use the bare competition id so URLs stay short. */
  key: string;
  competitionId: string;
  /** '2026/2027' */
  seasonLabel: string;
  source: EditionSource;
  /** Live editions refresh; historical ones are immutable. */
  live: boolean;
  /** Cache filename under src/data/cache, for historical editions. */
  cacheFile?: string;
  /** One line on why this edition is worth looking at. */
  blurb?: string;
}

/** Competitions loaded live at boot, in priority order. */
export const BOOT_COMPETITIONS = [
  // Domestic leagues, then the continental competitions. Order matters only for
  // boot sequencing — the navigation groups them by `tier`, not by this list.
  // Boot order IS load priority: the site becomes usable after the first, and
  // the rest fill in behind it sequentially. So the most-visited competitions
  // come first and the long tail waits, rather than the reverse.
  'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1',
  'ucl', 'uel', 'uecl',
  'championship', 'superlig', 'eredivisie', 'primeira', 'belgianpro',
  'scotprem', 'brasileirao', 'mls', 'ligamx',
  'bundesliga2', 'serieb', 'ligue2', 'laliga2', 'league-one', 'league-two',
  'allsvenskan', 'eliteserien', 'superligaen',
  'swiss', 'austria', 'ekstraklasa', 'greece', 'saudi', 'aleague',
  'argentina', 'costarica', 'honduras', 'guatemala', 'elsalvador', 'panama', 'canada',
  'cwc', 'libertadores', 'concacaf', 'afc',
];

const LIVE_EDITIONS: Edition[] = BOOT_COMPETITIONS.map((competitionId) => ({
  key: competitionId,
  competitionId,
  seasonLabel: 'current',
  source: 'fotmob',
  live: true,
}));

/**
 * Historical editions — and why they are all 2015/16.
 *
 * Not a retrospective, and not a choice. StatsBomb's open data contains exactly
 * ONE complete league season, and it is this one. Their catalogue looks much
 * larger than it is: La Liga lists eighteen seasons, but 2004/05 holds seven
 * matches and 2005/06 holds seventeen — those are Messi's career released in
 * fragments, not leagues. Premier League 2003/04 is thirty-eight matches, which
 * is Arsenal's Invincibles season rather than the division's. Serie A 1986/87 is
 * a single Maradona game.
 *
 * Verified against their match manifests rather than their competition list:
 *
 *   EPL 2015/16       380 of 380      Serie A 1986/87        1
 *   LaLiga 2015/16    380 of 380      EPL 2003/04           38
 *   Serie A 2015/16   380 of 380      LaLiga 2004/05         7
 *   Ligue 1 2015/16   377 of 380      Bundesliga 2015/16    34
 *
 * So four leagues are available in full and all four are loaded. Bundesliga is
 * absent because thirty-four matches is one club's season, and presenting it as
 * a Bundesliga table would be a table of a league that never played.
 *
 * That 2015/16 is also the best season in modern league football — Leicester,
 * and Barcelona's MSN — is a coincidence the product is happy to take.
 */
const HISTORICAL_EDITIONS: Edition[] = [
  {
    key: 'epl-2015-2016',
    competitionId: 'epl',
    seasonLabel: '2015/2016',
    source: 'statsbomb',
    live: false,
    cacheFile: 'statsbomb-epl-2015-2016.json',
    blurb: 'Leicester City, 5000-1 — full shot-level event data',
  },
  {
    key: 'laliga-2015-2016',
    competitionId: 'laliga',
    seasonLabel: '2015/2016',
    source: 'statsbomb',
    live: false,
    cacheFile: 'statsbomb-laliga-2015-2016.json',
    blurb: 'Barcelona\u2019s MSN treble side — full shot-level event data',
  },
  {
    key: 'seriea-2015-2016',
    competitionId: 'seriea',
    seasonLabel: '2015/2016',
    source: 'statsbomb',
    live: false,
    cacheFile: 'statsbomb-seriea-2015-2016.json',
    blurb: 'Juventus\u2019 fifth straight title — full shot-level event data',
  },
  {
    key: 'ligue1-2015-2016',
    competitionId: 'ligue1',
    seasonLabel: '2015/2016',
    source: 'statsbomb',
    live: false,
    cacheFile: 'statsbomb-ligue1-2015-2016.json',
    blurb: 'PSG by thirty-one points — full shot-level event data',
  },
];

export const EDITIONS: Edition[] = [...LIVE_EDITIONS, ...HISTORICAL_EDITIONS];

export function getEdition(key: string): Edition | undefined {
  return EDITIONS.find((e) => e.key === key);
}

/** Every edition of one competition, live first. */
export function editionsFor(competitionId: string): Edition[] {
  return EDITIONS.filter((e) => e.competitionId === competitionId)
    .sort((a, b) => Number(b.live) - Number(a.live));
}

/** True when a competition has more than one edition, so the UI shows a picker. */
export function hasMultipleEditions(competitionId: string): boolean {
  return editionsFor(competitionId).length > 1;
}

/** Historical editions available at all, for the landing surfaces. */
export const historicalEditions = (): Edition[] => HISTORICAL_EDITIONS;

/** Back-compat: the live edition key for a competition. */
export const snapshotKey = (competitionId: string) => competitionId;

/** Competitions that have at least one edition. */
export const editionCompetitions = () =>
  COMPETITIONS.filter((c) => EDITIONS.some((e) => e.competitionId === c.id));

// ── Forecast cache ──────────────────────────────────────────────────────────

type Forecast = ReturnType<typeof simulateSeason>;

interface ForecastGlobals {
  __cfiForecasts?: Map<string, Forecast>;
}
const G = globalThis as unknown as ForecastGlobals;

export function setForecast(key: string, value: Forecast): void {
  if (!G.__cfiForecasts) G.__cfiForecasts = new Map();
  G.__cfiForecasts.set(key, value);
}

export function getForecast(key: string): Forecast | undefined {
  return G.__cfiForecasts?.get(key);
}
