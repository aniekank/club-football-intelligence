import { fetchJson, mapLimit } from '../http';
import { computeStandings } from '@/analytics/standings';
import { getCompetition, zoneForRank } from '@/domain/competitions';
import { derivePriors, type PriorSeasonRow } from '@/analytics/ratings';
import {
  foldMatch, newFold, finaliseFold,
  type FmLineup, type FmPlayerStats,
} from './fotmobPlayers';
import { mapEvents, type FmEventsBlock } from './fotmobEvents';
import { mapTransfers, type FmTransfersBlock } from './fotmobTransfers';
import type {
  Competition, DatasetCapabilities, DatasetSnapshot, ID, Match, MatchTeamStats,
  PriorRating, Season, Shot, ShotBodyPart, ShotOutcome, ShotSituation, StandingRow, Team, Zone, ZoneKind,
} from '@/domain/types';

/**
 * FotMob adapter.
 *
 * ── Why this source ────────────────────────────────────────────────────────
 * Validated 2026-08-23 against the alternatives. SportMonks' account is on a
 * free plan covering only Denmark and Scotland with no xG; API-Football's free
 * plan refuses the current season outright ("try from 2022 to 2024"); Understat
 * is unreachable from this network and FBref answers 403. FotMob's public JSON
 * needs no key, covers the current season across the top five leagues plus
 * UEFA, and carries genuine SHOT-LEVEL xG — richer than the feed the parent
 * product shipped on.
 *
 * ── Request budget ─────────────────────────────────────────────────────────
 * A season is 380 fixtures per league; fetching match detail for all of them
 * across five leagues would be ~1,900 requests and would get us blocked. So the
 * boot path is deliberately cheap:
 *
 *   1. ONE /leagues call per competition returns the full 380-fixture list, the
 *      league table, the xG table and the qualification legend. That is the
 *      entire structural snapshot in 5-7 requests.
 *   2. Match DETAIL (shots, team stats, lineups, momentum) is fetched only for
 *      a recent window plus anything live, capped and concurrency-limited.
 *
 * ── Caveat worth knowing ───────────────────────────────────────────────────
 * It is an undocumented private API. It has previously required an `x-mas`
 * header and can add auth or block at any time, so everything here sits behind
 * the source-agnostic snapshot contract and a last-known-good cache.
 */

const BASE = 'https://www.fotmob.com/api/data';

/** FotMob league ids → our competition ids. Verified live. */
export const FOTMOB_LEAGUES: Record<string, number> = {
  epl: 47,
  laliga: 87,
  seriea: 55,
  bundesliga: 54,
  ligue1: 53,
  ucl: 42,
  uel: 73,
  mls: 130,
  ligamx: 230,
};

/**
 * Three-letter codes. Derivation collides on exactly the clubs people care
 * about — Manchester United and Manchester City both reduce to MAN, as do the
 * two Milans and the two Madrids — so the ones that matter are curated and the
 * rest fall back to a collision-aware derivation.
 */
const TEAM_CODES: Record<string, string> = {
  'Manchester United': 'MUN', 'Manchester City': 'MCI', Arsenal: 'ARS', Chelsea: 'CHE',
  Liverpool: 'LIV', 'Tottenham Hotspur': 'TOT', 'Newcastle United': 'NEW',
  'Aston Villa': 'AVL', 'West Ham United': 'WHU', Everton: 'EVE',
  'Brighton & Hove Albion': 'BHA', 'Nottingham Forest': 'NFO', Fulham: 'FUL',
  'Crystal Palace': 'CRY', Brentford: 'BRE', Bournemouth: 'BOU', Wolves: 'WOL',
  'Wolverhampton Wanderers': 'WOL', 'Leeds United': 'LEE', 'Leicester City': 'LEI',
  Sunderland: 'SUN', Burnley: 'BUR', 'Hull City': 'HUL', 'Coventry City': 'COV',
  Southampton: 'SOU', 'Ipswich Town': 'IPS', Watford: 'WAT', Middlesbrough: 'MID',
  'Sheffield United': 'SHU', 'West Bromwich Albion': 'WBA', 'Stoke City': 'STK',
  'Real Madrid': 'RMA', Barcelona: 'BAR', 'Atlético Madrid': 'ATM',
  'Athletic Club': 'ATH', 'Real Sociedad': 'RSO', 'Real Betis': 'BET',
  Villarreal: 'VIL', Valencia: 'VAL', Sevilla: 'SEV', 'Celta Vigo': 'CEL',
  Osasuna: 'OSA', Getafe: 'GET', Girona: 'GIR', 'Rayo Vallecano': 'RAY',
  Mallorca: 'MLL', Espanyol: 'ESP', Alavés: 'ALA', 'Real Oviedo': 'OVI',
  'Inter Milan': 'INT', Internazionale: 'INT', 'AC Milan': 'MIL', Juventus: 'JUV',
  Napoli: 'NAP', Roma: 'ROM', 'AS Roma': 'ROM', Lazio: 'LAZ', Atalanta: 'ATA',
  Fiorentina: 'FIO', Bologna: 'BOL', Torino: 'TOR', Udinese: 'UDI', Genoa: 'GEN',
  'Bayern München': 'BAY', 'Bayern Munich': 'BAY', 'Borussia Dortmund': 'DOR',
  'Bayer Leverkusen': 'LEV', 'RB Leipzig': 'RBL', 'Eintracht Frankfurt': 'SGE',
  'Borussia Mönchengladbach': 'BMG', 'VfB Stuttgart': 'STU', 'Werder Bremen': 'SVW',
  'VfL Wolfsburg': 'WOB', 'SC Freiburg': 'SCF', 'TSG Hoffenheim': 'TSG',
  'FC Union Berlin': 'FCU', 'FC Augsburg': 'FCA', 'FSV Mainz 05': 'M05',
  'Paris Saint-Germain': 'PSG', Marseille: 'OM', Monaco: 'MON', Lyon: 'OL',
  Lille: 'LIL', Nice: 'NIC', Lens: 'RCL', Rennes: 'REN', Nantes: 'NAN',
  Strasbourg: 'STR', Toulouse: 'TFC', Brest: 'BRS',
  'Ajax': 'AJA', 'PSV Eindhoven': 'PSV', Feyenoord: 'FEY', Benfica: 'BEN',
  Porto: 'POR', 'Sporting CP': 'SCP', Celtic: 'CEL', Rangers: 'RAN',
  Galatasaray: 'GAL', Fenerbahce: 'FEN', 'Club Brugge': 'CLU',
  'Red Bull Salzburg': 'RBS', 'Shakhtar Donetsk': 'SHK',
};

