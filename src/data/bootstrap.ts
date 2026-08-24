import { loadCompetition } from './providers/fotmob';
import { setSnapshot, getCachedSnapshot, activateSnapshot, activeKey } from './store';
import { rateTeams } from '@/analytics/ratings';
import { simulateSeason } from '@/analytics/season';
import { checkSnapshot } from '@/domain/schema';
import { COMPETITIONS } from '@/domain/competitions';
import {
  BOOT_COMPETITIONS, snapshotKey, setForecast, historicalEditions, type Edition,
} from './editions';
import { buildFromEdition, type StatsBombEdition } from './providers/statsbomb';
import type { DatasetSnapshot } from '@/domain/types';

/**
 * Snapshot bootstrap and refresh.
 *
 * Runs from instrumentation.ts at server start, in a SEPARATE module instance
 * from request handlers — which is exactly why the store keeps its cache on
 * globalThis. See src/data/store.ts for the full account of that trap.
 *
 * Three properties this has to have, all learned the expensive way:
 *
 *   1. NEVER BLOCK THE BOOT. Loading runs in the background; pages render a
 *      skeleton until it lands. A synchronous load means an upstream stall is
 *      an outage.
 *   2. LAST-KNOWN-GOOD ON DISK. The live source is undocumented and can block
 *      at any time. A cached snapshot means a blocked feed degrades to slightly
 *      stale data with an honest banner, rather than an empty site.
 *   3. VALIDATE BEFORE INSTALLING. A snapshot that fails conformance never
 *      becomes active; the previous good one keeps serving.
 */

const CACHE_DIR = '.snapshot-cache';

/**
 * Load node's filesystem API at CALL time, behind `webpackIgnore`.
 *
 * Next bundles instrumentation.ts for the EDGE runtime as well as node, and the
 * edge bundle has no loader for node built-ins — so a top-level `import fs`
 * fails the production build even though this module only ever executes under
 * node. `webpackIgnore` leaves the specifier alone for the bundler to skip, and
 * the NEXT_RUNTIME guard in instrumentation.ts ensures it is never reached on
 * edge. Returning null instead of throwing keeps the disk cache strictly
 * optional: losing it costs restart resilience, never correctness.
 */
async function nodeFs(): Promise<{
  fs: typeof import('node:fs/promises');
  path: typeof import('node:path');
} | null> {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return null;
  try {
    const fs = await import(/* webpackIgnore: true */ 'node:fs/promises');
    const path = await import(/* webpackIgnore: true */ 'node:path');
    return { fs: fs.default ?? fs, path: path.default ?? path };
  } catch {
    return null;
  }
}

/** Refresh cadence. Deliberately unhurried — this is not a live-score ticker,
 *  and a polite request rate is what keeps the source available to us. */
const REFRESH_INTERVAL_MS = 6 * 60_000;
/** Faster cadence while anything is in play. */
const LIVE_REFRESH_INTERVAL_MS = 90_000;

interface BootGlobals {
  __cfiBootStarted?: boolean;
  __cfiRefreshTimer?: ReturnType<typeof setTimeout>;
  __cfiStatus?: LoadStatus;
}
const G = globalThis as unknown as BootGlobals;

export interface LoadStatus {
  startedAt: string;
  /** Per-competition state, for the health endpoint and the UI banner. */
  competitions: Record<string, {
    state: 'pending' | 'ready' | 'failed' | 'stale-cache';
    error?: string;
    fetchedAt?: string;
  }>;
}

export function loadStatus(): LoadStatus {
  if (!G.__cfiStatus) {
    G.__cfiStatus = { startedAt: new Date().toISOString(), competitions: {} };
  }
  return G.__cfiStatus;
}

// ── Disk cache ──────────────────────────────────────────────────────────────

