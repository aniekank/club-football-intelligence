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
 * Historical editions.
 *
 * 2015/16 is the season StatsBomb opened across several leagues at once, which
 * makes it the one where cross-league comparison is possible on identical,
 * shot-level data. It is also the best story in modern league football, which
 * does not hurt.
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
