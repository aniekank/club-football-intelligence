/**
 * Domain model for Club Football Intelligence.
 *
 * Single source of truth shared by the data layer, the analytics engine, the AI
 * layer, the API and the UI. Everything reads a `DatasetSnapshot`; nothing ever
 * touches a provider directly. Adding a feed means writing one adapter that
 * produces this shape — see src/data/provider.ts.
 *
 * ── What changed coming from the tournament chassis ────────────────────────
 * A World Cup is one competition, 48 fixed squads, four weeks, groups then a
 * bracket, on quasi-neutral pitches. Club football breaks every one of those
 * assumptions, and the breaks are load-bearing rather than cosmetic:
 *
 *   • MANY COMPETITIONS AT ONCE. A club plays its league, a domestic cup and a
 *     continental competition in the same week, so `teamId` is no longer scoped
 *     to one competition and a team page spans several. Entities are keyed
 *     globally and `CompetitionMembership` joins them.
 *   • ROUND-ROBIN, NOT GROUPS. Standings need per-competition tiebreakers that
 *     genuinely differ (La Liga settles level teams on head-to-head; the
 *     Premier League does not), plus promotion, relegation and continental
 *     qualification cutoffs. Modelled as data, not branching code.
 *   • SQUADS MUTATE. Transfer windows move players mid-season, so a player's
 *     club is an interval, not a field.
 *   • HOME ADVANTAGE IS REAL. Kept explicit on every fixture rather than
 *     inferred from a host-nation list.
 */

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────

export type ID = string;
export type ISODate = string;

export type Position = 'GK' | 'DF' | 'MF' | 'FW';

export type DetailedPosition =
  | 'GK' | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB'
  | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'CF' | 'ST';

export type Foot = 'left' | 'right' | 'both';

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';

export type MatchResultLetter = 'W' | 'D' | 'L';

export type EventType =
  | 'GOAL' | 'OWN_GOAL' | 'PENALTY_GOAL' | 'PENALTY_MISS' | 'ASSIST'
  | 'YELLOW_CARD' | 'SECOND_YELLOW' | 'RED_CARD' | 'SUBSTITUTION' | 'VAR';

export type ShotBodyPart = 'left_foot' | 'right_foot' | 'head' | 'other';

export type ShotOutcome =
  | 'goal' | 'saved' | 'blocked' | 'off_target' | 'post'
  | 'own_goal' | 'penalty_goal' | 'penalty_missed';

export type ShotSituation =
  | 'open_play' | 'fast_break' | 'set_piece' | 'corner'
  | 'free_kick' | 'penalty' | 'direct_free_kick';

// ─────────────────────────────────────────────────────────────
// Competitions & seasons
// ─────────────────────────────────────────────────────────────

/**
 * How a competition is decided. This drives which standings engine runs, which
 * surfaces appear, and how the Monte Carlo walks the remaining fixtures.
 *
 * `league-phase-knockout` is the post-2024 UEFA format: one 36-team table where
 * everybody plays eight DIFFERENT opponents, top 8 seeded straight through, 9th
 * to 24th into a play-off round. It is neither a group stage nor a pure league,
 * which is exactly why it needs its own format rather than a boolean.
 */
export type CompetitionFormat =
  | 'league'                   // double round-robin: the European domestic leagues
  | 'knockout'                 // pure bracket: domestic cups
  | 'group-knockout'           // classic groups feeding a bracket
  | 'league-phase-knockout'    // UEFA's Swiss-model league phase + bracket
  // A regular season that SEEDS a play-off, where the table crowns nobody:
  // MLS (conference-split, then the Cup) and Liga MX (a short Apertura or
  // Clausura, then the Liguilla). Distinct from the Swiss model because the
  // regular season is a genuine round-robin and the play-off decides the title
  // outright — finishing top wins you a trophy in Europe and a home tie here.
  | 'regular-season-playoff';

export type CompetitionTier = 'domestic-league' | 'domestic-cup' | 'continental' | 'super-cup';

