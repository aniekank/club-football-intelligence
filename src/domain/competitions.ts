import type { TiebreakerCriterion, Competition, Zone } from './types';

/**
 * The competition registry.
 *
 * Tiebreakers and qualification bands live HERE, as data, because they genuinely
 * differ between leagues and a wrong chain silently reorders a table — the kind
 * of bug nobody files because the page still looks plausible.
 *
 * The headline divergence: when two sides finish level on points, La Liga and
 * Serie A look FIRST at the matches between them, while the Premier League,
 * Bundesliga and Ligue 1 look first at overall goal difference. Same league
 * table, same numbers, different champion. Bundesliga does eventually consult
 * head-to-head, but only after goal difference and goals scored.
 *
 * ── Caveat on the zones ────────────────────────────────────────────────────
 * European qualification bands are NOT fixed constants. They move with UEFA
 * coefficients (the two "European Performance Spots" hand a 5th Champions League
 * place to the two best-performing associations each season) and with domestic
 * cup winners (a cup winner already qualified for Europe pushes their Europa
 * place down the league table). The values below are the standard allocation
 * for the current cycle; they are data precisely so a correction is an edit, not
 * a refactor. `zonesAreProvisional` marks the ones that shift, so the UI can
 * footnote the table rather than assert something it cannot know.
 */

const RELEGATION_3_OF_20: Zone[] = [
  { kind: 'relegation', fromRank: 18, toRank: 20, label: 'Relegation', shortLabel: 'REL' },
];

/** Premier League — no head-to-head at any depth; a play-off decides a title or
 *  relegation still level after goals scored. */
