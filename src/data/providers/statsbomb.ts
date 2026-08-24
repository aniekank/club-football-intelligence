import { computeStandings } from '@/analytics/standings';
import { scoreMatrix } from '@/analytics/poisson';
import { assignCodes } from './fotmob';
import { getCompetition } from '@/domain/competitions';
import type {
  DatasetSnapshot, Match, Player, PlayerStats, Season, Team,
} from '@/domain/types';

/**
 * StatsBomb historical-edition loader.
 *
 * Reads a snapshot pre-built offline by `scripts/fetch-statsbomb.mjs`. No
 * network, no rate limit, no vendor that can withdraw access — a completed
 * season is immutable, so once it is in the repo it is permanent.
 *
 * ── What this edition has that the live one does not ───────────────────────
 * Every fixture, not a recent window. A live snapshot ingests detail for the
 * last few weeks; here all 380 matches carry shots, so player aggregates are
 * genuine season totals and the coverage flag says `complete`. It is the only
 * place in the product where a per-90 rate rests on a full season.
 *
 * ── And what it does not have ──────────────────────────────────────────────
 * No match ratings — StatsBomb publishes none, so `averageRating` is null
 * rather than a fabricated number. No momentum series, no market values, no
 * managers beyond what the match metadata carries. The capability flags say so
 * and the UI hides those surfaces rather than drawing them empty.
 */

export interface StatsBombEdition {
  kind: 'statsbomb-edition';
  competitionId: string;
  seasonLabel: string;
  competitionName: string;
  generatedAt: string;
  teams: Team[];
  players: Player[];
  playerStats: PlayerStats[];
  matches: Match[];
}

/**
 * Build a snapshot from a pre-computed edition.
 *
 * Standings are recomputed here rather than stored, deliberately: the
 * tiebreaker chain lives in the competition registry, and a table baked into
 * the cache file would silently keep whatever rules were in force the day the
 * script ran. Recomputing means a correction to LaLiga's chain fixes the 2015/16
 * table too.
 */