/**
 * An ordered tiebreaker chain. Real competitions genuinely disagree here and
 * getting it wrong silently reorders a table, so it is DATA on the competition
 * rather than a hard-coded comparator.
 *
 *   'points'          total points
 *   'goal-difference' GF − GA across the whole competition
 *   'goals-for'       total scored
 *   'head-to-head'    a mini-table of only the tied teams' meetings, resolved
 *                     by the chain in `headToHeadChain`
 *   'away-goals'      total scored away from home
 *   'wins'            total wins
 *   'away-wins'       wins away from home
 *   'disciplinary'    fewest disciplinary points
 *   'drawn-lots'      genuinely random — surfaced as "level, unresolved"
 */
export type TiebreakerCriterion =
  | 'points'
  | 'goal-difference'
  | 'goals-for'
  | 'head-to-head'
  | 'away-goals'
  | 'wins'
  | 'away-wins'
  | 'disciplinary'
  | 'drawn-lots';

/**
 * What a finishing position earns. Rendered as the coloured rail on the league
 * table and always paired with a text label — the band colour never carries the
 * meaning alone.
 */
export type ZoneKind =
  | 'champion'
  | 'ucl-league-phase'
  | 'ucl-qualifying'
  | 'uel-league-phase'
  | 'uel-qualifying'
  | 'conference-qualifying'
  | 'promotion'
  | 'promotion-playoff'
  | 'relegation-playoff'
  | 'relegation'
  // League-phase specific: straight through to the R16 vs into the play-off
  | 'knockout-direct'
  | 'knockout-playoff'
  | 'eliminated';

/** A contiguous band of finishing positions and what it earns. 1-indexed, inclusive. */
export interface Zone {
  kind: ZoneKind;
  fromRank: number;
  toRank: number;
  label: string;      // "Champions League league phase"
  shortLabel: string; // "UCL"
}

export interface Competition {
  id: ID;                       // 'epl', 'ucl', 'laliga'
  name: string;                 // 'Premier League'
  shortName: string;            // 'EPL'
  format: CompetitionFormat;
  tier: CompetitionTier;
  country: string;              // 'England', or 'Europe' for continental
  countryCode: string;          // 'ENG' / 'INT'
  /** Accent token suffix — resolves to --comp-{accentKey} in tokens.css. */
  accentKey: string;
  /**
   * Ordered tiebreakers, most significant first. Always starts with 'points'.
   * When 'head-to-head' appears, `headToHeadChain` resolves the mini-table.
   */
  tiebreakers: TiebreakerCriterion[];
  /** How a head-to-head mini-table is itself resolved. */
  headToHeadChain?: TiebreakerCriterion[];
  /** Finishing-position bands. Empty for pure knockout competitions. */
  zones: Zone[];
  /** Points for a win — 3 in the modern era, 2 in archived historical seasons. */
  pointsForWin: number;
  pointsForDraw: number;
  /**
   * Conference or division names, when the league is split.
   *
   * MLS ranks Eastern and Western separately and only settles the Supporters'
   * Shield on a combined table. A single ranking would be simply wrong: the
   * ninth-best team in the West can miss the play-offs while the ninth-best in
   * the East makes them.
   */
  conferences?: string[];
  /**
   * True when finishing top of the table is NOT winning the competition.
   * The UI must not call a regular-season leader "champions".
   */
  titleDecidedByPlayoff?: boolean;
}

export interface Season {
  id: ID;                 // 'epl-2026-27'
  competitionId: ID;
  /** Display label: '2026/27', or '2026' for calendar-year leagues (MLS, Brazil). */
  label: string;
  startYear: number;
  startDate: ISODate;
  endDate: ISODate;
  numTeams: number;
  /** Total scheduled matchweeks, when the format has them. */
  totalMatchweeks: number | null;
  currentMatchweek: number | null;
  isCurrent: boolean;
  /** Set once decided — drives the retrospective/complete state. */
  championTeamId: ID | null;
}

/**
 * A team's participation in one competition's season. This is the join that
 * replaces the World Cup's single `groupId` on the team: Arsenal have one of
 * these for the Premier League and another for the Champions League, and the
 * team page fuses them.
 */
