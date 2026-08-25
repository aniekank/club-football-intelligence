import type {
  DatasetSnapshot, ID, Match, Player, PlayerStats, StandingRow, Team,
} from '@/domain/types';

/**
 * The snapshot store.
 *
 * ── Why the cache lives on globalThis ──────────────────────────────────────
 * Next.js runs `instrumentation.ts` in a SEPARATE module instance from request
 * handlers. A plain module-level variable set during the boot-time data load is
 * therefore invisible to pages, and the app renders empty while insisting the
 * data is loaded. globalThis is shared across every instance in the process.
 *
 * ── Why the indexes are keyed to snapshot IDENTITY ─────────────────────────
 * This is the subtler half of the same bug, and it cost the parent product a
 * production outage. Invalidating indexes inside `setSnapshot()` only clears
 * them in the instance that called it. A handler instance that had already
 * built its indexes from the startup default keeps them — so `getTeams()`
 * returns the NEW snapshot's rows while `getTeam(id)` looks them up in the OLD
 * index. Every lookup misses, every page renders blank, and the data is
 * demonstrably present the whole time.
 *
 * Keying the indexes to the snapshot OBJECT IDENTITY (which lives on
 * globalThis, and so is shared) makes every instance self-heal the moment the
 * active snapshot swaps. The second guard — rebuilding when any index is
 * missing even though the identity matches — covers the concurrent path where
 * one instance nulled the indexes but left the identity pointer intact.
 */

interface StoreGlobals {
  __cfiActive?: DatasetSnapshot;
  __cfiActiveKey?: string;
  __cfiByKey?: Map<string, DatasetSnapshot>;
  __cfiIndexes?: SnapshotIndexes;
}

const G = globalThis as unknown as StoreGlobals;

interface SnapshotIndexes {
  /** The snapshot these indexes were built from — the identity guard. */
  source: DatasetSnapshot;
  teams: Map<ID, Team>;
  players: Map<ID, Player>;
  matches: Map<ID, Match>;
  standingsByTeam: Map<ID, StandingRow>;
  statsByPlayer: Map<ID, PlayerStats[]>;
  matchesByTeam: Map<ID, Match[]>;
}

function snapshotCache(): Map<string, DatasetSnapshot> {
  if (!G.__cfiByKey) G.__cfiByKey = new Map();
  return G.__cfiByKey;
}

/** The active edition key, e.g. 'epl-2026-2027'. */
export function activeKey(): string | null {
  return G.__cfiActiveKey ?? null;
}

export function hasSnapshot(): boolean {
  return G.__cfiActive !== undefined;
}

/** Every edition loaded so far, for instant switching. */
/**
 * Every loaded snapshot, for surfaces that reason ACROSS competitions.
 *
 * Almost everything here is scoped to one competition, deliberately. Cross-
 * league ranking is the exception that needs the whole set at once: leagues can
 * only be placed against each other through the continental matches that
 * connect them, and that evidence lives spread across every snapshot.
 */
export function allSnapshots(): DatasetSnapshot[] {
  return loadedKeys()
    .map((k) => getCachedSnapshot(k))
    .filter((s): s is DatasetSnapshot => s !== undefined);
}

export function loadedKeys(): string[] {
  return [...snapshotCache().keys()];
}

export function getCachedSnapshot(key: string): DatasetSnapshot | undefined {
  return snapshotCache().get(key);
}

/**
 * The active snapshot, or undefined before the first load completes.
 *
 * Deliberately NOT throwing and NOT lazily generating: during the boot window a
 * page must be able to render a skeleton rather than crash or block. Callers
 * handle undefined; `requireSnapshot()` exists for the paths that genuinely
 * cannot proceed without it.
 */
export function getSnapshot(): DatasetSnapshot | undefined {
  return G.__cfiActive;
}

export function requireSnapshot(): DatasetSnapshot {
  const snap = G.__cfiActive;
  if (!snap) throw new Error('no snapshot loaded');
  return snap;
}

/**
 * Install a snapshot and make it active. Indexes are NOT eagerly rebuilt —
 * they rebuild lazily on first read, in whichever module instance does the
 * reading, which is precisely the point.
 */
export function setSnapshot(snapshot: DatasetSnapshot, key: string): void {
  snapshotCache().set(key, snapshot);
  G.__cfiActive = snapshot;
  G.__cfiActiveKey = key;
}

/** Switch to an already-loaded edition. Returns false if it isn't cached. */
export function activateSnapshot(key: string): boolean {
  const snap = snapshotCache().get(key);
  if (!snap) return false;
  G.__cfiActive = snap;
  G.__cfiActiveKey = key;
  return true;
}