export function buildFromEdition(edition: StatsBombEdition): DatasetSnapshot {
  const competition = getCompetition(edition.competitionId);
  if (!competition) throw new Error(`unknown competition "${edition.competitionId}"`);

  const seasonId = `${edition.competitionId}-${edition.seasonLabel.replace('/', '-')}`;

  // Re-derive codes with the shared, collision-aware assigner. The ingest script
  // writes a naive three-letter slice, which renders both Manchester clubs as
  // "MAN" — and the code is the fallback shown wherever a crest is missing,
  // which for a historical edition is everywhere.
  const codes = assignCodes(edition.teams.map((t) => t.name));
  const teams: Team[] = edition.teams.map((t) => ({
    ...t,
    code: codes.get(t.name) ?? t.code,
  }));
  const teamIds = teams.map((t) => t.id);

  const standings = computeStandings({
    matches: edition.matches,
    teamIds,
    competition,
    seasonId,
  });

  // Season xG totals, from the shot data we actually hold. The live adapter
  // borrows these from the provider's table; here they are ours, and complete.
  const xgFor = new Map<string, number>();
  const xgAgainst = new Map<string, number>();
  for (const m of edition.matches) {
    for (const [teamId, stats] of Object.entries(m.teamStats)) {
      if (stats.xG === null) continue;
      xgFor.set(teamId, (xgFor.get(teamId) ?? 0) + stats.xG);
      const opponent = teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
      xgAgainst.set(opponent, (xgAgainst.get(opponent) ?? 0) + stats.xG);
    }
  }
  for (const row of standings) {
    const f = xgFor.get(row.teamId);
    const a = xgAgainst.get(row.teamId);
    if (f !== undefined) row.xGFor = Math.round(f * 10) / 10;
    if (a !== undefined) row.xGAgainst = Math.round(a * 10) / 10;
  }

  /**
   * Expected points, derived from each match's xG.
   *
   * The live feed supplies this; StatsBomb does not, so it is computed — and it
   * is worth computing rather than leaving null, because "how many points did
   * this performance deserve" is the single most useful thing a completed
   * season can be asked, and Leicester 2015/16 is the canonical answer.
   *
   * Per match: turn the two xG totals into a scoreline distribution and take
   * 3 x P(win) + 1 x P(draw). Summing those across a season gives the points a
   * side would have collected on average from the chances both teams created.
   * Bivariate Poisson, the same model used everywhere else, so the number is
   * consistent with the rest of the product rather than a second opinion.
   */
  const xPoints = new Map<string, number>();
  for (const m of edition.matches) {
    const hx = m.teamStats[m.homeTeamId]?.xG;
    const ax = m.teamStats[m.awayTeamId]?.xG;
    if (hx == null || ax == null) continue;
    const matrix = scoreMatrix(Math.max(hx, 0.01), Math.max(ax, 0.01));
    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    for (let i = 0; i < matrix.length; i++) {
      const row = matrix[i] as number[];
      for (let j = 0; j < row.length; j++) {
        const p = row[j] as number;
        if (i > j) homeWin += p;
        else if (i === j) draw += p;
        else awayWin += p;
      }
    }
    const win = competition.pointsForWin;
    const drew = competition.pointsForDraw;
    xPoints.set(m.homeTeamId, (xPoints.get(m.homeTeamId) ?? 0) + homeWin * win + draw * drew);
    xPoints.set(m.awayTeamId, (xPoints.get(m.awayTeamId) ?? 0) + awayWin * win + draw * drew);
  }
  for (const row of standings) {
    const xp = xPoints.get(row.teamId);
    if (xp !== undefined) row.expectedPoints = Math.round(xp * 10) / 10;
  }

  const kickoffs = edition.matches.map((m) => m.kickoff).sort();
  const weeks = edition.matches
    .map((m) => m.matchweek)
    .filter((w): w is number => w !== null);

  const season: Season = {
    id: seasonId,
    competitionId: edition.competitionId,
    label: edition.seasonLabel,
    startYear: Number(edition.seasonLabel.slice(0, 4)) || 0,
    startDate: kickoffs[0] ?? '',
    endDate: kickoffs[kickoffs.length - 1] ?? '',
    numTeams: teams.length,
    totalMatchweeks: weeks.length ? Math.max(...weeks) : null,
    currentMatchweek: weeks.length ? Math.max(...weeks) : null,
    isCurrent: false,
    // A completed season has a champion, and saying so is the whole point of a
    // retrospective edition.
    championTeamId: standings[0]?.teamId ?? null,
  };

  const playedCount = edition.matches.filter((m) => m.status === 'FINISHED').length;

  return {
    competition,
    season,
    relatedCompetitions: [],
    memberships: teams.map((t) => ({
      teamId: t.id,
      seasonId,
      competitionId: edition.competitionId,
      groupId: null,
      entryStage: null,
    })),
    teams,
    players: edition.players,
    playerStats: edition.playerStats,
    matches: edition.matches,
    standings,
    // A finished season needs no prior — every rating is derived from a full
    // set of results, so shrinkage has nothing left to shrink toward.
    priorRatings: [],
    generatedAt: edition.generatedAt,
    meta: {
      source: 'statsbomb',
      sourceLabel: 'StatsBomb open data',
      capabilities: {
        hasXG: true,
        hasShotLocations: true,
        hasLineups: edition.matches.some((m) => m.lineups),
        hasPlayerStats: edition.playerStats.length > 0,
        hasMomentum: false,
        hasFormations: false,
        hasManagers: teams.some((t) => t.manager !== null),
        hasMarketValues: false,
        hasOdds: false,
        // isBigChance is our own xG >= 0.30 threshold, not a StatsBomb flag.
        modeledMetrics: ['isBigChance', 'possession'],
      },
      fetchedAt: edition.generatedAt,
      degraded: false,
      playerStatsCoverage: {
        matchesCovered: edition.matches.length,
        matchesPlayed: playedCount,
        from: kickoffs[0] ?? null,
        complete: true,
      },
    },
  };
}