export interface CompetitionMembership {
  teamId: ID;
  seasonId: ID;
  competitionId: ID;
  /** Group letter for group-stage formats; null for leagues and league phases. */
  groupId: ID | null;
  /** Where they came in from, for cups: 'league-phase', 'q3', 'first-round'. */
  entryStage: string | null;
}

// ─────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────

export interface Manager {
  name: string;
  /** Appointed date, when known — powers "N games into the job" narratives. */
  appointedAt: ISODate | null;
  nationality?: string;
}

export interface Team {
  id: ID;
  name: string;        // 'Manchester City'
  shortName: string;   // 'Man City'
  code: string;        // 'MCI' — 3 letters, for dense table columns
  country: string;
  countryCode: string;
  /**
   * Crest URL from the upstream media CDN. Rendered through a plain <img> with
   * explicit dimensions (the Image Optimizer is deliberately disabled — see
   * next.config.mjs), and always with a text fallback, because a crest is a
   * licensed asset that may not resolve.
   */
  crestUrl: string | null;
  /** Primary club colour, used sparingly: never as a data-series colour, since
   *  two clubs in one chart would collide and neither would be CVD-validated. */
  primaryColor: string | null;
  secondaryColor: string | null;
  venue: string | null;
  manager: Manager | null;
  /** Live rating, maintained by the engine across ALL competitions at once —
   *  this shared rating space is what makes cross-league comparison possible. */
  elo: number;
  /** Latent Poisson rate parameters, 0..100. */
  attackRating: number;
  defenseRating: number;
}

// ─────────────────────────────────────────────────────────────
// Players — with mutable club affiliation
// ─────────────────────────────────────────────────────────────

/**
 * A player's spell at a club, as an interval. Transfer windows make this the
 * honest model: "who played for Chelsea in October" and "who plays for Chelsea
 * now" are different questions, and aggregating a season's stats against a
 * single current-club field silently misattributes half of January's business.
 */
export interface Affiliation {
  teamId: ID;
  from: ISODate;
  /** null = current. */
  to: ISODate | null;
  /** Distinguishes a loan from a permanent move in the UI. */
  onLoan: boolean;
}

export interface Player {
  id: ID;
  name: string;      // the form they are commonly known by
  fullName?: string;
  /** Current club. Convenience accessor — `affiliations` is authoritative. */
  teamId: ID;
  affiliations: Affiliation[];
  shirtNumber: number | null;
  position: Position;
  detailedPosition: DetailedPosition;
  age: number | null;
  birthDate: ISODate | null;
  nationality: string | null;
  photoUrl: string | null;
  heightCm: number | null;
  foot: Foot | null;
  marketValueEur: number | null; // millions
}

/**
 * Accumulated stats. Always scoped to a (player, season, competition) triple —
 * a striker's league record and their European record are different numbers and
 * conflating them is the classic club-football reporting bug.
 */
export interface PlayerStats {
  playerId: ID;
  seasonId: ID;
  competitionId: ID;
  minutes: number;
  appearances: number;
  starts: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  shots: number;
  shotsOnTarget: number;
  bigChancesCreated: number;
  bigChancesMissed: number;
  passes: number;
  passesCompleted: number;
  keyPasses: number;
  passesFinalThird: number;
  progressiveCarries: number;
  tackles: number;
  tacklesWon: number;
  interceptions: number;
  clearances: number;
  ballRecoveries: number;
  duelsWon: number;
  duelsTotal: number;
  aerialsWon: number;
  touches: number;
  touchesInBox: number;
  dribblesCompleted: number;
  dribblesAttempted: number;
  dispossessed: number;
  yellowCards: number;
  redCards: number;
  foulsCommitted: number;
  foulsWon: number;
  // GK-only
  saves: number;
  goalsConceded: number;
  cleanSheets: number;
  /** Provider match rating, averaged. Null when the source has none. */
  averageRating: number | null;
}

// ─────────────────────────────────────────────────────────────
// Matches
// ─────────────────────────────────────────────────────────────

/** Which side, if any, is genuinely at home. Club football: almost always one. */
export type VenueKind = 'home-away' | 'neutral';

