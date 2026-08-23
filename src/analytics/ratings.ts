import type { DatasetSnapshot, ID, Match, PriorRating, Team } from '@/domain/types';
import { countsTowardTable } from './standings';

/**
 * Turn results into strength ratings.
 *
 * The adapter seeds every club flat at 50/50, which is the honest starting
 * point — pretending to know a side's strength before a ball is kicked would
 * not be. This module replaces those with ratings derived from what actually
 * happened.
 *
 * ── Why shrinkage is the whole game here ───────────────────────────────────
 * The current season is ONE matchweek old. A side that won 4-0 has an infinite
 * goals-for-per-game advantage over one that lost 0-4, and a naive rating would
 * hand Brighton a 99 and crown them favourites for the title on a single
 * result. So every rating is pulled toward the league mean by a weight that
 * grows with matches played: with 1 game the rating is almost entirely prior,
 * and only around 10-12 games does the observed record dominate.
 *
 * This is the difference between a model that looks clever in May and one that
 * is not embarrassing in August.
 *
 * ── Why xG leads and goals follow ──────────────────────────────────────────
 * Expected goals is markedly more predictive of future scoring than goals are,
 * because finishing is noisy and chance creation is repeatable. Where xG is
 * available it carries most of the weight; where it is not, goals do all the
 * work and the ratings are correspondingly noisier — which the capability flags
 * already make visible.
 */

/**
 * Matches at which the observed record and the prior carry equal weight.
 * Chosen so a single-game sample is ~92% prior, ten games is ~45%, and a full
 * season is ~76% observed.
 */
const SHRINKAGE_HALF_LIFE = 12;

/** How much of the attacking signal comes from xG when it is available. */
const XG_WEIGHT = 0.65;

export interface TeamRates {
  teamId: ID;
  played: number;
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  xgForPerGame: number | null;
  xgAgainstPerGame: number | null;
}

/** Per-game scoring and conceding rates, with home/away effects removed. */
export function computeRates(matches: Match[], teamIds: ID[]): Map<ID, TeamRates> {
  const acc = new Map<ID, {
    played: number; gf: number; ga: number;
    xgf: number; xga: number; xgGames: number;
  }>();
  for (const id of teamIds) acc.set(id, { played: 0, gf: 0, ga: 0, xgf: 0, xga: 0, xgGames: 0 });

  for (const m of matches) {
    if (!countsTowardTable(m)) continue;
    const home = acc.get(m.homeTeamId);
    const away = acc.get(m.awayTeamId);
    if (!home || !away) continue;

    const hs = m.homeScore as number;
    const as = m.awayScore as number;

    // Divide out the venue effect so a side that has played four away games is
    // not mistaken for a weak one. Without this, an unbalanced early-season
    // fixture list is read as a difference in quality.
    home.played += 1; away.played += 1;
    home.gf += hs / 1.12; home.ga += as / 0.94;
    away.gf += as / 0.94; away.ga += hs / 1.12;

    const hx = m.teamStats[m.homeTeamId]?.xG;
    const ax = m.teamStats[m.awayTeamId]?.xG;
    if (hx !== null && hx !== undefined && ax !== null && ax !== undefined) {
      home.xgf += hx / 1.12; home.xga += ax / 0.94; home.xgGames += 1;
      away.xgf += ax / 0.94; away.xga += hx / 1.12; away.xgGames += 1;
    }
  }

  const out = new Map<ID, TeamRates>();
  for (const [teamId, a] of acc) {
    out.set(teamId, {
      teamId,
      played: a.played,
      goalsForPerGame: a.played ? a.gf / a.played : 0,
      goalsAgainstPerGame: a.played ? a.ga / a.played : 0,
      xgForPerGame: a.xgGames ? a.xgf / a.xgGames : null,
      xgAgainstPerGame: a.xgGames ? a.xga / a.xgGames : null,
    });
  }
  return out;
}

/**
 * Season xG totals from the league table, used when per-match xG is missing.
 * The upstream table covers every fixture; our shot data only covers the
 * detail window, so this is the more complete signal.
 */