function buildIndexes(snap: DatasetSnapshot): SnapshotIndexes {
  const matchesByTeam = new Map<ID, Match[]>();
  for (const m of snap.matches) {
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      const list = matchesByTeam.get(teamId);
      if (list) list.push(m);
      else matchesByTeam.set(teamId, [m]);
    }
  }
  for (const list of matchesByTeam.values()) {
    list.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }

  const statsByPlayer = new Map<ID, PlayerStats[]>();
  for (const s of snap.playerStats) {
    const list = statsByPlayer.get(s.playerId);
    if (list) list.push(s);
    else statsByPlayer.set(s.playerId, [s]);
  }

  return {
    source: snap,
    teams: new Map(snap.teams.map((t) => [t.id, t])),
    players: new Map(snap.players.map((p) => [p.id, p])),
    matches: new Map(snap.matches.map((m) => [m.id, m])),
    standingsByTeam: new Map(snap.standings.map((r) => [r.teamId, r])),
    statsByPlayer,
    matchesByTeam,
  };
}

function indexes(): SnapshotIndexes | null {
  const snap = G.__cfiActive;
  if (!snap) return null;
  const existing = G.__cfiIndexes;
  // The identity guard AND the completeness guard. Either one failing means a
  // rebuild; skipping the second is how you get `null.get(...)` at runtime.
  if (existing && existing.source === snap) return existing;
  const built = buildIndexes(snap);
  G.__cfiIndexes = built;
  return built;
}

// ── Accessors ───────────────────────────────────────────────────────────────
// Every one returns undefined rather than throwing on a miss. A knockout
// fixture with a not-yet-known opponent, or a lookup during the boot window,
// is normal — it must render as "TBD", not crash the page.

export const getTeams = (): Team[] => getSnapshot()?.teams ?? [];
export const getTeam = (id: ID): Team | undefined => indexes()?.teams.get(id);
export const getPlayers = (): Player[] => getSnapshot()?.players ?? [];
export const getPlayer = (id: ID): Player | undefined => indexes()?.players.get(id);
export const getMatches = (): Match[] => getSnapshot()?.matches ?? [];
export const getMatch = (id: ID): Match | undefined => indexes()?.matches.get(id);
export const getStandings = (): StandingRow[] => getSnapshot()?.standings ?? [];
export const getStandingFor = (teamId: ID): StandingRow | undefined =>
  indexes()?.standingsByTeam.get(teamId);
export const getPlayerStats = (playerId: ID): PlayerStats[] =>
  indexes()?.statsByPlayer.get(playerId) ?? [];
export const getTeamMatches = (teamId: ID): Match[] =>
  indexes()?.matchesByTeam.get(teamId) ?? [];

/**
 * Matches currently in play.
 *
 * The elapsed-time guard is not paranoia: a provider can leave a fixture marked
 * LIVE long after full time, and without this a finished game shows a spinning
 * clock and inflates the "live now" badge indefinitely. Three and a half hours
 * covers extra time and penalties with room to spare.
 */
const MAX_LIVE_MS = 210 * 60_000;
export function getLiveMatches(): Match[] {
  const now = Date.now();
  return getMatches().filter(
    (m) =>
      (m.status === 'LIVE' || m.status === 'HALFTIME') &&
      now - Date.parse(m.kickoff) < MAX_LIVE_MS,
  );
}

export function getFinishedMatches(): Match[] {
  return getMatches().filter((m) => m.status === 'FINISHED');
}

/** Upcoming fixtures in kickoff order. */
export function getUpcomingMatches(limit = 20): Match[] {
  const now = Date.now();
  return getMatches()
    .filter((m) => m.status === 'SCHEDULED' && Date.parse(m.kickoff) >= now)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, limit);
}

/** Capability flags for the active snapshot; conservative defaults pre-load. */
export function capabilities() {
  return (
    getSnapshot()?.meta.capabilities ?? {
      hasXG: false, hasShotLocations: false, hasLineups: false,
      hasPlayerStats: false, hasMomentum: false, hasFormations: false,
      hasManagers: false, hasMarketValues: false, hasOdds: false,
      modeledMetrics: [] as string[],
    }
  );
}

/** Test-only: drop everything so a suite can start from a clean process. */
export function __resetStore(): void {
  G.__cfiActive = undefined;
  G.__cfiActiveKey = undefined;
  G.__cfiByKey = undefined;
  G.__cfiIndexes = undefined;
}