export interface Match {
  id: ID;
  competitionId: ID;
  seasonId: ID;
  /** Matchweek for league formats; null for cup rounds. */
  matchweek: number | null;
  /** Human round label: 'Matchweek 3', 'Quarter-final', 'League phase MD1'. */
  roundLabel: string;
  kickoff: ISODate;
  status: MatchStatus;
  minute: number;
  /** Live sub-phase the provider collapses into LIVE. */
  livePhase?: 'ET' | 'PEN' | 'BREAK';
  venueKind: VenueKind;
  venue: string | null;
  homeTeamId: ID;
  awayTeamId: ID;
  /** Null until played — never 0, so "0-0 draw" and "not played" stay distinct.
   *  Conflating them is how a fixture list becomes a wall of fake goalless
   *  draws, and how season aggregates quietly gain phantom clean sheets. */
  homeScore: number | null;
  awayScore: number | null;
  homeScoreHT: number | null;
  awayScoreHT: number | null;
  penalties: { home: number; away: number } | null;
  /** Two-legged ties: the aggregate partner, for cup rounds. */
  aggregateMatchId?: ID;
  teamStats: Record<ID, MatchTeamStats>;
  events: MatchEvent[];
  shots: Shot[];
  lineups?: Record<ID, LineupSlot[]>;
  formations?: { home: string | null; away: string | null };
  referee?: string | null;
  attendance?: number | null;
  /** Per-minute pressure index, -100..100 (home positive). Drives the momentum
   *  chart; present only when the source supplies it. */
  momentum?: { minute: number; value: number }[];
}

export interface LineupSlot {
  playerId: ID;
  name: string;
  position: Position;
  shirtNumber: number | null;
  isStarter: boolean;
  minutesPlayed: number | null;
  rating: number | null;
}

export interface MatchTeamStats {
  teamId: ID;
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  /** Null, never 0, when the source has no xG — the whole degradation story
   *  depends on being able to tell "no data" from "genuinely zero". */
  xG: number | null;
  xGOnTarget: number | null;
  corners: number | null;
  fouls: number | null;
  offsides: number | null;
  passes: number | null;
  passAccuracy: number | null;
  bigChances: number | null;
  saves: number | null;
  yellowCards: number | null;
  redCards: number | null;
  /** Share of final-third touches, 0..100. */
  fieldTilt: number | null;
  /** Passes allowed per defensive action — press intensity. Lower = more intense. */
  ppda: number | null;
}

export interface MatchEvent {
  id: ID;
  matchId: ID;
  minute: number;
  addedTime: number;
  type: EventType;
  teamId: ID;
  playerId: ID | null;
  relatedPlayerId: ID | null;
  detail: string;
}

export interface Shot {
  id: ID;
  matchId: ID;
  minute: number;
  teamId: ID;
  playerId: ID;
  /** Attacking-direction normalised coordinates, 0..100.
   *  x: own goal 0 → opposition goal 100. y: left touchline 0 → right 100. */
  x: number;
  y: number;
  xG: number;
  xGOnTarget: number | null;
  bodyPart: ShotBodyPart;
  situation: ShotSituation;
  outcome: ShotOutcome;
  isBigChance: boolean;
}

// ─────────────────────────────────────────────────────────────
// Standings
// ─────────────────────────────────────────────────────────────

export interface StandingRow {
  seasonId: ID;
  competitionId: ID;
  teamId: ID;
  groupId: ID | null;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Home/away splits — the single most-requested league-table cut. */
  homeRecord: SplitRecord;
  awayRecord: SplitRecord;
  /** Most recent LAST, so the form string reads left-to-right chronologically. */
  form: MatchResultLetter[];
  /** Season xG totals. Null when the source lacks xG for this competition. */
  xGFor: number | null;
  xGAgainst: number | null;
  /** Points a team "should" have on xG — the overperformance narrative. */
  expectedPoints: number | null;
  disciplinaryPoints: number;
  /** Which band this rank currently falls in. */
  zone: ZoneKind | null;
  /** Monte Carlo outputs, 0..1. Null before the engine has run. */
  titleProbability: number | null;
  top4Probability: number | null;
  relegationProbability: number | null;
  /**
   * Set when the row's position against a NEIGHBOUR was decided by something
   * other than points — so the table can footnote "level on points, ahead on
   * head-to-head" instead of looking arbitrary.
   */
  tiebreakerNote: string | null;
}

