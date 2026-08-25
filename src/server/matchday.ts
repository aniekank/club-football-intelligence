import type { DatasetSnapshot, ID, Match, Team } from '@/domain/types';
import { rankClubsAcrossLeagues } from '@/analytics/crossLeague';

/**
 * A day of football across every competition loaded.
 *
 * ── The density is the design problem ──────────────────────────────────────
 * Measured across the forty-three competitions here: a median day carries 9
 * matches, the ninetieth percentile 104, and the busiest loaded day 153. This
 * coming Saturday has 134; the Thursday before it has 2.
 *
 * A sixty-seven-fold swing between a quiet midweek and a weekend means a single
 * layout cannot serve both. Listing every match is right at 2 and useless at
 * 134; a summary is right at 134 and insulting at 2. So this returns the SHAPE
 * of the day as well as its contents, and the surface picks its treatment from
 * that rather than from a fixed design.
 *
 * ── Why it can rank at all ─────────────────────────────────────────────────
 * "The best match happening anywhere today" was unanswerable until the leagues
 * were placed on one scale — club ratings are anchored per competition, so
 * comparing a Bundesliga fixture with a Brasileirão one meant comparing two
 * numbers that were never in the same units. The cross-league ratings make it a
 * real question, and a match between two clubs whose leagues are unranked is
 * honestly excluded from the ranking rather than guessed at.
 */

export interface DayMatch {
  match: Match;
  competitionId: ID;
  competitionName: string;
  accentKey: string;
  home: Team | undefined;
  away: Team | undefined;
  /** Combined cross-league strength, or null where the leagues are unranked. */
  quality: number | null;
  /** How close the model makes it, 0..1 — higher is tighter. */
  balance: number | null;
}

export interface Matchday {
  date: string;
  matches: DayMatch[];
  /** Kickoffs bucketed by UTC hour, for the shape of the day. */
  byHour: { hour: number; count: number }[];
  competitions: number;
  live: number;
  /** Ranked by quality where it is known; the rest follow by kickoff. */
  headline: DayMatch[];
}

const utcDay = (iso: string) => iso.slice(0, 10);

export function matchdaysAcross(
  snapshots: DatasetSnapshot[],
  fromISO: string,
  days = 3,
): Matchday[] {
  const { clubs } = rankClubsAcrossLeagues(snapshots);
  const strengthOf = new Map<ID, number>();
  for (const c of clubs) {
    // A club can appear in several competitions; its domestic league is the one
    // that produced the rating, and the first is that one.
    if (!strengthOf.has(c.team.id)) strengthOf.set(c.team.id, c.crossElo);
  }

  const start = new Date(`${fromISO}T00:00:00Z`).getTime();
  const wanted = new Set(
    Array.from({ length: days }, (_, i) =>
      new Date(start + i * 86_400_000).toISOString().slice(0, 10)),
  );

  const buckets = new Map<string, DayMatch[]>();

  for (const s of snapshots) {
    // A completed archive season would flood today with matches from 2016.
    if (!s.season.isCurrent) continue;
    const teamById = new Map(s.teams.map((t) => [t.id, t]));

    for (const m of s.matches) {
      const day = utcDay(m.kickoff);
      if (!wanted.has(day)) continue;

      const home = teamById.get(m.homeTeamId);
      const away = teamById.get(m.awayTeamId);
      const hs = home ? strengthOf.get(home.id) : undefined;
      const as = away ? strengthOf.get(away.id) : undefined;

      // Quality needs BOTH clubs on the shared scale. One known and one not is
      // not half an answer, it is no answer.
      const quality = hs !== undefined && as !== undefined ? (hs + as) / 2 : null;
      const balance = hs !== undefined && as !== undefined
        ? 1 - Math.min(Math.abs(hs - as) / 400, 1)
        : null;

      const list = buckets.get(day) ?? [];
      list.push({
        match: m,
        competitionId: s.competition.id,
        competitionName: s.competition.name,
        accentKey: s.competition.accentKey,
        home,
        away,
        quality,
        balance,
      });
      buckets.set(day, list);
    }
  }

  return [...wanted]
    .sort()
    .map((date) => {
      const matches = (buckets.get(date) ?? []).sort(
        (a, b) => a.match.kickoff.localeCompare(b.match.kickoff),
      );

      const hours = new Map<number, number>();
      for (const d of matches) {
        const h = Number(d.match.kickoff.slice(11, 13));
        hours.set(h, (hours.get(h) ?? 0) + 1);
      }

      /**
       * The pick order: quality first, then how close it is.
       *
       * Two evenly-matched mid-table sides are a better watch than a mismatch
       * between two strong ones, so balance breaks ties among comparable
       * fixtures rather than driving the order — a 0-0 between the two worst
       * clubs in a league is perfectly balanced and worth nobody's evening.
       */
      const headline = matches
        .filter((d) => d.quality !== null)
        .sort((a, b) =>
          (b.quality as number) - (a.quality as number)
          || (b.balance ?? 0) - (a.balance ?? 0))
        .slice(0, 5);

      return {
        date,
        matches,
        byHour: [...hours.entries()]
          .map(([hour, count]) => ({ hour, count }))
          .sort((a, b) => a.hour - b.hour),
        competitions: new Set(matches.map((m) => m.competitionId)).size,
        live: matches.filter(
          (m) => m.match.status === 'LIVE' || m.match.status === 'HALFTIME',
        ).length,
        headline,
      };
    });
}