async function writeCache(key: string, snapshot: DatasetSnapshot): Promise<void> {
  const node = await nodeFs();
  if (!node) return;
  try {
    const dir = node.path.join(process.cwd(), CACHE_DIR);
    await node.fs.mkdir(dir, { recursive: true });
    const file = node.path.join(dir, `${key}.json`);
    // Write-then-rename so a crash mid-write cannot leave a truncated file that
    // would then fail to parse on every subsequent boot.
    const tmp = `${file}.tmp`;
    await node.fs.writeFile(tmp, JSON.stringify(snapshot), 'utf8');
    await node.fs.rename(tmp, file);
  } catch {
    // A cache write failing is not worth failing a load over.
  }
}

async function readCache(key: string): Promise<DatasetSnapshot | null> {
  const node = await nodeFs();
  if (!node) return null;
  try {
    const file = node.path.join(process.cwd(), CACHE_DIR, `${key}.json`);
    const raw = await node.fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as DatasetSnapshot;
    return checkSnapshot(parsed).ok ? parsed : null;
  } catch {
    return null;
  }
}

// ── Enrichment ──────────────────────────────────────────────────────────────

/**
 * Attach model output to a raw snapshot: derive ratings from results, run the
 * season Monte Carlo, and fold the probabilities onto the standings rows so the
 * table can render them without the UI knowing the engine exists.
 */
export function enrich(snapshot: DatasetSnapshot): DatasetSnapshot {
  const { teams, leagueAvgGoals } = rateTeams(snapshot);
  const { forecasts } = simulateSeason(snapshot, teams, { goalModel: { leagueAvgGoals } });
  const byTeam = new Map(forecasts.map((f) => [f.teamId, f]));

  return {
    ...snapshot,
    teams,
    standings: snapshot.standings.map((row) => {
      const f = byTeam.get(row.teamId);
      if (!f) return row;
      return {
        ...row,
        titleProbability: f.winTitle,
        top4Probability: f.top4,
        relegationProbability: f.relegation,
      };
    }),
  };
}

// ── Loading ─────────────────────────────────────────────────────────────────

/**
 * Load one competition. Falls back to the disk cache on failure and reports the
 * degradation honestly rather than serving stale data as if it were fresh.
 */
export async function loadOne(competitionId: string): Promise<boolean> {
  const key = snapshotKey(competitionId);
  const status = loadStatus();
  status.competitions[key] = { state: 'pending' };

  try {
    const raw = await loadCompetition(competitionId);
    const check = checkSnapshot(raw);
    if (!check.ok) {
      // Conformance is a gate, not a guillotine. Rejecting an entire
      // competition because one match carried a null in an optional chart
      // series traded a cosmetic defect for a missing league — which is a far
      // worse outcome for a reader. The load still fails loudly in the log and
      // on /api/health so the shape problem gets fixed rather than absorbed.
      console.error(
        `[cfi] ${competitionId} failed conformance (${check.errors.length} issues):`,
        check.errors.slice(0, 5).join('; '),
      );
      throw new Error(`conformance failed: ${check.errors.slice(0, 3).join('; ')}`);
    }

    const { teams, leagueAvgGoals } = rateTeams(raw);
    const forecast = simulateSeason(raw, teams, { goalModel: { leagueAvgGoals } });
    const byTeam = new Map(forecast.forecasts.map((f) => [f.teamId, f]));
    const enriched: DatasetSnapshot = {
      ...raw,
      teams,
      standings: raw.standings.map((row) => {
        const f = byTeam.get(row.teamId);
        return f
          ? {
              ...row,
              titleProbability: f.winTitle,
              top4Probability: f.top4,
              relegationProbability: f.relegation,
            }
          : row;
      }),
    };

    setSnapshot(enriched, key);
    setForecast(key, forecast);
    status.competitions[key] = { state: 'ready', fetchedAt: enriched.meta.fetchedAt };
    void writeCache(key, raw);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Only fall back to disk if nothing is already serving — replacing live
    // data with a cached copy would be a downgrade, not a rescue.
    if (!getCachedSnapshot(key)) {
      const cached = await readCache(key);
      if (cached) {
        const stale: DatasetSnapshot = {
          ...cached,
          meta: {
            ...cached.meta,
            degraded: true,
            degradedKind: 'stale-cache',
            degradedReason: `Live feed unavailable (${message}); showing the last good snapshot from ${cached.meta.fetchedAt}`,
          },
        };
        setSnapshot(enrich(stale), key);
        status.competitions[key] = {
          state: 'stale-cache', error: message, fetchedAt: cached.meta.fetchedAt,
        };
        return true;
      }
    }

    status.competitions[key] = { state: 'failed', error: message };
    return false;
  }
}