export const PREMIER_LEAGUE: Competition = {
  id: 'epl',
  name: 'Premier League',
  shortName: 'EPL',
  format: 'league',
  tier: 'domestic-league',
  country: 'England',
  countryCode: 'ENG',
  accentKey: 'epl',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  zones: [
    { kind: 'champion', fromRank: 1, toRank: 1, label: 'Champions', shortLabel: 'W' },
    { kind: 'ucl-league-phase', fromRank: 1, toRank: 4, label: 'Champions League league phase', shortLabel: 'UCL' },
    { kind: 'uel-league-phase', fromRank: 5, toRank: 5, label: 'Europa League league phase', shortLabel: 'UEL' },
    { kind: 'conference-qualifying', fromRank: 6, toRank: 6, label: 'Conference League qualifying', shortLabel: 'UECL' },
    ...RELEGATION_3_OF_20,
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
};

/** La Liga — head-to-head FIRST, and only once the tied sides have met twice. */
export const LA_LIGA: Competition = {
  id: 'laliga',
  name: 'LaLiga',
  shortName: 'LAL',
  format: 'league',
  tier: 'domestic-league',
  country: 'Spain',
  countryCode: 'ESP',
  accentKey: 'laliga',
  tiebreakers: ['points', 'head-to-head', 'goal-difference', 'goals-for'],
  headToHeadChain: ['points', 'goal-difference', 'goals-for'],
  zones: [
    { kind: 'champion', fromRank: 1, toRank: 1, label: 'Campeón', shortLabel: 'W' },
    { kind: 'ucl-league-phase', fromRank: 1, toRank: 4, label: 'Champions League league phase', shortLabel: 'UCL' },
    { kind: 'uel-league-phase', fromRank: 5, toRank: 6, label: 'Europa League league phase', shortLabel: 'UEL' },
    { kind: 'conference-qualifying', fromRank: 7, toRank: 7, label: 'Conference League qualifying', shortLabel: 'UECL' },
    ...RELEGATION_3_OF_20,
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
};

/** Serie A — head-to-head first, like Spain. */
export const SERIE_A: Competition = {
  id: 'seriea',
  name: 'Serie A',
  shortName: 'SEA',
  format: 'league',
  tier: 'domestic-league',
  country: 'Italy',
  countryCode: 'ITA',
  accentKey: 'seriea',
  tiebreakers: ['points', 'head-to-head', 'goal-difference', 'goals-for'],
  headToHeadChain: ['points', 'goal-difference', 'goals-for'],
  zones: [
    { kind: 'champion', fromRank: 1, toRank: 1, label: 'Campione', shortLabel: 'W' },
    { kind: 'ucl-league-phase', fromRank: 1, toRank: 4, label: 'Champions League league phase', shortLabel: 'UCL' },
    { kind: 'uel-league-phase', fromRank: 5, toRank: 6, label: 'Europa League league phase', shortLabel: 'UEL' },
    { kind: 'conference-qualifying', fromRank: 7, toRank: 7, label: 'Conference League qualifying', shortLabel: 'UECL' },
    ...RELEGATION_3_OF_20,
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
};

/** Bundesliga — 18 teams, goal difference before head-to-head, and a two-legged
 *  relegation play-off between 16th and the 2. Bundesliga's 3rd. */
export const BUNDESLIGA: Competition = {
  id: 'bundesliga',
  name: 'Bundesliga',
  shortName: 'BUN',
  format: 'league',
  tier: 'domestic-league',
  country: 'Germany',
  countryCode: 'GER',
  accentKey: 'bundesliga',
  tiebreakers: ['points', 'goal-difference', 'goals-for', 'head-to-head', 'away-goals'],
  headToHeadChain: ['points', 'goal-difference', 'away-goals'],
  zones: [
    { kind: 'champion', fromRank: 1, toRank: 1, label: 'Meister', shortLabel: 'W' },
    { kind: 'ucl-league-phase', fromRank: 1, toRank: 4, label: 'Champions League league phase', shortLabel: 'UCL' },
    { kind: 'uel-league-phase', fromRank: 5, toRank: 6, label: 'Europa League league phase', shortLabel: 'UEL' },
    { kind: 'conference-qualifying', fromRank: 7, toRank: 7, label: 'Conference League qualifying', shortLabel: 'UECL' },
    { kind: 'relegation-playoff', fromRank: 16, toRank: 16, label: 'Relegation play-off', shortLabel: 'PO' },
    { kind: 'relegation', fromRank: 17, toRank: 18, label: 'Relegation', shortLabel: 'REL' },
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
};

/** Ligue 1 — 18 teams since 2023/24, with a relegation play-off at 16th. */
export const LIGUE_1: Competition = {
  id: 'ligue1',
  name: 'Ligue 1',
  shortName: 'L1',
  format: 'league',
  tier: 'domestic-league',
  country: 'France',
  countryCode: 'FRA',
  accentKey: 'ligue1',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  zones: [
    { kind: 'champion', fromRank: 1, toRank: 1, label: 'Champion', shortLabel: 'W' },
    { kind: 'ucl-league-phase', fromRank: 1, toRank: 3, label: 'Champions League league phase', shortLabel: 'UCL' },
    { kind: 'ucl-qualifying', fromRank: 4, toRank: 4, label: 'Champions League qualifying', shortLabel: 'UCLQ' },
    { kind: 'uel-league-phase', fromRank: 5, toRank: 5, label: 'Europa League league phase', shortLabel: 'UEL' },
    { kind: 'conference-qualifying', fromRank: 6, toRank: 6, label: 'Conference League qualifying', shortLabel: 'UECL' },
    { kind: 'relegation-playoff', fromRank: 16, toRank: 16, label: 'Relegation play-off', shortLabel: 'PO' },
    { kind: 'relegation', fromRank: 17, toRank: 18, label: 'Relegation', shortLabel: 'REL' },
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
};

/**
 * Champions League, post-2024 Swiss model.
 *
 * One 36-team table in which every club plays EIGHT DIFFERENT opponents. That
 * asymmetry is why head-to-head is absent from the chain: two level teams have
 * usually never met, so there is nothing to compare. UEFA instead reaches for
 * away goals, then wins, then away wins, then discipline.
 */
export const CHAMPIONS_LEAGUE: Competition = {
  id: 'ucl',
  name: 'Champions League',
  shortName: 'UCL',
  format: 'league-phase-knockout',
  tier: 'continental',
  country: 'Europe',
  countryCode: 'INT',
  accentKey: 'ucl',
  tiebreakers: [
    'points',
    'goal-difference',
    'goals-for',
    'away-goals',
    'wins',
    'away-wins',
    'disciplinary',
  ],
  zones: [
    { kind: 'knockout-direct', fromRank: 1, toRank: 8, label: 'Round of 16', shortLabel: 'R16' },
    { kind: 'knockout-playoff', fromRank: 9, toRank: 24, label: 'Knockout play-off', shortLabel: 'PO' },
    { kind: 'eliminated', fromRank: 25, toRank: 36, label: 'Eliminated', shortLabel: 'OUT' },
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
};

/** Europa League — same Swiss model, same chain, same bands. */
export const EUROPA_LEAGUE: Competition = {
  ...CHAMPIONS_LEAGUE,
  id: 'uel',
  name: 'Europa League',
  shortName: 'UEL',
  accentKey: 'uel',
};

/**
 * Conference League — the third tier of the same Swiss model.
 *
 * Structurally identical to the Champions League: one 36-club league phase,
 * eight matches each, top eight straight to the last 16 and 9th–24th into a
 * play-off. Sharing the definition is right here, and would be wrong for the
 * competitions below — see Copa Libertadores.
 */
export const CONFERENCE_LEAGUE: Competition = {
  ...CHAMPIONS_LEAGUE,
  id: 'uecl',
  name: 'Conference League',
  shortName: 'UECL',
  accentKey: 'uecl',
};

/**
 * FIFA Club World Cup — eight groups of four, then a bracket.
 *
 * The OLD format, and the tiebreakers with it: FIFA resolves a level group on
 * goal difference before head-to-head, the opposite of the Champions League's
 * Swiss chain. Copying UCL's tiebreakers here would silently reorder groups.
 */
export const CLUB_WORLD_CUP: Competition = {
  id: 'cwc',
  name: 'FIFA Club World Cup',
  shortName: 'CWC',
  format: 'group-knockout',
  tier: 'continental',
  country: 'World',
  countryCode: 'INT',
  accentKey: 'cwc',
  tiebreakers: ['points', 'goal-difference', 'goals-for', 'head-to-head', 'disciplinary'],
  headToHeadChain: ['points', 'goal-difference', 'goals-for'],
  zones: [
    { kind: 'knockout-direct', fromRank: 1, toRank: 2, label: 'Round of 16', shortLabel: 'R16' },
    { kind: 'eliminated', fromRank: 3, toRank: 4, label: 'Eliminated', shortLabel: 'OUT' },
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
};

/**
 * Copa Libertadores — CONMEBOL's eight groups of four.
 *
 * CONMEBOL puts goal difference ahead of head-to-head too, and adds goals
 * scored AWAY as a live criterion in the group stage, which UEFA dropped.
 */
export const LIBERTADORES: Competition = {
  ...CLUB_WORLD_CUP,
  id: 'libertadores',
  name: 'Copa Libertadores',
  shortName: 'LIB',
  country: 'South America',
  accentKey: 'libertadores',
  tiebreakers: ['points', 'goal-difference', 'goals-for', 'away-goals', 'disciplinary'],
  headToHeadChain: undefined,
};

/**
 * CONCACAF Champions Cup — a pure bracket.
 *
 * No group stage at all, so no table: `zones` is empty and the standings page
 * degrades to "no table for this format" rather than inventing a ranking. The
 * fixtures and the model still work, which is the whole point of keeping format
 * as data rather than as an assumption.
 */
export const CONCACAF_CHAMPIONS_CUP: Competition = {
  id: 'concacaf',
  name: 'CONCACAF Champions Cup',
  shortName: 'CCC',
  format: 'knockout',
  tier: 'continental',
  country: 'North America',
  countryCode: 'INT',
  accentKey: 'concacaf',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  zones: [],
  pointsForWin: 3,
  pointsForDraw: 1,
};

/**
 * AFC Champions League Elite — a league phase split West and East.
 *
 * The clubs never cross regions in the league phase, so this is the MLS problem
 * again in different clothing: rank WITHIN a region, and never merge the two
 * into one ranking. `conferences` is what drives that, and the machinery is
 * already there.
 */
export const AFC_CHAMPIONS_ELITE: Competition = {
  ...CHAMPIONS_LEAGUE,
  id: 'afc',
  name: 'AFC Champions League Elite',
  shortName: 'AFC',
  country: 'Asia',
  accentKey: 'afc',
  conferences: ['West', 'East'],
  zones: [
    { kind: 'knockout-direct', fromRank: 1, toRank: 8, label: 'Round of 16', shortLabel: 'R16' },
    { kind: 'eliminated', fromRank: 9, toRank: 16, label: 'Eliminated', shortLabel: 'OUT' },
  ],
};

/**
 * Major League Soccer.
 *
 * Two things make this genuinely different from every European league here, and
 * both are the kind of difference that silently produces a wrong table.
 *
 * FIRST, MLS ranks on WINS before goal difference. Two clubs level on points are
 * separated by who won more often, not by who scored more — the opposite
 * emphasis to England, and it regularly changes who finishes above whom.
 *
 * SECOND, the conferences are the competition. Eastern and Western are ranked
 * separately for the play-offs; the combined table settles only the Supporters'
 * Shield. A single ranking would let the ninth-best side in the West miss out
 * while the ninth-best in the East goes through.
 *
 * And finishing top wins the Shield, not MLS Cup — the title is decided by a
 * play-off, so nothing here may call the leader "champions".
 */
export const MLS: Competition = {
  id: 'mls',
  name: 'Major League Soccer',
  shortName: 'MLS',
  format: 'regular-season-playoff',
  tier: 'domestic-league',
  country: 'United States',
  countryCode: 'USA',
  accentKey: 'mls',
  tiebreakers: ['points', 'wins', 'goal-difference', 'goals-for', 'disciplinary', 'away-goals'],
  zones: [
    { kind: 'knockout-direct', fromRank: 1, toRank: 9, label: 'MLS Cup play-offs', shortLabel: 'PO' },
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
  conferences: ['Eastern', 'Western'],
  titleDecidedByPlayoff: true,
};

/**
 * Liga MX.
 *
 * A short season played twice a year — Apertura then Clausura — each a single
 * round-robin of seventeen matchweeks, each with its own champion decided by
 * the Liguilla play-off. They are handled as separate EDITIONS rather than one
 * long season, which is what they actually are: two titles a year, not two
 * halves of one.
 */
export const LIGA_MX: Competition = {
  id: 'ligamx',
  name: 'Liga MX',
  shortName: 'LMX',
  format: 'regular-season-playoff',
  tier: 'domestic-league',
  country: 'Mexico',
  countryCode: 'MEX',
  accentKey: 'ligamx',
  tiebreakers: ['points', 'goal-difference', 'goals-for', 'head-to-head', 'away-goals'],
  headToHeadChain: ['points', 'goal-difference', 'goals-for'],
  zones: [
    { kind: 'knockout-direct', fromRank: 1, toRank: 8, label: 'Liguilla', shortLabel: 'LIG' },
  ],
  pointsForWin: 3,
  pointsForDraw: 1,
  titleDecidedByPlayoff: true,
};

/**
 * The wider league set.
 *
 * ── What the registry must get right, and what it need not ─────────────────
 * ZONES are a fallback here. For a plain league the adapter prefers the feed's
 * own qualification legend, which tracks that season's real European allocation
 * far better than anything static — so these carry a sane default and the live
 * data corrects it. TIEBREAKERS are the opposite: nothing upstream supplies
 * them, they decide who finishes above whom, and they differ by country. They
 * are the reason this is a hand-written table rather than a loop.
 *
 * The differences that actually bite:
 *   • Brazil ranks WINS before goal difference, like MLS and unlike Europe.
 *   • Portugal, Turkey, Italy, Spain, Poland and Greece resolve level clubs on
 *     HEAD-TO-HEAD before goal difference; England, Germany and France do not.
 *   • Belgium ranks wins before head-to-head.
 *
 * ── What is deliberately NOT modelled ──────────────────────────────────────
 * Belgium, Austria, Denmark, Poland and Greece split into a championship round
 * and HALVE or carry points at the split. The site shows the league's table as
 * the feed reports it, which is correct at any moment, but the model does not
 * simulate the split — so those carry `titleDecidedByPlayoff`, which already
 * stops the product calling a leader "champions" and drops the title column to
 * "1st". Australia's finals series is the same case.
 */
function league(spec: {
  id: string;
  name: string;
  shortName: string;
  country: string;
  countryCode: string;
  tiebreakers: TiebreakerCriterion[];
  headToHeadChain?: TiebreakerCriterion[];
  /** Clubs relegated, for the fallback bands only. */
  relegated?: number;
  size: number;
  titleDecidedByPlayoff?: boolean;
}): Competition {
  const {
    id, name, shortName, country, countryCode, tiebreakers, headToHeadChain,
    relegated = 3, size, titleDecidedByPlayoff,
  } = spec;
  return {
    id,
    name,
    shortName,
    format: 'league',
    tier: 'domestic-league',
    country,
    countryCode,
    accentKey: id,
    tiebreakers,
    ...(headToHeadChain ? { headToHeadChain } : {}),
    // Fallback only — overridden by the feed's legend in practice.
    zones: relegated > 0
      ? [{
          kind: 'relegation' as const,
          fromRank: size - relegated + 1,
          toRank: size,
          label: 'Relegation',
          shortLabel: 'REL',
        }]
      : [],
    pointsForWin: 3,
    pointsForDraw: 1,
    ...(titleDecidedByPlayoff ? { titleDecidedByPlayoff } : {}),
  };
}

/** England below the top flight — the most heavily traded lower tiers anywhere. */
const ENGLISH = ['points', 'goal-difference', 'goals-for'] as TiebreakerCriterion[];
const H2H_FIRST = ['points', 'head-to-head', 'goal-difference', 'goals-for'] as TiebreakerCriterion[];
const H2H_CHAIN = ['points', 'goal-difference', 'goals-for'] as TiebreakerCriterion[];

export const CHAMPIONSHIP = league({
  id: 'championship', name: 'Championship', shortName: 'CHA',
  country: 'England', countryCode: 'ENG', tiebreakers: ENGLISH, size: 24,
});
export const LEAGUE_ONE = league({
  id: 'league-one', name: 'League One', shortName: 'L1E',
  country: 'England', countryCode: 'ENG', tiebreakers: ENGLISH, size: 24, relegated: 4,
});
export const LEAGUE_TWO = league({
  id: 'league-two', name: 'League Two', shortName: 'L2E',
  country: 'England', countryCode: 'ENG', tiebreakers: ENGLISH, size: 24, relegated: 2,
});
export const SCOTTISH_PREM = league({
  id: 'scotprem', name: 'Scottish Premiership', shortName: 'SPL',
  country: 'Scotland', countryCode: 'SCO', tiebreakers: ENGLISH, size: 12, relegated: 1,
});
export const EREDIVISIE = league({
  id: 'eredivisie', name: 'Eredivisie', shortName: 'ERE',
  country: 'Netherlands', countryCode: 'NED', tiebreakers: ENGLISH, size: 18, relegated: 2,
});
export const PRIMEIRA_LIGA = league({
  id: 'primeira', name: 'Liga Portugal', shortName: 'POR',
  country: 'Portugal', countryCode: 'POR',
  tiebreakers: H2H_FIRST, headToHeadChain: H2H_CHAIN, size: 18, relegated: 2,
});
export const SUPER_LIG = league({
  id: 'superlig', name: 'Süper Lig', shortName: 'TUR',
  country: 'Turkey', countryCode: 'TUR',
  tiebreakers: H2H_FIRST, headToHeadChain: H2H_CHAIN, size: 18, relegated: 4,
});
export const BELGIAN_PRO = league({
  id: 'belgianpro', name: 'Belgian Pro League', shortName: 'BEL',
  country: 'Belgium', countryCode: 'BEL',
  // Wins before head-to-head, which is Belgium's own order.
  tiebreakers: ['points', 'wins', 'head-to-head', 'goal-difference', 'goals-for'],
  headToHeadChain: H2H_CHAIN, size: 16, relegated: 1, titleDecidedByPlayoff: true,
});
export const BRASILEIRAO = league({
  id: 'brasileirao', name: 'Brasileirão Série A', shortName: 'BRA',
  country: 'Brazil', countryCode: 'BRA',
  // Wins BEFORE goal difference — the CBF order, and the opposite of Europe.
  tiebreakers: ['points', 'wins', 'goal-difference', 'goals-for', 'head-to-head', 'disciplinary'],
  headToHeadChain: H2H_CHAIN, size: 20, relegated: 4,
});
export const BUNDESLIGA_2 = league({
  id: 'bundesliga2', name: '2. Bundesliga', shortName: 'BL2',
  country: 'Germany', countryCode: 'GER', tiebreakers: ENGLISH, size: 18,
});
export const SERIE_B = league({
  id: 'serieb', name: 'Serie B', shortName: 'SEB',
  country: 'Italy', countryCode: 'ITA',
  tiebreakers: H2H_FIRST, headToHeadChain: H2H_CHAIN, size: 20, relegated: 4,
});
export const LIGUE_2 = league({
  id: 'ligue2', name: 'Ligue 2', shortName: 'L2F',
  country: 'France', countryCode: 'FRA', tiebreakers: ENGLISH, size: 18,
});
export const LALIGA_2 = league({
  id: 'laliga2', name: 'LaLiga 2', shortName: 'LL2',
  country: 'Spain', countryCode: 'ESP',
  tiebreakers: H2H_FIRST, headToHeadChain: H2H_CHAIN, size: 22, relegated: 4,
});
export const SUPERLIGAEN = league({
  id: 'superligaen', name: 'Superligaen', shortName: 'DEN',
  country: 'Denmark', countryCode: 'DEN', tiebreakers: ENGLISH, size: 12,
  relegated: 2, titleDecidedByPlayoff: true,
});
export const ELITESERIEN = league({
  id: 'eliteserien', name: 'Eliteserien', shortName: 'NOR',
  country: 'Norway', countryCode: 'NOR', tiebreakers: ENGLISH, size: 16, relegated: 2,
});
export const ALLSVENSKAN = league({
  id: 'allsvenskan', name: 'Allsvenskan', shortName: 'SWE',
  country: 'Sweden', countryCode: 'SWE', tiebreakers: ENGLISH, size: 16, relegated: 2,
});
export const SWISS_SUPER = league({
  id: 'swiss', name: 'Swiss Super League', shortName: 'SUI',
  country: 'Switzerland', countryCode: 'SUI', tiebreakers: ENGLISH, size: 12, relegated: 1,
});
export const AUSTRIAN_BUNDESLIGA = league({
  id: 'austria', name: 'Austrian Bundesliga', shortName: 'AUT',
  country: 'Austria', countryCode: 'AUT', tiebreakers: ENGLISH, size: 12,
  relegated: 1, titleDecidedByPlayoff: true,
});
export const EKSTRAKLASA = league({
  id: 'ekstraklasa', name: 'Ekstraklasa', shortName: 'POL',
  country: 'Poland', countryCode: 'POL',
  tiebreakers: H2H_FIRST, headToHeadChain: H2H_CHAIN, size: 18, relegated: 3,
});
export const GREEK_SUPER = league({
  id: 'greece', name: 'Super League 1', shortName: 'GRE',
  country: 'Greece', countryCode: 'GRE',
  tiebreakers: H2H_FIRST, headToHeadChain: H2H_CHAIN, size: 14,
  relegated: 2, titleDecidedByPlayoff: true,
});
export const SAUDI_PRO = league({
  id: 'saudi', name: 'Saudi Pro League', shortName: 'KSA',
  country: 'Saudi Arabia', countryCode: 'KSA', tiebreakers: ENGLISH, size: 18, relegated: 3,
});
export const A_LEAGUE = league({
  id: 'aleague', name: 'A-League Men', shortName: 'AUS',
  country: 'Australia', countryCode: 'AUS', tiebreakers: ENGLISH, size: 12,
  relegated: 0, titleDecidedByPlayoff: true,
});

/**
 * Argentina — two tournaments a year, each played in two zones.
 *
 * The Primera División runs an Apertura and a Clausura, and each splits the
 * thirty clubs into two zones of fifteen who are ranked separately. So this is
 * the conference machinery again, with the adapter first selecting whichever of
 * the year's two tournaments is actually being played.
 *
 * The title is decided by a knockout between the zone leaders, never by
 * finishing top of a zone — hence `titleDecidedByPlayoff`.
 *
 * AFA ranks on points, then goal difference, then goals scored.
 */
export const ARGENTINA = league({
  id: 'argentina', name: 'Primera División', shortName: 'ARG',
  country: 'Argentina', countryCode: 'ARG',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  size: 30, relegated: 2, titleDecidedByPlayoff: true,
});

/**
 * CONCACAF's domestic leagues.
 *
 * Most of the confederation runs an Apertura/Clausura calendar, and none of
 * these carry expected goals — the capability flags handle that honestly: the
 * xG columns simply do not render rather than showing zeroes, which is exactly
 * what `hasXG` was built for. Everything else — table, form, model, fixtures —
 * works as it does anywhere else.
 */
export const COSTA_RICA = league({
  id: 'costarica', name: 'Liga Promerica', shortName: 'CRC',
  country: 'Costa Rica', countryCode: 'CRC',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  size: 12, relegated: 1, titleDecidedByPlayoff: true,
});
export const HONDURAS = league({
  id: 'honduras', name: 'Liga Nacional', shortName: 'HON',
  country: 'Honduras', countryCode: 'HON',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  size: 12, relegated: 1, titleDecidedByPlayoff: true,
});
export const GUATEMALA = league({
  id: 'guatemala', name: 'Liga Nacional', shortName: 'GUA',
  country: 'Guatemala', countryCode: 'GUA',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  size: 12, relegated: 1, titleDecidedByPlayoff: true,
});
export const EL_SALVADOR = league({
  id: 'elsalvador', name: 'Primera División', shortName: 'SLV',
  country: 'El Salvador', countryCode: 'SLV',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  size: 12, relegated: 1, titleDecidedByPlayoff: true,
});
export const PANAMA = league({
  id: 'panama', name: 'Liga Panameña', shortName: 'PAN',
  country: 'Panama', countryCode: 'PAN',
  tiebreakers: ['points', 'goal-difference', 'goals-for'],
  size: 12, relegated: 0, titleDecidedByPlayoff: true,
});
export const CANADA_PL = league({
  id: 'canada', name: 'Canadian Premier League', shortName: 'CAN',
  country: 'Canada', countryCode: 'CAN',
  tiebreakers: ['points', 'wins', 'goal-difference', 'goals-for'],
  size: 8, relegated: 0, titleDecidedByPlayoff: true,
});

export const COMPETITIONS: Competition[] = [
  PREMIER_LEAGUE,
  LA_LIGA,
  SERIE_A,
  BUNDESLIGA,
  LIGUE_1,
  CHAMPIONS_LEAGUE,
  EUROPA_LEAGUE,
  CONFERENCE_LEAGUE,
  CLUB_WORLD_CUP,
  LIBERTADORES,
  CONCACAF_CHAMPIONS_CUP,
  AFC_CHAMPIONS_ELITE,
  MLS,
  LIGA_MX,
  CHAMPIONSHIP,
  LEAGUE_ONE,
  LEAGUE_TWO,
  SCOTTISH_PREM,
  EREDIVISIE,
  PRIMEIRA_LIGA,
  SUPER_LIG,
  BELGIAN_PRO,
  BRASILEIRAO,
  BUNDESLIGA_2,
  SERIE_B,
  LIGUE_2,
  LALIGA_2,
  SUPERLIGAEN,
  ELITESERIEN,
  ALLSVENSKAN,
  SWISS_SUPER,
  AUSTRIAN_BUNDESLIGA,
  EKSTRAKLASA,
  GREEK_SUPER,
  SAUDI_PRO,
  A_LEAGUE,
  ARGENTINA,
  COSTA_RICA,
  HONDURAS,
  GUATEMALA,
  EL_SALVADOR,
  PANAMA,
  CANADA_PL,
];

const BY_ID = new Map(COMPETITIONS.map((c) => [c.id, c]));

export function getCompetition(id: string): Competition | undefined {
  return BY_ID.get(id);
}

/**
 * The zone a finishing rank falls in, most specific first.
 *
 * Bands deliberately OVERLAP — rank 1 is both 'champion' and inside the 1-4
 * Champions League band — so this returns the narrowest match. Without that
 * rule the title winner would render with a generic UCL rail and the table
 * would lose its most important single piece of information.
 */
export function zoneForRank(competition: Competition, rank: number): Zone | null {
  const matches = competition.zones.filter((z) => rank >= z.fromRank && rank <= z.toRank);
  if (matches.length === 0) return null;
  return matches.reduce((narrowest, z) =>
    z.toRank - z.fromRank < narrowest.toRank - narrowest.fromRank ? z : narrowest,
  );
}

/**
 * True when this competition's European places move with cup winners and UEFA
 * coefficients, i.e. every UEFA-affiliated domestic league. A play-off league's
 * cutoffs are fixed by its own rules and need no such caveat.
 */
export function zonesAreProvisional(competition: Competition): boolean {
  return competition.tier === 'domestic-league' && !competition.titleDecidedByPlayoff;
}

/** True when the league is split into conferences that rank separately. */
export function hasConferences(competition: Competition): boolean {
  return (competition.conferences?.length ?? 0) > 1;
}
