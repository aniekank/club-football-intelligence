import { rankClubsAcrossLeagues } from './crossLeague';
import type { DatasetSnapshot, ID, ISODate, Match, Team } from '@/domain/types';

/**
 * Who is running hot, anywhere.
 *
 * ── The comparison this makes, and the one it refuses ──────────────────────
 * "Best form in the world" is a claim about difficulty as much as results, and
 * five straight wins in one league is not five straight wins in another. There
 * are two honest ways to handle that: adjust for it, or show it. Adjusting
 * means dividing results by a model whose ratings were themselves built from
 * those results — a club on a hot streak has an inflated rating, so the
 * adjustment quietly cancels the very thing being measured.
 *
 * So this shows it. Clubs are ranked on what they actually won, and the
 * average strength of the sides they beat is carried alongside on the shared
 * cross-league scale. A perfect run against weak opposition is visible as
 * exactly that, rather than being hidden inside a composite score nobody can
 * take apart.
 *
 * ── Players are counted from events, not from season totals ────────────────
 * A season total says who has been good since August; it cannot say who is
 * good now. Goals and assists are counted from match events inside a short
 * window, which makes the list genuinely international — an event is an event
 * whether it happened in Riyadh or Rotterdam, and no league's totals need to
 * be made comparable with another's first.
 *
 * Detail is fetched for a rolling three-week window, so a window inside that
 * is fully covered and a longer one would silently thin out. `WINDOW_DAYS`
 * exists to stay inside it.
 */

/** Comfortably inside the provider's detail window, so coverage is complete. */
export const WINDOW_DAYS = 14;
/** Matches behind each club's form line. */
export const FORM_MATCHES = 5;
/** Fewer than this and a run is not a run. */
const MIN_MATCHES = 3;
/** One run can span a league and two cups, so it uses the modern points. */
const POINTS_FOR_WIN = 3;
const POINTS_FOR_DRAW = 1;

export interface TeamForm {
  team: Team;
  /** The club's own league, for the label and the link — not where the run was. */
  competitionId: ID;
  competitionName: string;
  accentKey: string;
  /** How many different competitions the run spans. */
  competitions: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Most recent first: 'W', 'D', 'L'. */
  results: ('W' | 'D' | 'L')[];
  /**
   * Average cross-league rating of the sides faced, and the club's own.
   * Null where a league has too few continental results to be placed on the
   * shared scale — which is a real state, not a zero.
   */
  opposition: number | null;
  rating: number | null;
}

export interface PlayerForm {
  playerId: ID;
  name: string;
  position: string;
  nationality: string | null;
  teamId: ID;
  teamName: string;
  teamCode: string;
  crestUrl: string | null;
  competitionId: ID;
  competitionName: string;
  goals: number;
  assists: number;
  /** Matches in the window they scored or assisted in — not appearances. */
  matches: number;
}

const isPlayed = (m: Match) => m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null;

/**
 * Recent form for every club, ranked — across every competition it plays in.
 *
 * ── One run per club, not one per competition ──────────────────────────────
 * The first version walked each snapshot separately, so a club in a league and
 * a continental competition got a row for each, and each row was "the last five
 * in THAT competition". Chelsea therefore appeared on five straight Club World
 * Cup wins while their league form said something else entirely — a true
 * sentence that answers a question nobody asked. Form is what a club has done
 * lately, and lately does not stop at a competition boundary.
 *
 * So matches are pooled across every current-season snapshot the club appears
 * in and the last five are taken by date. The label then carries how many
 * competitions the run spans, because five matches drawn from three of them is
 * a different kind of week.
 *
 * ── The window is a COUNT of matches, not a span of days ───────────────────
 * Clubs play at different rates: a side in three competitions plays eight
 * matches in a fortnight and a side in one plays four. Ranking those together
 * on points would reward the fixture list.
 */
