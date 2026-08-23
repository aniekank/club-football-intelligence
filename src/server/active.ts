import { getCachedSnapshot, getSnapshot, loadedKeys } from '@/data/store';
import { getForecast, snapshotKey, BOOT_COMPETITIONS } from '@/data/editions';
import { COMPETITIONS, getCompetition } from '@/domain/competitions';
import type { Competition, DatasetSnapshot } from '@/domain/types';

/**
 * Resolve which competition a request is looking at.
 *
 * Reading the snapshot from the per-competition cache rather than mutating the
 * "active" pointer is deliberate: two concurrent requests can be looking at
 * different competitions, and a shared mutable pointer would let one request's
 * choice leak into another's render.
 */
export interface ActiveView {
  competition: Competition;
  snapshot: DatasetSnapshot | undefined;
  /** Competitions that have actually loaded, for the switcher. */
  available: Competition[];
  forecast: ReturnType<typeof getForecast>;
}

export function resolveActive(competitionId?: string): ActiveView {
  const loaded = new Set(loadedKeys());
  const available = COMPETITIONS.filter(
    (c) => loaded.has(snapshotKey(c.id)) || BOOT_COMPETITIONS.includes(c.id),
  );

  const requested = competitionId ? getCompetition(competitionId) : undefined;
  const fallback =
    available.find((c) => loaded.has(snapshotKey(c.id))) ??
    available[0] ??
    COMPETITIONS[0]!;
  const competition = requested ?? fallback;

  const snapshot =
    getCachedSnapshot(snapshotKey(competition.id)) ??
    (competition.id === getSnapshot()?.competition.id ? getSnapshot() : undefined);

  return {
    competition,
    snapshot,
    available,
    forecast: getForecast(snapshotKey(competition.id)),
  };
}

/** Live fixtures across EVERY loaded competition — a club plays in several. */
export function liveAcrossCompetitions() {
  const now = Date.now();
  const MAX_LIVE_MS = 210 * 60_000;
  const out = [];
  for (const key of loadedKeys()) {
    const snap = getCachedSnapshot(key);
    if (!snap) continue;
    for (const m of snap.matches) {
      if (m.status !== 'LIVE' && m.status !== 'HALFTIME') continue;
      if (now - Date.parse(m.kickoff) >= MAX_LIVE_MS) continue;
      out.push({ match: m, snapshot: snap });
    }
  }
  return out.sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff));
}