function tableXgRates(snapshot: DatasetSnapshot): Map<ID, { for: number; against: number }> {
  const out = new Map<ID, { for: number; against: number }>();
  for (const row of snapshot.standings) {
    if (row.played === 0 || row.xGFor === null || row.xGAgainst === null) continue;
    out.set(row.teamId, { for: row.xGFor / row.played, against: row.xGAgainst / row.played });
  }
  return out;
}

export interface RatedTeams {
  teams: Team[];
  /** League-average goals per team per game, measured from this competition. */
  leagueAvgGoals: number;
}

/**
 * Derive attack/defence ratings and ELO for every club in a snapshot.
 * Returns NEW team objects — the snapshot's teams are not mutated, so a
 * re-rating never half-applies to a snapshot another request is reading.
 */
export function rateTeams(snapshot: DatasetSnapshot): RatedTeams {
  const teamIds = snapshot.teams.map((t) => t.id);
  const played = snapshot.matches.filter(countsTowardTable);
  const rates = computeRates(played, teamIds);
  const tableXg = tableXgRates(snapshot);

  // The league's own scoring rate, not a global constant — a low-scoring league
  // is a real phenomenon and assuming otherwise mis-prices all its totals.
  const totalGoals = played.reduce(
    (s, m) => s + (m.homeScore as number) + (m.awayScore as number), 0,
  );
  const leagueAvgGoals = played.length > 0
    ? totalGoals / (played.length * 2)
    : 1.38;

  // Blend the two attacking signals per club, preferring xG where present.
  const attackSignal = new Map<ID, number>();
  const defenseSignal = new Map<ID, number>();
  for (const id of teamIds) {
    const r = rates.get(id);
    if (!r || r.played === 0) continue;
    const xgFor = r.xgForPerGame ?? tableXg.get(id)?.for ?? null;
    const xgAgainst = r.xgAgainstPerGame ?? tableXg.get(id)?.against ?? null;

    attackSignal.set(id, xgFor === null
      ? r.goalsForPerGame
      : XG_WEIGHT * xgFor + (1 - XG_WEIGHT) * r.goalsForPerGame);
    defenseSignal.set(id, xgAgainst === null
      ? r.goalsAgainstPerGame
      : XG_WEIGHT * xgAgainst + (1 - XG_WEIGHT) * r.goalsAgainstPerGame);
  }

  // Last season's evidence, keyed by club. Absent it, the prior is "average".
  const priors = new Map<ID, PriorRating>(
    (snapshot.priorRatings ?? []).map((p) => [p.teamId, p]),
  );

  const teams = snapshot.teams.map((t): Team => {
    const r = rates.get(t.id);
    const games = r?.played ?? 0;
    // Shrinkage weight: 0 at no games, →1 with a full season behind it.
    const w = games / (games + SHRINKAGE_HALF_LIFE);

    const atk = attackSignal.get(t.id) ?? leagueAvgGoals;
    const def = defenseSignal.get(t.id) ?? leagueAvgGoals;

    // Shrink toward LAST SEASON rather than toward the league mean. This is
    // what makes an August forecast sensible: with one match played the rating
    // is almost entirely the prior, so Liverpool still read as Liverpool, and
    // the observed record takes over as the fixtures accumulate.
    const prior = priors.get(t.id);
    const atkPrior = prior?.attackRatio ?? 1;
    const defPrior = prior?.defenseRatio ?? 1;

    const atkRatio = atkPrior + w * (atk / Math.max(leagueAvgGoals, 0.1) - atkPrior);
    const defRatio = defPrior + w * (def / Math.max(leagueAvgGoals, 0.1) - defPrior);

    return {
      ...t,
      // The 0..100 scale the goal model consumes: 75 is exactly league average,
      // because expectedGoals() divides by 75. Clamped so an extreme early
      // sample cannot produce a nonsensical lambda.
      attackRating: clamp(75 * atkRatio, 30, 120),
      // Defence is inverted: conceding less is a HIGHER rating.
      defenseRating: clamp(75 * (2 - defRatio), 30, 120),
      elo: eloFromRatios(atkRatio, defRatio, w),
    };
  });

  return { teams, leagueAvgGoals };
}