export function topFormTeams(
  snapshots: DatasetSnapshot[],
  limit = 6,
): TeamForm[] {
  const { clubs } = rankClubsAcrossLeagues(snapshots);
  const ratingOf = new Map<ID, number>();
  for (const c of clubs) {
    // A club can appear in several competitions; the first is the one its
    // domestic league produced, which is the rating that means something.
    if (!ratingOf.has(c.team.id)) ratingOf.set(c.team.id, c.crossElo);
  }

  interface Pool {
    team: Team;
    /** Where the club is FROM, for the label and the link. */
    home: DatasetSnapshot['competition'] | null;
    matches: { match: Match; competition: DatasetSnapshot['competition'] }[];
    seen: Set<ID>;
  }
  const pools = new Map<ID, Pool>();

  for (const s of snapshots) {
    if (!s.season.isCurrent) continue;
    const domestic = s.competition.tier === 'domestic-league';

    for (const team of s.teams) {
      const pool = pools.get(team.id) ?? { team, home: null, matches: [], seen: new Set<ID>() };
      // A club's identity is its league; a cup is something it is in.
      if (domestic && !pool.home) pool.home = s.competition;
      pools.set(team.id, pool);
    }

    for (const m of s.matches) {
      if (!isPlayed(m)) continue;
      for (const teamId of [m.homeTeamId, m.awayTeamId]) {
        const pool = pools.get(teamId);
        // The same fixture can reach here from two snapshots that both carry
        // the competition — counting it twice would invent a match.
        if (!pool || pool.seen.has(m.id)) continue;
        pool.seen.add(m.id);
        pool.matches.push({ match: m, competition: s.competition });
      }
    }
  }

  const rows: TeamForm[] = [];

  for (const pool of pools.values()) {
    const recent = pool.matches
      .sort((a, b) => b.match.kickoff.localeCompare(a.match.kickoff))
      .slice(0, FORM_MATCHES);
    if (recent.length < MIN_MATCHES) continue;

    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
    const results: ('W' | 'D' | 'L')[] = [];
    const facedRatings: number[] = [];
    const competitions = new Set<ID>();

    for (const { match: m, competition } of recent) {
      competitions.add(competition.id);
      const home = m.homeTeamId === pool.team.id;
      const own = (home ? m.homeScore : m.awayScore) as number;
      const other = (home ? m.awayScore : m.homeScore) as number;
      goalsFor += own;
      goalsAgainst += other;
      if (own > other) { wins++; results.push('W'); }
      else if (own < other) { losses++; results.push('L'); }
      else { draws++; results.push('D'); }

      const opponentId = home ? m.awayTeamId : m.homeTeamId;
      const rating = ratingOf.get(opponentId);
      if (rating !== undefined) facedRatings.push(rating);
    }

    // A run spanning a league and two cups has no single points system to
    // borrow, so it uses the modern one everywhere rather than whichever
    // competition happened to supply the most matches.
    const label = pool.home ?? recent[0]!.competition;

    rows.push({
      team: pool.team,
      competitionId: label.id,
      competitionName: label.name,
      accentKey: label.accentKey,
      competitions: competitions.size,
      played: recent.length,
      wins,
      draws,
      losses,
      points: wins * POINTS_FOR_WIN + draws * POINTS_FOR_DRAW,
      goalsFor,
      goalsAgainst,
      results,
      // Averaged only over opponents actually ON the scale. Substituting a
      // league average for the rest would invent the very number the reader
      // is being asked to weigh the run against.
      opposition: facedRatings.length
        ? Math.round(facedRatings.reduce((a, b) => a + b, 0) / facedRatings.length)
        : null,
      rating: ratingOf.get(pool.team.id) ?? null,
    });
  }

  /**
   * Points first, then goal difference, then who they played.
   *
   * Opposition strength BREAKS TIES rather than driving the order. It is the
   * honest weight for two identical runs and the wrong weight for comparing a
   * good run against a great one — a club can only beat what it is given.
   */
  return rows
    .sort((a, b) =>
      b.points - a.points
      || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
      || (b.opposition ?? -Infinity) - (a.opposition ?? -Infinity))
    .slice(0, limit);
}

/**
 * Goals and assists across every competition, inside a short window.
 *
 * Own goals are excluded from a scorer's tally for the obvious reason. Assists
 * come from the goal event's related player rather than from a separate assist
 * event, because that is how the feed records them — an assist here always has
 * a goal attached to it.
 */
export function topFormPlayers(
  snapshots: DatasetSnapshot[],
  nowISO: ISODate,
  limit = 6,
): PlayerForm[] {
  const since = new Date(Date.parse(nowISO) - WINDOW_DAYS * 86_400_000).toISOString();

  /**
   * One directory of players, built once, domestic league winning.
   *
   * A player scores in their league and in a continental competition in the
   * same fortnight, and both snapshots carry a record of them. Taking whichever
   * happened to be seen first would label a striker by the Champions League one
   * week and by the Premier League the next, for no reason the reader could
   * see. The domestic league is the club a player IS at; everything else is a
   * competition they are in.
   *
   * It is also a map rather than a `find` per scorer: a linear scan of every
   * squad, once per goal, is the shape of a page that gets slower every
   * matchday.
   */
  const directory = new Map<ID, { name: string; position: string; nationality: string | null; team: Team; competition: DatasetSnapshot['competition'] }>();
  const ordered = [...snapshots].sort(
    (a, b) => Number(b.competition.tier === 'domestic-league') - Number(a.competition.tier === 'domestic-league'),
  );
  for (const s of ordered) {
    if (!s.season.isCurrent) continue;
    const teamById = new Map(s.teams.map((t) => [t.id, t]));
    for (const p of s.players) {
      if (directory.has(p.id)) continue;
      const team = teamById.get(p.teamId);
      if (!team) continue;
      directory.set(p.id, {
        name: p.name,
        position: p.position,
        nationality: p.nationality,
        team,
        competition: s.competition,
      });
    }
  }

  interface Tally { goals: number; assists: number; matches: Set<ID> }
  const tally = new Map<ID, Tally>();

  for (const s of snapshots) {
    if (!s.season.isCurrent) continue;
    for (const m of s.matches) {
      if (!isPlayed(m) || m.kickoff < since) continue;

      for (const e of m.events) {
        if (e.type !== 'GOAL' && e.type !== 'PENALTY_GOAL') continue;

        for (const [id, field] of [
          [e.playerId, 'goals'] as const,
          [e.relatedPlayerId, 'assists'] as const,
        ]) {
          if (!id) continue;
          const row = tally.get(id) ?? { goals: 0, assists: 0, matches: new Set<ID>() };
          row[field] += 1;
          row.matches.add(m.id);
          tally.set(id, row);
        }
      }
    }
  }

  const out: PlayerForm[] = [];
  for (const [playerId, row] of tally) {
    const who = directory.get(playerId);
    // A scorer no squad list carries is real, but there is nothing to name them
    // with beyond an id — and an unnamed row on a leaderboard is worse than a
    // shorter leaderboard.
    if (!who) continue;

    out.push({
      playerId,
      name: who.name,
      position: who.position,
      nationality: who.nationality,
      teamId: who.team.id,
      teamName: who.team.shortName,
      teamCode: who.team.code,
      crestUrl: who.team.crestUrl,
      competitionId: who.competition.id,
      competitionName: who.competition.name,
      goals: row.goals,
      assists: row.assists,
      matches: row.matches.size,
    });
  }

  return out
    .sort((a, b) =>
      (b.goals + b.assists) - (a.goals + a.assists)
      || b.goals - a.goals
      // A player who did it in fewer matches did more.
      || a.matches - b.matches)
    .slice(0, limit);
}