/**
 * Load a historical edition from its committed cache.
 *
 * Instant and offline. A completed season is immutable, so there is nothing to
 * refresh and no vendor that can withdraw it — which is exactly why the
 * expensive ingest happens once, offline, and the result lives in the repo.
 */
export async function loadHistorical(edition: Edition): Promise<boolean> {
  const status = loadStatus();
  status.competitions[edition.key] = { state: 'pending' };
  try {
    const node = await nodeFs();
    if (!node || !edition.cacheFile) throw new Error('no cache file');
    const file = node.path.join(process.cwd(), 'src', 'data', 'cache', edition.cacheFile);
    const raw = JSON.parse(await node.fs.readFile(file, 'utf8')) as StatsBombEdition;

    const snapshot = buildFromEdition(raw);
    const check = checkSnapshot(snapshot);
    if (!check.ok) {
      throw new Error(`conformance failed: ${check.errors.slice(0, 3).join('; ')}`);
    }

    const { teams, leagueAvgGoals } = rateTeams(snapshot);
    // A completed season has nothing left to simulate, so the Monte Carlo is
    // skipped entirely: every probability is already a fact. Running it would
    // burn half a second to rediscover the actual champion.
    const enriched: DatasetSnapshot = { ...snapshot, teams };
    setSnapshot(enriched, edition.key);
    setForecast(edition.key, {
      forecasts: [], runs: 0, remainingFixtures: 0,
    } as ReturnType<typeof simulateSeason>);
    status.competitions[edition.key] = {
      state: 'ready', fetchedAt: snapshot.meta.fetchedAt,
    };
    void leagueAvgGoals;
    return true;
  } catch (err) {
    status.competitions[edition.key] = {
      state: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
    return false;
  }
}

/**
 * Boot. Loads the first competition, activates it so the site is usable as
 * early as possible, then fills in the rest behind it.
 */
export async function bootstrap(): Promise<void> {
  if (G.__cfiBootStarted) return;
  G.__cfiBootStarted = true;
  loadStatus();

  const [first, ...rest] = BOOT_COMPETITIONS;
  if (first) {
    await loadOne(first);
    activateSnapshot(snapshotKey(first));
  }

  // Historical editions cost nothing upstream — they are local reads — so they
  // land before the remaining live competitions rather than behind them.
  for (const edition of historicalEditions()) {
    await loadHistorical(edition);
  }

  // Sequential, not parallel: six competitions arriving at once is a burst the
  // upstream has no reason to tolerate, and nothing here is urgent.
  for (const id of rest) {
    await loadOne(id);
  }

  scheduleRefresh();
}

function scheduleRefresh(): void {
  if (G.__cfiRefreshTimer) clearTimeout(G.__cfiRefreshTimer);

  const anyLive = COMPETITIONS.some((c) => {
    const snap = getCachedSnapshot(snapshotKey(c.id));
    return snap?.matches.some((m) => m.status === 'LIVE' || m.status === 'HALFTIME');
  });

  G.__cfiRefreshTimer = setTimeout(
    () => { void refreshAll(); },
    anyLive ? LIVE_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS,
  );
  // Do not hold the process open just for a refresh timer.
  G.__cfiRefreshTimer.unref?.();
}

async function refreshAll(): Promise<void> {
  const current = activeKey();
  for (const id of BOOT_COMPETITIONS) {
    await loadOne(id);
  }
  // A refresh must not yank the user's chosen competition out from under them.
  if (current) activateSnapshot(current);
  scheduleRefresh();
}

export { BOOT_COMPETITIONS, snapshotKey, getForecast, setForecast } from './editions';