/**
 * A single cross-league rating number.
 *
 * Deliberately anchored at 1500 and scaled by the same shrinkage weight, so an
 * unplayed season shows every club at 1500 rather than a spread invented from
 * nothing. Cross-league calibration — what a point of Bundesliga rating is
 * worth in Premier League terms — needs continental results to tie the leagues
 * together and is not attempted here.
 */
function eloFromRatios(atkRatio: number, defRatio: number, weight: number): number {
  const netStrength = atkRatio - defRatio; // >0 means outscoring the league
  return Math.round(1500 + netStrength * 350 * Math.max(weight, 0.15));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Expected score for A against B, with home advantage in rating points. */
export function eloExpectation(ratingA: number, ratingB: number, homeAdvantage = 0): number {
  return 1 / (Math.pow(10, -(ratingA + homeAdvantage - ratingB) / 400) + 1);
}


// ── Deriving the prior from a completed season ──────────────────────────────

/** One club's line in a completed season's table. */
export interface PriorSeasonRow {
  teamId: ID;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  xGFor?: number | null;
  xGAgainst?: number | null;
}

/**
 * A promoted club's prior.
 *
 * Newly promoted sides are, on average, meaningfully weaker than the division
 * they have joined — they score less and concede more. Treating them as average
 * (ratio 1.0) systematically over-rates three clubs every August, and those are
 * exactly the clubs whose relegation probability people look up.
 */
export const PROMOTED_ATTACK_RATIO = 0.85;
export const PROMOTED_DEFENSE_RATIO = 1.18;

/**
 * Convert a completed season's table into strength ratios for the NEXT season.
 *
 * xG leads where available: a side that massively over- or under-performed its
 * xG last season is much more likely to regress than to repeat, so the xG-based
 * ratio is the better predictor of what they will do next.
 *
 * `currentTeamIds` is the incoming division. Anyone in it without a row here is
 * promoted and gets the promoted prior.
 */
export function derivePriors(
  previousSeason: PriorSeasonRow[],
  currentTeamIds: ID[],
): PriorRating[] {
  const usable = previousSeason.filter((r) => r.played > 0);
  if (!usable.length) return [];

  const totalGoals = usable.reduce((s, r) => s + r.goalsFor, 0);
  const totalGames = usable.reduce((s, r) => s + r.played, 0);
  const avgGoals = totalGames > 0 ? totalGoals / totalGames : 1.38;
  if (avgGoals <= 0) return [];

  const hasXG = usable.every((r) => r.xGFor != null && r.xGAgainst != null);
  const totalXG = hasXG ? usable.reduce((s, r) => s + (r.xGFor as number), 0) : 0;
  const avgXG = hasXG && totalGames > 0 ? totalXG / totalGames : avgGoals;

  const byId = new Map(usable.map((r) => [r.teamId, r]));

  return currentTeamIds.map((teamId): PriorRating => {
    const row = byId.get(teamId);
    if (!row) {
      return {
        teamId,
        attackRatio: PROMOTED_ATTACK_RATIO,
        defenseRatio: PROMOTED_DEFENSE_RATIO,
        promoted: true,
      };
    }

    const goalAtk = row.goalsFor / row.played / avgGoals;
    const goalDef = row.goalsAgainst / row.played / avgGoals;

    let attackRatio = goalAtk;
    let defenseRatio = goalDef;
    if (hasXG && avgXG > 0) {
      const xgAtk = (row.xGFor as number) / row.played / avgXG;
      const xgDef = (row.xGAgainst as number) / row.played / avgXG;
      attackRatio = XG_WEIGHT * xgAtk + (1 - XG_WEIGHT) * goalAtk;
      defenseRatio = XG_WEIGHT * xgDef + (1 - XG_WEIGHT) * goalDef;
    }

    // Regress the prior itself toward the mean. A season is 38 games, which is
    // still a small sample for a rate, and last year's champions are not
    // certain to repeat — the schema also bounds ratios, so clamping here keeps
    // a freak season from producing an out-of-range prior.
    const REGRESSION = 0.75;
    return {
      teamId,
      attackRatio: clamp(1 + REGRESSION * (attackRatio - 1), 0.4, 2.2),
      defenseRatio: clamp(1 + REGRESSION * (defenseRatio - 1), 0.4, 2.2),
      promoted: false,
    };
  });
}
