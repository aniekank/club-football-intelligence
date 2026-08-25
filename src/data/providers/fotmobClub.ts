import type {
  ClubHistory, ClubSeasonRank, ClubTrophy, CoachSpell, ClubVenue, ID,
} from '@/domain/types';

/**
 * A club's history, fetched per club and cached.
 *
 * ── Why this is not part of the boot ───────────────────────────────────────
 * Honours and finishing positions come from a PER-CLUB endpoint. The product
 * carries roughly seven hundred clubs across thirty-six competitions, so
 * fetching this at startup would multiply boot cost by an order of magnitude
 * for data that changes about once a year.
 *
 * So it is fetched when a club page is actually opened, and cached on
 * `globalThis` for a day. A reader who never visits Grêmio never costs a
 * request for Grêmio.
 *
 * ── Failure is not an error page ───────────────────────────────────────────
 * Every function here returns null rather than throwing. A club page whose
 * history could not be fetched is a club page without a history section — the
 * table, fixtures, form and model are all still there, and none of them depend
 * on this. Losing a section is a much smaller failure than losing the page.
 */

const BASE = 'https://www.fotmob.com/api/data';
const TTL_MS = 24 * 60 * 60 * 1000;

interface Entry { at: number; value: ClubHistory | null }

const G = globalThis as typeof globalThis & { __cfiClubHistory?: Map<string, Entry> };
function cache(): Map<string, Entry> {
  G.__cfiClubHistory ??= new Map();
  return G.__cfiClubHistory;
}

/** In-flight requests, so ten concurrent renders of a page cause one fetch. */
const G2 = globalThis as typeof globalThis & {
  __cfiClubHistoryInflight?: Map<string, Promise<ClubHistory | null>>;
};
function inflight(): Map<string, Promise<ClubHistory | null>> {
  G2.__cfiClubHistoryInflight ??= new Map();
  return G2.__cfiClubHistoryInflight;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * FotMob returns trophy fields as single-element ARRAYS of strings —
 * `won: ["10"]`, `season_won: ["2023/2024,2022/2023,..."]` — with the seasons
 * as one comma-joined string inside that array. Unwrapping it in one place
 * keeps the shape out of everything downstream.
 */
const first = (v: unknown): string | null =>
  Array.isArray(v) ? (typeof v[0] === 'string' ? v[0] : null)
    : typeof v === 'string' ? v : null;

interface FmClub {
  history?: {
    trophyList?: Record<string, unknown>[];
    historicalTableData?: {
      ranks?: {
        tournamentName?: string; seasonName?: string; position?: number;
        numberOfTeams?: number;
        stats?: { points?: number; wins?: number; draws?: number; loss?: number };
      }[];
    };
    coachHistory?: Record<string, unknown>[];
  };
  overview?: {
    coachHistory?: Record<string, unknown>[];
    venue?: {
      widget?: { name?: string; city?: string };
      statPairs?: [string, string | number][];
    };
  };
}

function mapTrophies(raw: Record<string, unknown>[] | undefined): ClubTrophy[] {
  return (raw ?? []).flatMap((t) => {
    const name = first(t.name);
    if (!name) return [];
    const seasons = (first(t.season_won) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return [{
      competitionName: name,
      country: first(t.area),
      won: num(first(t.won)) ?? seasons.length,
      runnerUp: num(first(t.runnerup)) ?? 0,
      seasons,
    }];
  })
    // Honours read by weight, not alphabetically.
    .sort((a, b) => b.won - a.won || a.competitionName.localeCompare(b.competitionName));
}

function mapSeasons(raw: FmClub['history']): ClubSeasonRank[] {
  return (raw?.historicalTableData?.ranks ?? []).flatMap((r) => {
    if (typeof r.position !== 'number' || !r.seasonName) return [];
    return [{
      season: r.seasonName,
      competitionName: r.tournamentName ?? '',
      position: r.position,
      outOf: r.numberOfTeams ?? 0,
      points: r.stats?.points ?? 0,
      won: r.stats?.wins ?? 0,
      drawn: r.stats?.draws ?? 0,
      lost: r.stats?.loss ?? 0,
    }];
  }).sort((a, b) => a.season.localeCompare(b.season));
}

function mapCoaches(raw: Record<string, unknown>[] | undefined): CoachSpell[] {
  return (raw ?? []).flatMap((c) => {
    const name = typeof c.name === 'string' ? c.name : null;
    if (!name) return [];
    return [{
      managerId: String(c.id ?? name),
      name,
      season: typeof c.season === 'string' ? c.season : '',
      competitionName: typeof c.leagueName === 'string' ? c.leagueName : '',
      won: num(c.win) ?? 0,
      drawn: num(c.draw) ?? 0,
      lost: num(c.loss) ?? 0,
      pointsPerGame: num(c.pointsPerGame),
      winRate: num(c.winPercentage),
    }];
  }).sort((a, b) => b.season.localeCompare(a.season));
}

function mapVenue(raw: FmClub['overview']): ClubVenue | null {
  const v = raw?.venue;
  if (!v?.widget?.name) return null;
  const pairs = new Map((v.statPairs ?? []).map(([k, val]) => [String(k), val]));
  return {
    name: v.widget.name,
    city: v.widget.city ?? null,
    capacity: num(pairs.get('Capacity')),
    opened: num(pairs.get('Opened')),
    surface: typeof pairs.get('Surface') === 'string' ? (pairs.get('Surface') as string) : null,
  };
}

export function mapClubHistory(teamId: ID, raw: FmClub): ClubHistory {
  return {
    teamId,
    fetchedAt: new Date().toISOString(),
    trophies: mapTrophies(raw.history?.trophyList),
    seasons: mapSeasons(raw.history),
    coaches: mapCoaches(raw.history?.coachHistory ?? raw.overview?.coachHistory),
    venue: mapVenue(raw.overview),
  };
}

export async function fetchClubHistory(teamId: ID): Promise<ClubHistory | null> {
  const hit = cache().get(teamId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const pending = inflight().get(teamId);
  if (pending) return pending;

  const task = (async (): Promise<ClubHistory | null> => {
    try {
      const res = await fetch(`${BASE}/teams?id=${encodeURIComponent(teamId)}`, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const value = mapClubHistory(teamId, (await res.json()) as FmClub);
      cache().set(teamId, { at: Date.now(), value });
      return value;
    } catch {
      // Cache the FAILURE too, briefly, so a club whose history is genuinely
      // unavailable does not re-request on every render of its page.
      cache().set(teamId, { at: Date.now() - TTL_MS + 5 * 60_000, value: null });
      return null;
    } finally {
      inflight().delete(teamId);
    }
  })();

  inflight().set(teamId, task);
  return task;
}
