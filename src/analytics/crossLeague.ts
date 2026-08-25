import type { DatasetSnapshot, ID, Team } from '@/domain/types';

/**
 * One rating universe across every competition loaded.
 *
 * ── The problem this exists to solve ───────────────────────────────────────
 * Club ratings are anchored PER COMPETITION: `elo = 1500 + netStrength * 350`,
 * centred on that league's own average. So 1700 in Honduras and 1700 in the
 * Premier League are not the same number, and every ranking in the product so
 * far has been silently relative to its own division. "Is Arsenal better than
 * Flamengo" was unanswerable, and the honest reason was that nothing measured
 * the gap between the leagues themselves.
 *
 * ── What makes it answerable ───────────────────────────────────────────────
 * Clubs carry the same id across competitions, so a club in both the Premier
 * League and the Champions League is a BRIDGE between them. Continental
 * competitions are therefore a measuring instrument: every UCL tie between an
 * English and a Spanish club is a direct observation of the gap between those
 * leagues, and the Club World Cup connects confederations the same way.
 *
 * ── The method, and why this one ───────────────────────────────────────────
 * Every cross-league match contributes its goal difference. League offsets are
 * then solved iteratively: a league's offset is the average goal difference of
 * its clubs in cross-league matches, PLUS the offset of whoever they played.
 * Beating a strong league counts for more than beating a weak one, and the
 * whole system is re-centred on zero each pass so it cannot drift.
 *
 * That is a simplified Massey rating. It is chosen over anything cleverer
 * because it can be explained in a sentence and audited by hand from the
 * evidence counts this returns — a reader can check it, which a black box
 * would not allow.
 *
 * ── Where it refuses ───────────────────────────────────────────────────────
 * A league whose clubs have played too few cross-league matches is NOT ranked.
 * Not ranked low — absent, with the reason given. The alternative is a number
 * with no evidence behind it, sitting in a table beside numbers that have
 * plenty, indistinguishable from them.
 */

/**
 * Converting a league offset into rating points, correctly.
 *
 * The ratings module computes `elo = 1500 + netStrength * 350`, where
 * `netStrength` is a RATIO difference against the league average — a club
 * scoring 1.3x and conceding 0.8x has a netStrength of 0.5. It is dimensionless.
 *
 * A league offset is in goals per match. Multiplying it by 350 directly — which
 * the first version did — conflates the two scales and produced a +514 point
 * adjustment against a domestic spread of about ±150, so the club ranking was
 * effectively "sort by league, then by club". Dividing by the league's own
 * scoring rate puts the offset into the same ratio units the 350 expects.
 */
const ELO_PER_RATIO = 350;

/**
 * Evidence shrinkage.
 *
 * A league with six cross-league matches can post an extreme figure by
 * accident, and the solver has no way to know it should not be trusted. Pulling
 * each offset toward zero in proportion to how little evidence stands behind it
 * is the standard correction: at 20 matches a league keeps half its measured
 * offset, at 100 it keeps five sixths, at six it keeps under a quarter.
 *
 * This is a statement about confidence, not about football. A league is not
 * being called average — it is being called unmeasured.
 */
const SHRINK_K = 20;

/**
 * Cross-league matches a league needs before it can be placed.
 *
 * Six is deliberately low but not arbitrary: below it a single tie swings a
 * league several places, which is exactly the kind of confident nonsense this
 * module is supposed to prevent. Leagues below it are reported as unranked
 * WITH their match count, so a reader can see how close they are.
 */
export const MIN_CROSS_MATCHES = 6;

export interface LeagueStrength {
  competitionId: ID;
  competitionName: string;
  /**
   * Goals per match better or worse than a neutral league, shrunk toward zero
   * by how little evidence stands behind it.
   */
  offset: number;
  /** Before shrinkage, so a reader can see what the raw result was. */
  rawOffset: number;
  /** 0..1 — the share of the raw figure that survived shrinkage. */
  confidence: number;
  matches: number;
  /** Distinct other leagues faced — one opponent is a rivalry, not a rating. */
  opponents: number;
  ranked: boolean;
}

export interface CrossRankedClub {
  team: Team;
  competitionId: ID;
  competitionName: string;
  /** Rating within their own league, as the product already computes it. */
  domesticElo: number;
  /** Their league's offset, in rating points. */
  leagueAdjustment: number;
  /** Domestic rating re-based onto the shared scale. */
  crossElo: number;
}

interface CrossMatch {
  leagueA: ID;
  leagueB: ID;
  /** Goal difference from A's perspective. */
  diff: number;
}

/**
 * Collect every cross-league observation available.
 *
 * A match counts when the two clubs' DOMESTIC leagues differ — so a UCL tie
 * between two English clubs contributes nothing, correctly: it says everything
 * about those clubs and nothing about England versus anywhere.
 */
export function crossLeagueMatches(
  snapshots: DatasetSnapshot[],
): { observations: CrossMatch[]; homeLeagueOf: Map<ID, ID> } {
  const homeLeagueOf = new Map<ID, ID>();
  for (const s of snapshots) {
    if (s.competition.tier !== 'domestic-league') continue;
    for (const t of s.teams) {
      // First domestic league wins; a club is in exactly one in practice.
      if (!homeLeagueOf.has(t.id)) homeLeagueOf.set(t.id, s.competition.id);
    }
  }

  const observations: CrossMatch[] = [];
  for (const s of snapshots) {
    // Only continental competitions bridge leagues. A domestic match between
    // two clubs of the same league is not evidence about anything here.
    if (s.competition.tier === 'domestic-league') continue;
    for (const m of s.matches) {
      if (m.status !== 'FINISHED') continue;
      if (m.homeScore === null || m.awayScore === null) continue;
      const a = homeLeagueOf.get(m.homeTeamId);
      const b = homeLeagueOf.get(m.awayTeamId);
      if (!a || !b || a === b) continue;
      observations.push({ leagueA: a, leagueB: b, diff: m.homeScore - m.awayScore });
    }
  }
  return { observations, homeLeagueOf };
}