// ── Upstream shapes (only the fields we consume) ────────────────────────────

interface FmTeamRef { id: string | number; name: string; shortName?: string }

interface FmMatchStatus {
  utcTime: string;
  finished?: boolean;
  started?: boolean;
  cancelled?: boolean;
  awarded?: boolean;
  scoreStr?: string;
  reason?: { short?: string; long?: string; shortKey?: string };
  liveTime?: { short?: string; long?: string };
}

interface FmMatch {
  id: string | number;
  round?: string;
  roundName?: number | string;
  pageUrl?: string;
  home: FmTeamRef;
  away: FmTeamRef;
  status: FmMatchStatus;
}

interface FmTableRow {
  id: number; name: string; shortName?: string;
  played: number; wins: number; draws: number; losses: number;
  scoresStr?: string; goalConDiff: number; pts: number; idx: number;
  deduction?: number | null; qualColor?: string | null;
}

interface FmXgRow {
  id: number; xg?: number; xgConceded?: number; xPoints?: number;
}

interface FmLegend { title: string; tKey?: string; color?: string; indices: number[] }

interface FmLeagueResponse {
  details?: { id: number; name: string; shortName?: string; country?: string; selectedSeason?: string; type?: string };
  allAvailableSeasons?: string[];
  table?: { data?: {
    legend?: FmLegend[];
    table?: { all?: FmTableRow[]; xg?: FmXgRow[] };
    /** True when the league is conference-split; the tables then live in
     *  `tables`, one per conference plus a combined overall. */
    composite?: boolean;
    tables?: {
      leagueName?: string;
      legend?: FmLegend[];
      table?: { all?: FmTableRow[]; xg?: FmXgRow[] };
    }[];
    selectedSeason?: string;
    isCurrentSeason?: boolean;
  } }[];
  fixtures?: { allMatches?: FmMatch[] };
  transfers?: FmTransfersBlock;
}

interface FmShot {
  id: number | string; playerId: number; playerName?: string; teamId: number;
  min: number; minAdded?: number | null;
  x: number; y: number;
  expectedGoals?: number | null; expectedGoalsOnTarget?: number | null;
  shotType?: string; situation?: string; eventType?: string;
  isBlocked?: boolean; isOnTarget?: boolean; isFromInsideBox?: boolean; isOwnGoal?: boolean;
}

interface FmStatItem { title?: string; key?: string; stats?: (string | number | null)[] }
interface FmStatGroup { title?: string; stats?: FmStatItem[] }

