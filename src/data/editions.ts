import type { simulateSeason } from '@/analytics/season';

/**
 * Edition keys and the forecast cache.
 *
 * Deliberately free of any Node built-in. `src/data/bootstrap.ts` reads and
 * writes the on-disk last-known-good cache and therefore imports node:fs, which
 * makes it unusable from anything the client bundle can reach. Page code needs
 * the keys and the forecasts but never the filesystem, so they live here and
 * bootstrap imports from this module rather than the other way round.
 */

/** Competitions loaded at boot, in priority order. */
export const BOOT_COMPETITIONS = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'ucl'];

export const snapshotKey = (competitionId: string) => competitionId;

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