/**
 * Solve league offsets from the observations.
 *
 * Iterative because the answer is circular by nature: how good England is
 * depends on how good the leagues its clubs beat are, and vice versa. Twenty
 * passes is far more than this converges in at this scale.
 */
export function solveLeagueStrength(
  snapshots: DatasetSnapshot[],
  passes = 20,
): LeagueStrength[] {
  const { observations } = crossLeagueMatches(snapshots);

  const nameOf = new Map<ID, string>();
  for (const s of snapshots) nameOf.set(s.competition.id, s.competition.name);

  // Per league: every observation from its own point of view.
  const perLeague = new Map<ID, { diff: number; against: ID }[]>();
  const push = (league: ID, diff: number, against: ID) => {
    const list = perLeague.get(league) ?? [];
    list.push({ diff, against });
    perLeague.set(league, list);
  };
  for (const o of observations) {
    push(o.leagueA, o.diff, o.leagueB);
    push(o.leagueB, -o.diff, o.leagueA);
  }

  const offset = new Map<ID, number>();
  for (const league of perLeague.keys()) offset.set(league, 0);

  /**
   * Damped, because the undamped iteration OSCILLATES.
   *
   * The update is "my offset is my average margin plus my opponents'
   * offsets", and with two leagues that flips sign every pass: England lands
   * on +2 while Spain is at 0, then on 0 once Spain reaches -2, and back.
   * The fixed point is +1/-1 and the iteration never sits on it — it just
   * alternates, so the answer depended on whether the pass count was odd or
   * even. Every offset came out as exactly zero at twenty passes.
   *
   * Moving half way toward the new estimate each pass removes the flip and
   * converges on the fixed point instead of orbiting it.
   */
  const DAMPING = 0.5;

  for (let pass = 0; pass < passes; pass++) {
    const next = new Map<ID, number>();
    for (const [league, rows] of perLeague) {
      // Average margin, credited with the strength of who it came against.
      const sum = rows.reduce((n, r) => n + r.diff + (offset.get(r.against) ?? 0), 0);
      const target = sum / rows.length;
      const current = offset.get(league) ?? 0;
      next.set(league, current + DAMPING * (target - current));
    }
    // Re-centre so the scale cannot drift with each pass.
    const mean = [...next.values()].reduce((a, b) => a + b, 0) / Math.max(next.size, 1);
    for (const [league, v] of next) offset.set(league, v - mean);
  }

  return [...perLeague.entries()]
    .map(([competitionId, rows]) => {
      const raw = offset.get(competitionId) ?? 0;
      const confidence = rows.length / (rows.length + SHRINK_K);
      return {
        competitionId,
        competitionName: nameOf.get(competitionId) ?? competitionId,
        offset: raw * confidence,
        rawOffset: raw,
        confidence,
        matches: rows.length,
        opponents: new Set(rows.map((r) => r.against)).size,
        ranked: rows.length >= MIN_CROSS_MATCHES && new Set(rows.map((r) => r.against)).size >= 2,
      };
    })
    .sort((a, b) => b.offset - a.offset);
}

/**
 * Every club on one scale.
 *
 * A club's domestic rating is converted back to the goal-strength it encodes,
 * shifted by its league's offset, and converted back — so the arithmetic stays
 * in the units the evidence is actually in, and the same 350 the ratings module
 * uses does the conversion in both directions rather than a constant invented
 * here.
 *
 * Clubs from unranked leagues are EXCLUDED, not floored. A club cannot be
 * placed on a shared scale when the gap between its league and everyone else's
 * has not been measured.
 */
export function rankClubsAcrossLeagues(
  snapshots: DatasetSnapshot[],
): { clubs: CrossRankedClub[]; leagues: LeagueStrength[] } {
  const leagues = solveLeagueStrength(snapshots);
  const byId = new Map(leagues.map((l) => [l.competitionId, l]));

  const clubs: CrossRankedClub[] = [];
  for (const s of snapshots) {
    if (s.competition.tier !== 'domestic-league') continue;
    const league = byId.get(s.competition.id);
    if (!league?.ranked) continue;

    /**
     * Goals per match into the ratio units the rating scale is built on.
     *
     * The league's own scoring rate is the divisor, because a one-goal edge
     * means more in a league that averages 2.2 goals than in one averaging 3.1
     * — the same margin against a lower baseline is a bigger relative gap.
     */
    const played = s.matches.filter(
      (m) => m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null,
    );
    const perTeamGoals = played.length
      ? played.reduce((n, m) => n + (m.homeScore as number) + (m.awayScore as number), 0)
        / (played.length * 2)
      : 1.4;
    const adjustment = (league.offset / Math.max(perTeamGoals, 0.5)) * ELO_PER_RATIO;
    for (const team of s.teams) {
      clubs.push({
        team,
        competitionId: s.competition.id,
        competitionName: s.competition.name,
        domesticElo: team.elo,
        leagueAdjustment: adjustment,
        crossElo: Math.round(team.elo + adjustment),
      });
    }
  }

  clubs.sort((a, b) => b.crossElo - a.crossElo);
  return { clubs, leagues };
}