interface FmMatchDetails {
  general?: {
    matchId?: number | string; leagueId?: number; matchRound?: number | string;
    started?: boolean; finished?: boolean; matchTimeUTC?: string;
    homeTeam?: { id: number; name: string }; awayTeam?: { id: number; name: string };
  };
  content?: {
    shotmap?: { shots?: FmShot[] };
    stats?: { Periods?: { All?: { stats?: FmStatGroup[] } } };
    momentum?: { main?: { data?: ({ minute: number | null; value: number | null } | null)[] } };
    matchFacts?: {
      infoBox?: { Stadium?: { name?: string }; Referee?: { text?: string }; Attendance?: number };
      events?: FmEventsBlock;
    };
    lineup?: FmLineup;
    playerStats?: Record<string, FmPlayerStats>;
  };
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

/**
 * FotMob mixes types in one array: numbers, numeric strings ('1.01') and
 * composites ('180 (70%)'). Take the leading number and ignore the rest.
 * Returns null rather than 0 for absent values — the whole degradation story
 * depends on that distinction surviving the parse.
 */
function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = /-?\d+(\.\d+)?/.exec(v);
  if (!m) return null;
  const parsed = Number(m[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The bracketed percentage in strings like '180 (70%)'. */
function pct(v: string | number | null | undefined): number | null {
  if (typeof v !== 'string') return null;
  const m = /\((\d+(?:\.\d+)?)%\)/.exec(v);
  return m ? Number(m[1]) : null;
}

function statLookup(groups: FmStatGroup[]): Map<string, (string | number | null)[]> {
  const out = new Map<string, (string | number | null)[]>();
  for (const g of groups) {
    for (const s of g.stats ?? []) {
      if (!s.key || !s.stats) continue;
      // Group headers repeat a key with [null, null]; never let one clobber a
      // real reading, and keep the FIRST real value we see.
      const hasValue = s.stats.some((v) => v !== null && v !== undefined);
      if (!hasValue) continue;
      if (!out.has(s.key)) out.set(s.key, s.stats);
    }
  }
  return out;
}

const SHOT_BODY: Record<string, ShotBodyPart> = {
  LeftFoot: 'left_foot', RightFoot: 'right_foot', Header: 'head', Other: 'other',
};

const SHOT_SITUATION: Record<string, ShotSituation> = {
  RegularPlay: 'open_play', IndividualPlay: 'open_play', FastBreak: 'fast_break',
  FromCorner: 'corner', SetPiece: 'set_piece', ThrowInSetPiece: 'set_piece',
  FreeKick: 'free_kick', DirectFreekick: 'direct_free_kick', Penalty: 'penalty',
};

function shotOutcome(eventType: string | undefined, isBlocked: boolean | undefined, isOwnGoal: boolean | undefined): ShotOutcome {
  if (isOwnGoal) return 'own_goal';
  switch (eventType) {
    case 'Goal': return 'goal';
    case 'AttemptSaved': return isBlocked ? 'blocked' : 'saved';
    case 'Post': return 'post';
    case 'Miss': return 'off_target';
    default: return 'off_target';
  }
}

/**
 * FotMob shot coordinates are metres on a 105 x 68 pitch, already flipped so
 * every shot attacks the same goal (x → 105). Normalise to the domain's 0..100
 * and clamp, because a shot from a tight angle can sit fractionally outside.
 */
const PITCH_LENGTH = 105;
const PITCH_WIDTH = 68;
const clamp01to100 = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Assign distinct three-letter codes.
 *
 * Exported because every adapter needs it and a second copy would drift: the
 * StatsBomb loader initially used a naive slice and rendered both Manchester
 * clubs as "MAN". Curated codes are claimed first so a derived code can never
 * steal a canonical one.
 */
export function assignCodes(names: string[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  // Curated first, so a derived code can never steal a canonical one.
  for (const name of names) {
    const curated = TEAM_CODES[name];
    if (curated && !used.has(curated)) {
      out.set(name, curated);
      used.add(curated);
    }
  }
  for (const name of names) {
    if (out.has(name)) continue;
    const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
    let code = letters.slice(0, 3) || 'UNK';
    // Walk the remaining letters until we find something unused, so two clubs
    // never share a code inside one snapshot.
    for (let i = 3; used.has(code) && i < letters.length; i++) {
      code = letters.slice(0, 2) + letters[i];
    }
    let suffix = 1;
    while (used.has(code)) code = letters.slice(0, 2) + String(suffix++);
    out.set(name, code);
    used.add(code);
  }
  return out;
}

/**
 * FotMob's legend carries the season's ACTUAL qualification allocation, which
 * moves with cup winners and UEFA coefficient spots. When present it beats our
 * static registry zones — the registry is the fallback, not the authority.
 */
function zonesFromLegend(legend: FmLegend[] | undefined, fallback: Zone[]): Zone[] {
  if (!legend?.length) return fallback;
  const kindFor = (title: string, tKey?: string): ZoneKind | null => {
    const k = (tKey ?? title).toLowerCase();
    if (k.includes('championsleague') || k.includes('champions league')) return 'ucl-league-phase';
    if (k.includes('europaleague') || k.includes('europa')) return 'uel-league-phase';
    if (k.includes('conference')) return 'conference-qualifying';
    if (k.includes('relegationplayoff') || (k.includes('relegation') && k.includes('play'))) return 'relegation-playoff';
    if (k.includes('relegation')) return 'relegation';
    if (k.includes('promotion')) return 'promotion';
    if (k.includes('qualification') || k.includes('qualifying')) return 'ucl-qualifying';
    return null;
  };

  const zones: Zone[] = [];
  for (const entry of legend) {
    const kind = kindFor(entry.title, entry.tKey);
    if (!kind || !entry.indices?.length) continue;
    // `indices` are 0-based positions; our zones are 1-based inclusive ranks.
    const ranks = [...entry.indices].sort((a, b) => a - b).map((i) => i + 1);
    const first = ranks[0] as number;
    const last = ranks[ranks.length - 1] as number;
    zones.push({
      kind,
      fromRank: first,
      toRank: last,
      label: entry.title,
      shortLabel: kind === 'ucl-league-phase' ? 'UCL'
        : kind === 'uel-league-phase' ? 'UEL'
        : kind === 'conference-qualifying' ? 'UECL'
        : kind === 'relegation-playoff' ? 'PO'
        : kind === 'relegation' ? 'REL'
        : kind === 'promotion' ? 'PRO' : 'Q',
    });
  }
  if (!zones.length) return fallback;
  // The champion band is never in the legend — it is implicit in finishing 1st.
  zones.push({ kind: 'champion', fromRank: 1, toRank: 1, label: 'Champions', shortLabel: 'W' });
  return zones;
}

// ── Fetchers ────────────────────────────────────────────────────────────────

export async function fetchLeague(fotmobId: number): Promise<FmLeagueResponse> {
  return fetchJson<FmLeagueResponse>(`${BASE}/leagues?id=${fotmobId}`, {
    label: `fotmob leagues:${fotmobId}`,
  });
}

export async function fetchMatchDetails(matchId: string): Promise<FmMatchDetails> {
  return fetchJson<FmMatchDetails>(`${BASE}/matchDetails?matchId=${matchId}`, {
    label: `fotmob matchDetails:${matchId}`,
  });
}

// ── Mapping ─────────────────────────────────────────────────────────────────

function mapStatus(s: FmMatchStatus): { status: Match['status']; minute: number } {
  if (s.cancelled) return { status: 'CANCELLED', minute: 0 };
  const reason = (s.reason?.shortKey ?? s.reason?.short ?? '').toLowerCase();
  if (reason.includes('postponed') || reason.includes('abandoned')) {
    return { status: 'POSTPONED', minute: 0 };
  }
  if (s.finished) return { status: 'FINISHED', minute: 90 };
  if (s.started) {
    const live = (s.liveTime?.short ?? '').replace(/[^\d]/g, '');
    const minute = live ? Number(live) : 0;
    if ((s.liveTime?.short ?? '').toUpperCase().includes('HT')) {
      return { status: 'HALFTIME', minute: 45 };
    }
    return { status: 'LIVE', minute: Number.isFinite(minute) ? minute : 0 };
  }
  return { status: 'SCHEDULED', minute: 0 };
}

function parseScore(scoreStr: string | undefined): { home: number | null; away: number | null } {
  if (!scoreStr) return { home: null, away: null };
  const m = /(\d+)\s*-\s*(\d+)/.exec(scoreStr);
  if (!m) return { home: null, away: null };
  return { home: Number(m[1]), away: Number(m[2]) };
}

function buildTeamStats(teamId: ID, details: FmMatchDetails, side: 0 | 1): MatchTeamStats {
  const groups = details.content?.stats?.Periods?.All?.stats ?? [];
  const lookup = statLookup(groups);
  const pick = (key: string): number | null => {
    const arr = lookup.get(key);
    return arr ? num(arr[side]) : null;
  };
  const pickPct = (key: string): number | null => {
    const arr = lookup.get(key);
    return arr ? pct(arr[side]) : null;
  };

  const passes = pick('passes');
  const oppHalfPasses = pick('opposition_half_passes');

  return {
    teamId,
    possession: pick('BallPossesion'),
    shots: pick('total_shots'),
    shotsOnTarget: pick('ShotsOnTarget'),
    xG: pick('expected_goals'),
    xGOnTarget: pick('expected_goals_on_target'),
    corners: pick('corners'),
    fouls: pick('fouls'),
    offsides: pick('Offsides'),
    passes,
    passAccuracy: pickPct('accurate_passes'),
    bigChances: pick('big_chance'),
    saves: pick('keeper_saves'),
    yellowCards: pick('yellow_cards'),
    redCards: pick('red_cards'),
    // Share of this side's passes played in the opposition half. A genuine
    // territorial measure, but NOT the tracking-data definition of field tilt
    // (final-third touch share), so it is declared a modelled metric and the
    // UI labels it "(est.)".
    fieldTilt: passes && oppHalfPasses !== null && passes > 0
      ? Math.round((oppHalfPasses / passes) * 1000) / 10
      : null,
    ppda: null, // no defensive-action-by-zone data upstream; hidden, not zeroed
  };
}

function buildShots(matchId: string, details: FmMatchDetails): Shot[] {
  const shots = details.content?.shotmap?.shots ?? [];
  return shots.map((s): Shot => ({
    id: `${matchId}-s${s.id}`,
    matchId,
    minute: s.min + (s.minAdded ?? 0),
    teamId: String(s.teamId),
    playerId: String(s.playerId),
    x: clamp01to100((s.x / PITCH_LENGTH) * 100),
    y: clamp01to100((s.y / PITCH_WIDTH) * 100),
    xG: s.expectedGoals ?? 0,
    xGOnTarget: s.expectedGoalsOnTarget ?? null,
    bodyPart: SHOT_BODY[s.shotType ?? ''] ?? 'other',
    situation: SHOT_SITUATION[s.situation ?? ''] ?? 'open_play',
    outcome: shotOutcome(s.eventType, s.isBlocked, s.isOwnGoal),
    // FotMob has no explicit big-chance flag on a shot; 0.30 xG is the
    // conventional threshold. Modelled, and declared as such.
    isBigChance: (s.expectedGoals ?? 0) >= 0.3,
  }))
    .filter((s) => s.teamId !== '' && s.playerId !== '')
    // Own goals carry no meaningful xG and are attributed to the conceding
    // player, so including them would both distort xG totals and credit a
    // defender with an attacking shot. They stay in the event stream, not here.
    .filter((s) => s.outcome !== 'own_goal');
}

/**
 * Split a fixture into "counts toward the table" versus "knockout tie".
 *
 * In UEFA's Swiss model the league phase is rounds 1-8 and everything after is
 * a bracket, but they arrive in ONE fixture list. Counting the knockout ties
 * into the league table was a real bug caught by the live probe: Arsenal showed
 * 15 played and PSG 17, when every side plays exactly 8 in the league phase.
 *
 * A numeric round is a matchweek; anything else ('playoff', '1/8', 'final') is
 * knockout and carries a null matchweek, which is what keeps it out of the
 * standings engine.
 */
function classifyRound(
  f: FmMatch,
  competition: Competition,
): { matchweek: number | null; roundLabel: string } {
  const raw = f.roundName ?? f.round;
  const numeric = typeof raw === 'number' ? raw : Number(raw);

  if (Number.isFinite(numeric) && String(raw).trim() !== '') {
    const label = competition.format === 'league-phase-knockout'
      ? `League phase MD${numeric}`
      : `Matchweek ${numeric}`;
    return { matchweek: numeric, roundLabel: label };
  }

  const name = String(raw ?? '').trim();
  const pretty = name.toLowerCase() === 'playoff'
    ? 'Knockout play-off'
    : name.replace(/-/g, '-') || 'Fixture';
  return { matchweek: null, roundLabel: pretty };
}

export interface LoadOptions {
  /** Competition ids to load; defaults to the five domestic leagues. */
  competitionIds?: string[];
  /** How many days back to pull full match detail for. */
  detailWindowDays?: number;
  /** Hard ceiling on detail requests, protecting the boot path. */
  maxDetailRequests?: number;
  /** Concurrent detail requests. */
  concurrency?: number;
  /** Skip the previous-season fetch (tests, or a competition with no history). */
  skipPriors?: boolean;
}

/**
 * Load ONE competition into a snapshot. Structural data costs a single request;
 * match detail is fetched only for a recent window and anything in play.
 */
export async function loadCompetition(
  competitionId: string,
  opts: LoadOptions = {},
): Promise<DatasetSnapshot> {
  const fotmobId = FOTMOB_LEAGUES[competitionId];
  if (!fotmobId) throw new Error(`no FotMob league id for "${competitionId}"`);
  const league = await fetchLeague(fotmobId);

  // One extra request buys a sane August forecast. A failure here is not fatal:
  // the model simply shrinks toward league average instead of last season.
  let previousSeason: FmLeagueResponse | undefined;
  if (!opts.skipPriors) {
    const seasons = league.allAvailableSeasons ?? [];
    const current = league.details?.selectedSeason;
    const previous = seasons.find((s) => s !== current);
    if (previous) {
      try {
        previousSeason = await fetchLeagueSeason(fotmobId, previous);
      } catch {
        previousSeason = undefined;
      }
    }
  }

  return buildSnapshot(competitionId, league, { ...opts, previousSeason });
}

/** A specific season of a competition, for the previous-season prior. */
export async function fetchLeagueSeason(
  fotmobId: number,
  season: string,
): Promise<FmLeagueResponse> {
  return fetchJson<FmLeagueResponse>(
    `${BASE}/leagues?id=${fotmobId}&season=${encodeURIComponent(season)}`,
    { label: `fotmob leagues:${fotmobId} season:${season}` },
  );
}

/**
 * The pure-ish mapping: league payload in, snapshot out. Kept separate from
 * `loadCompetition` so the whole mapping — round classification, tiebreakers,
 * capability flags — is testable against recorded payloads with no network.
 * `fetchDetails` is injectable for the same reason.
 */
export async function buildSnapshot(
  competitionId: string,
  league: FmLeagueResponse,
  opts: LoadOptions & {
    fetchDetails?: (id: string) => Promise<FmMatchDetails>;
    previousSeason?: FmLeagueResponse;
  } = {},
): Promise<DatasetSnapshot> {
  const {
    detailWindowDays = 21,
    maxDetailRequests = 40,
    concurrency = 4,
    fetchDetails = fetchMatchDetails,
    previousSeason,
  } = opts;

  const competition = getCompetition(competitionId);
  if (!competition) throw new Error(`unknown competition "${competitionId}"`);

  const tableData = league.table?.[0]?.data;

  /**
   * Conference-split leagues put nothing in `table` and everything in `tables`
   * — one entry per conference plus a combined overall. MLS is the case:
   * Eastern and Western rank separately for the play-offs, and only the
   * Supporters' Shield is settled on the combined table. Reading only the first
   * block would give a fifteen-club league missing half the division.
   */
  const conferenceTables = (tableData?.tables ?? []).filter(
    (t) => (t.table?.all?.length ?? 0) > 0,
  );
  const isComposite = Boolean(tableData?.composite) && conferenceTables.length > 1;

  // The combined table is the widest one; the conferences are the rest.
  const overall = isComposite
    ? conferenceTables.reduce((a, b) =>
        (b.table?.all?.length ?? 0) > (a.table?.all?.length ?? 0) ? b : a)
    : undefined;
  const conferences = isComposite
    ? conferenceTables.filter((t) => t !== overall)
    : [];

  const rows = (isComposite ? overall?.table?.all : tableData?.table?.all) ?? [];
  const xgRows = (isComposite ? overall?.table?.xg : tableData?.table?.xg) ?? [];
  const fixtures = league.fixtures?.allMatches ?? [];
  const seasonLabel = league.details?.selectedSeason ?? tableData?.selectedSeason ?? 'current';

  // ── Teams ────────────────────────────────────────────────────────────────
  // The table is the authoritative roster: it is exactly the clubs in this
  // competition this season, which the fixture list alone would not tell us
  // (a fixture list can include withdrawn or placeholder sides).
  const nameById = new Map<string, string>();
  for (const r of rows) nameById.set(String(r.id), r.name);
  for (const f of fixtures) {
    nameById.set(String(f.home.id), f.home.name);
    nameById.set(String(f.away.id), f.away.name);
  }
  const rosterIds = rows.length ? rows.map((r) => String(r.id)) : [...nameById.keys()];
  const codes = assignCodes(rosterIds.map((id) => nameById.get(id) ?? id));

  const teams: Team[] = rosterIds.map((id) => {
    const name = nameById.get(id) ?? id;
    const row = rows.find((r) => String(r.id) === id);
    return {
      id,
      name,
      shortName: row?.shortName ?? name,
      code: codes.get(name) ?? 'UNK',
      country: competition.country,
      countryCode: competition.countryCode,
      crestUrl: `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`,
      primaryColor: null,
      secondaryColor: null,
      venue: null,
      manager: null,
      // Seeded flat; the ELO/ratings pass in the analytics layer replaces these
      // from actual results. A flat prior is honest at this stage — pretending
      // to know Brighton's strength before a ball is kicked would not be.
      elo: 1500,
      attackRating: 50,
      defenseRating: 50,
    };
  });
  const teamIds = new Set(teams.map((t) => t.id));

  // ── Matches ──────────────────────────────────────────────────────────────
  const seasonId = `${competitionId}-${seasonLabel.replace(/\//g, '-')}`;
  const matches: Match[] = fixtures
    // Drop fixtures involving a club outside this table (qualifiers, oddities).
    .filter((f) => teamIds.has(String(f.home.id)) && teamIds.has(String(f.away.id)))
    .map((f): Match => {
      const { status, minute } = mapStatus(f.status);
      const score = status === 'FINISHED' ? parseScore(f.status.scoreStr) : { home: null, away: null };
      const { matchweek, roundLabel } = classifyRound(f, competition);
      return {
        id: String(f.id),
        competitionId,
        seasonId,
        matchweek,
        roundLabel,
        kickoff: f.status.utcTime,
        status,
        minute,
        venueKind: 'home-away',
        venue: null,
        // Verified against matchDetails: these fields are authoritative. The
        // pageUrl slug is NOT — it reverses the sides for some fixtures.
        homeTeamId: String(f.home.id),
        awayTeamId: String(f.away.id),
        homeScore: score.home,
        awayScore: score.away,
        homeScoreHT: null,
        awayScoreHT: null,
        penalties: null,
        teamStats: {},
        events: [],
        shots: [],
      };
    });

  // ── Match detail, budgeted ───────────────────────────────────────────────
  const now = Date.now();
  const windowStart = now - detailWindowDays * 86_400_000;
  const detailTargets = matches
    .filter((m) => {
      if (m.status === 'LIVE' || m.status === 'HALFTIME') return true;
      if (m.status !== 'FINISHED') return false;
      return Date.parse(m.kickoff) >= windowStart;
    })
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .slice(0, maxDetailRequests);

  let detailFailures = 0;
  const byId = new Map(matches.map((m) => [m.id, m]));
  const fold = newFold();
  const coveredKickoffs: string[] = [];

  await mapLimit(detailTargets, concurrency, async (m) => {
    try {
      const details = await fetchDetails(m.id);
      const target = byId.get(m.id);
      if (!target) return;
      target.teamStats = {
        [target.homeTeamId]: buildTeamStats(target.homeTeamId, details, 0),
        [target.awayTeamId]: buildTeamStats(target.awayTeamId, details, 1),
      };
      target.shots = buildShots(target.id, details);
      /**
       * Momentum can carry null readings — minutes the provider has no value
       * for. A null is not a zero: plotting it would draw a spike to the
       * baseline that never happened, and passing it through failed conformance
       * and killed the whole competition over one cosmetic field. Drop them.
       */
      const momentum = (details.content?.momentum?.main?.data ?? []).filter(
        (m): m is { minute: number; value: number } =>
          typeof m?.minute === 'number' && typeof m?.value === 'number',
      );
      if (momentum.length) target.momentum = momentum;
      const info = details.content?.matchFacts?.infoBox;
      target.venue = info?.Stadium?.name ?? null;
      target.referee = info?.Referee?.text ?? null;
      target.attendance = info?.Attendance ?? null;

      // Goals, cards and substitutions. Without these a 3-0 is a scoreline with
      // nobody attached to it.
      target.events = mapEvents(
        details.content?.matchFacts?.events,
        target.id,
        target.homeTeamId,
        target.awayTeamId,
      );

      const formation = details.content?.lineup;
      if (formation) {
        target.formations = {
          home: formation.homeTeam?.formation ?? null,
          away: formation.awayTeam?.formation ?? null,
        };
      }

      const lineups = foldMatch(fold, {
        lineup: details.content?.lineup,
        playerStats: details.content?.playerStats,
        seasonId,
        competitionId,
        kickoff: target.kickoff,
        homeTeamId: target.homeTeamId,
        awayTeamId: target.awayTeamId,
        homeScore: target.homeScore,
        awayScore: target.awayScore,
      });
      if (Object.keys(lineups).length) target.lineups = lineups;
      coveredKickoffs.push(target.kickoff);
    } catch {
      // One bad fixture must never fail the whole load. It simply arrives
      // without detail, and the capability flags stay honest about coverage.
      detailFailures += 1;
    }
  });

  // ── Standings ────────────────────────────────────────────────────────────
  // Computed from results with OUR tiebreaker chain rather than trusting the
  // upstream order — that is the whole point of the per-competition rules. The
  // upstream table still contributes what we cannot derive: points deductions
  // and the season's real qualification bands.
  const deductions: Record<ID, number> = {};
  for (const r of rows) {
    if (r.deduction) deductions[String(r.id)] = r.deduction;
  }

  const effectiveCompetition: Competition = {
    ...competition,
    zones: zonesFromLegend(
      // A conference league's legend sits on the conference table, since the
      // play-off cutoff applies within a conference and not to the combined one.
      (isComposite ? conferences[0]?.legend : tableData?.legend) ?? tableData?.legend,
      competition.zones,
    ),
    ...(isComposite
      ? { conferences: conferences.map((c) => c.leagueName ?? '').filter(Boolean) }
      : {}),
  };

  /** Which conference each club belongs to, for grouped standings. */
  const conferenceOf = new Map<string, string>();
  for (const conf of conferences) {
    for (const r of conf.table?.all ?? []) {
      if (conf.leagueName) conferenceOf.set(String(r.id), conf.leagueName);
    }
  }

  // Only fixtures that belong to the table go in. For a pure league that is all
  // of them; for the Swiss model it is rounds 1-8 only, and excluding the
  // knockout ties is what keeps "played" at 8 for every club.
  const tableMatches = competition.format === 'league'
    ? matches
    : matches.filter((m) => m.matchweek !== null);

  /**
   * Standings.
   *
   * For a conference league this is a two-step, and doing it in one step is
   * wrong in a way that looks plausible. Records must be tallied across ALL
   * clubs, because an Eastern side's matches against Western sides still count
   * — computing each conference in isolation silently DROPS every
   * cross-conference fixture, which showed Nashville on 18 played and 42 points
   * when the real figures were 21 and 49.
   *
   * The RANKING is then per conference, because a play-off place is earned
   * against your own half of the league: the ninth best side in the West can
   * qualify while a club with more points misses out in the East.
   *
   * So: tally and order everyone once with the competition's own tiebreaker
   * chain, then partition. Partitioning preserves relative order, so each
   * conference is already correctly ordered and only needs renumbering.
   */
  const globalStandings = computeStandings({
    matches: tableMatches,
    teamIds: teams.map((t) => t.id),
    competition: effectiveCompetition,
    seasonId,
    deductions,
  });

  const standings: StandingRow[] = conferences.length
    ? conferences.flatMap((conf) => {
        const members = new Set((conf.table?.all ?? []).map((r) => String(r.id)));
        return globalStandings
          .filter((row) => members.has(row.teamId))
          .map((row, i) => {
            const rank = i + 1;
            const zone = zoneForRank(effectiveCompetition, rank);
            return {
              ...row,
              rank,
              groupId: conf.leagueName ?? null,
              // The zone follows the CONFERENCE rank, not the global one.
              zone: zone?.kind ?? null,
            };
          });
      })
    : globalStandings;

  // Upstream xG season totals are more complete than ours, because they cover
  // every fixture while our shot data only covers the detail window.
  const xgById = new Map(xgRows.map((r) => [String(r.id), r]));
  for (const row of standings) {
    const xg = xgById.get(row.teamId);
    if (!xg) continue;
    if (typeof xg.xg === 'number') row.xGFor = Math.round(xg.xg * 100) / 100;
    if (typeof xg.xgConceded === 'number') row.xGAgainst = Math.round(xg.xgConceded * 100) / 100;
    if (typeof xg.xPoints === 'number') row.expectedPoints = Math.round(xg.xPoints * 10) / 10;
  }

  // ── Season ───────────────────────────────────────────────────────────────
  const played = matches.filter((m) => m.status === 'FINISHED');
  const weeks = matches.map((m) => m.matchweek).filter((w): w is number => w !== null);
  const playedWeeks = played.map((m) => m.matchweek).filter((w): w is number => w !== null);
  const kickoffs = matches.map((m) => m.kickoff).sort();

  const season: Season = {
    id: seasonId,
    competitionId,
    label: seasonLabel,
    startYear: Number(seasonLabel.slice(0, 4)) || new Date().getUTCFullYear(),
    startDate: kickoffs[0] ?? new Date().toISOString(),
    endDate: kickoffs[kickoffs.length - 1] ?? new Date().toISOString(),
    numTeams: teams.length,
    totalMatchweeks: weeks.length ? Math.max(...weeks) : null,
    currentMatchweek: playedWeeks.length ? Math.max(...playedWeeks) : 0,
    isCurrent: tableData?.isCurrentSeason ?? true,
    championTeamId: null,
  };

  // ── Players ──────────────────────────────────────────────────────────────
  const players = [...fold.players.values()];
  const playerStats = finaliseFold(fold);
  coveredKickoffs.sort();
  const playedCount = matches.filter((m) => m.status === 'FINISHED').length;
  const coverage = players.length
    ? {
        matchesCovered: coveredKickoffs.length,
        matchesPlayed: playedCount,
        from: coveredKickoffs[0] ?? null,
        complete: coveredKickoffs.length >= playedCount,
      }
    : undefined;

  // ── Capabilities ─────────────────────────────────────────────────────────
  const anyShots = matches.some((m) => m.shots.length > 0);
  const anyXG = matches.some((m) =>
    Object.values(m.teamStats).some((s) => s.xG !== null),
  ) || standings.some((s) => s.xGFor !== null);

  const capabilities: DatasetCapabilities = {
    hasXG: anyXG,
    hasShotLocations: anyShots,
    hasLineups: matches.some((m) => m.lineups && Object.keys(m.lineups).length > 0),
    hasPlayerStats: playerStats.length > 0,
    hasMomentum: matches.some((m) => (m.momentum?.length ?? 0) > 0),
    hasFormations: matches.some((m) => Boolean(m.formations?.home)),
    hasManagers: false,
    hasMarketValues: players.some((p) => p.marketValueEur !== null),
    hasOdds: false,        // set by the odds layer once joined
    modeledMetrics: ['fieldTilt', 'isBigChance'],
  };

  // ── Previous-season prior ────────────────────────────────────────────────
  // Without this the model is blind in August: after one matchweek a purely
  // results-driven rating ranks whoever won 4-0 above Liverpool, because it has
  // no way to know Liverpool are Liverpool.
  let priorRatings: PriorRating[] = [];
  if (previousSeason) {
    const prevRows = previousSeason.table?.[0]?.data?.table?.all ?? [];
    const prevXg = previousSeason.table?.[0]?.data?.table?.xg ?? [];
    const xgById = new Map(prevXg.map((r) => [String(r.id), r]));
    const prevSeasonRows: PriorSeasonRow[] = prevRows.map((r) => {
      const [gf, ga] = (r.scoresStr ?? '0-0').split('-').map((v) => Number(v.trim()));
      const xg = xgById.get(String(r.id));
      return {
        teamId: String(r.id),
        played: r.played,
        goalsFor: Number.isFinite(gf) ? (gf as number) : 0,
        goalsAgainst: Number.isFinite(ga) ? (ga as number) : 0,
        xGFor: xg?.xg ?? null,
        xGAgainst: xg?.xgConceded ?? null,
      };
    });
    priorRatings = derivePriors(prevSeasonRows, teams.map((t) => t.id));
  }

  return {
    competition: effectiveCompetition,
    season,
    relatedCompetitions: [],
    memberships: teams.map((t) => ({
      teamId: t.id,
      seasonId,
      competitionId,
      groupId: conferenceOf.get(t.id) ?? null,
      entryStage: null,
    })),
    teams,
    players,
    playerStats,
    matches,
    standings,
    transfers: mapTransfers(league.transfers, teamIds),
    priorRatings,
    generatedAt: new Date().toISOString(),
    meta: {
      source: 'fotmob',
      sourceLabel: 'FotMob',
      capabilities,
      fetchedAt: new Date().toISOString(),
      degraded: detailFailures > 0,
      degradedKind: detailFailures > 0 ? ('partial-detail' as const) : undefined,
      degradedReason: detailFailures > 0
        ? `${detailFailures} of ${detailTargets.length} match-detail requests failed; those fixtures have results but no shot data`
        : undefined,
      playerStatsCoverage: coverage,
    },
  };
}