export interface SplitRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

// ─────────────────────────────────────────────────────────────
// Model outputs
// ─────────────────────────────────────────────────────────────

export interface MatchPrediction {
  matchId: ID;
  homeWin: number;
  draw: number;
  awayWin: number;
  scoreline: { home: number; away: number; prob: number }[];
  expectedGoals: { home: number; away: number };
  homeCleanSheet: number;
  awayCleanSheet: number;
  bttsProb: number;
  over25Prob: number;
  /** Fair Asian handicap line implied by the model. */
  fairHandicap: number;
}

/** Season-long Monte Carlo output — the club-football replacement for the
 *  World Cup's "reach the quarter-final" ladder. */
export interface SeasonForecast {
  teamId: ID;
  seasonId: ID;
  competitionId: ID;
  winTitle: number;
  top4: number;
  europeanQualification: number;
  relegation: number;
  /** Full projected-points distribution, for the fan chart. */
  projectedPoints: { mean: number; p10: number; p25: number; p50: number; p75: number; p90: number };
  projectedRank: { mean: number; p10: number; p90: number };
  /** Current − start-of-season, so the UI can show the swing. */
  titleProbabilityDelta: number;
  powerRating: number;
  powerRank: number;
}

// ─────────────────────────────────────────────────────────────
// Transfers
// ─────────────────────────────────────────────────────────────

/**
 * A completed transfer.
 *
 * This is the record the domain was designed around from the start and never
 * had data for: `Player.affiliations` is an INTERVAL list precisely because a
 * squad is not a fixed set, and a transfer is what opens and closes those
 * intervals.
 *
 * `fee` is null for a loan, a free, or an undisclosed deal — three different
 * situations that share one display, so `kind` keeps them distinguishable. A
 * missing fee must never render as €0.
 */
export type TransferKind = 'permanent' | 'loan' | 'free' | 'undisclosed';

export interface Transfer {
  id: ID;
  playerId: ID;
  playerName: string;
  position: string | null;
  /** Null when the club is outside the loaded competitions. */
  fromTeamId: ID | null;
  fromTeamName: string;
  toTeamId: ID | null;
  toTeamName: string;
  date: ISODate;
  kind: TransferKind;
  /** Euros. Null for loans, frees and undisclosed deals — never 0. */
  feeEur: number | null;
  /** The player's estimated market value at the time, in euros. */
  marketValueEur: number | null;
}

// ─────────────────────────────────────────────────────────────
// Narrative layer
// ─────────────────────────────────────────────────────────────

/**
 * The kinds of story a LEAGUE tells.
 *
 * Deliberately different from the tournament set. A cup's stories are about
 * survival — who goes through, who goes home. A league's are about accumulation
 * and position: a title race measured in points and games left, a relegation
 * fight measured in the gap to safety, a side outrunning its expected goals and
 * the regression that implies.
 */
export type InsightKind =
  | 'prediction'      // where the season is heading
  | 'milestone'       // something settled — a title won, a relegation confirmed
  | 'overperformer'   // ahead of the underlying numbers
  | 'underperformer'  // behind them
  | 'form'            // a run worth naming
  | 'breakout'        // a club or player exceeding their station
  | 'wall'            // a fight to avoid something
  | 'tactical';

export interface Insight {
  id: ID;
  kind: InsightKind;
  severity: 'low' | 'medium' | 'high';
  title: string;
  body: string;
  entityType: 'team' | 'player' | 'match' | 'competition';
  entityId: ID | null;
  /** The arithmetic behind the claim, so a reader can check it in place. */
  metrics: { label: string; value: string }[];
  createdAt: ISODate;
}

// ─────────────────────────────────────────────────────────────
// Capability flags & the snapshot
// ─────────────────────────────────────────────────────────────

/**
 * What the active source can actually do. The UI reads THESE, never a hardcoded
 * assumption, and hides what is missing rather than rendering a zero.
 *
 * This exists because the parent product shipped advanced-metric UI against a
 * feed with no xG and spent weeks chasing "why does it show 0" bugs. A missing
 * metric must be invisible; a modelled one must be labelled "(est.)"; neither
 * may ever be presented as a measured zero or a 0th percentile.
 */
export interface DatasetCapabilities {
  hasXG: boolean;
  hasShotLocations: boolean;
  hasLineups: boolean;
  hasPlayerStats: boolean;
  hasMomentum: boolean;
  hasFormations: boolean;
  hasManagers: boolean;
  hasMarketValues: boolean;
  hasOdds: boolean;
  /** Stat keys that are MODELLED rather than measured — surfaced as "(est.)". */
  modeledMetrics: string[];
}

/**
 * How much of the season the per-player numbers actually cover.
 *
 * Match detail is fetched for a recent window, not the whole season, so player
 * aggregates are a PARTIAL total. Presenting them as season figures would be a
 * quiet lie of exactly the kind this product exists not to tell — a striker
 * shown on "3 goals" when they have nine is worse than showing nothing. The UI
 * reads this and labels the scope.
 */
export interface StatsCoverage {
  /** Matches whose detail was actually ingested. */
  matchesCovered: number;
  /** Matches played in the competition so far. */
  matchesPlayed: number;
  /** Earliest covered kickoff, for the "since" label. */
  from: ISODate | null;
  /** True only when every played match has been ingested. */
  complete: boolean;
}

export interface DatasetMeta {
  source: string;
  sourceLabel: string;
  capabilities: DatasetCapabilities;
  fetchedAt: ISODate;
  /**
   * True when the snapshot is not everything it should be.
   *
   * `degradedKind` matters because two very different things were sharing this
   * flag: serving a CACHED snapshot after the source failed, and simply not
   * fetching detail for every match. The first is stale data; the second is
   * normal operation on a league with 300 played matches and a capped detail
   * window. Calling both "stale" alarmed a reader about the wrong thing.
   */
  degraded: boolean;
  degradedKind?: 'stale-cache' | 'partial-detail';
  degradedReason?: string;
  /** Scope of the per-player aggregates. Absent when there are none. */
  playerStatsCoverage?: StatsCoverage;
}

/**
 * Everything the app reads, for ONE active edition (a competition-season, or a
 * bundle of them). Swapping editions swaps this object wholesale; indexes are
 * keyed to its identity so every module self-heals on the swap.
 */
/**
 * Previous-season strength, as ratios to that season's league average
 * (1.0 = exactly average; attack above 1 means outscoring the league, defence
 * above 1 means CONCEDING more than the league).
 *
 * This is what stops the model being blind in August. A purely results-driven
 * rating after one matchweek ranks whoever won 4-0 above Liverpool, because it
 * has no way to know Liverpool are Liverpool. The prior is what the shrinkage
 * pulls toward, so an early-season forecast starts from last season's evidence
 * and migrates to this season's as the fixtures accumulate.
 */
export interface PriorRating {
  teamId: ID;
  attackRatio: number;
  defenseRatio: number;
  /** True when the club has no previous top-flight season — a promoted side
   *  gets a below-average prior rather than being treated as average. */
  promoted: boolean;
}

export interface DatasetSnapshot {
  /** The edition being viewed. */
  competition: Competition;
  season: Season;
  /** Other competitions the same teams are live in — powers the team page's
   *  multi-competition view and the "also playing in" switcher. */
  relatedCompetitions: Competition[];
  memberships: CompetitionMembership[];
  teams: Team[];
  players: Player[];
  playerStats: PlayerStats[];
  matches: Match[];
  standings: StandingRow[];
  /** Recent completed transfers involving these clubs. */
  transfers: Transfer[];
  /** Empty when no previous season was available (a new competition, or the
   *  fetch failed) — the model then shrinks toward league average instead. */
  priorRatings: PriorRating[];
  generatedAt: ISODate;
  meta: DatasetMeta;
}
