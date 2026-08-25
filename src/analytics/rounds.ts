import type { DatasetSnapshot, ID, ISODate, Match, Team } from '@/domain/types';
import type { Progression } from './progression';

/**
 * A season as a sequence of rounds, not a wall of fixtures.
 *
 * ── Why the round is the unit ──────────────────────────────────────────────
 * The fixture list here rendered a hundred and twenty cards in a three-column
 * grid, newest first, and nothing else. That is a database query with a
 * stylesheet: every match the same size, no round has a shape, and the reader
 * scrolls looking for the one thing that happened. But football is not played
 * as a stream — it is played in rounds, and a round is the unit people
 * actually talk about. Grouping by round lets exactly one of them be open and
 * the rest be a line each.
 *
 * ── Everything here is a fact, not a model output ──────────────────────────
 * The temptation with results is to score them against the model: "this was a
 * 22% shock". It would be dishonest here. Team ratings are season-to-date, so
 * running today's ratings over a match from matchweek three grades a
 * prediction that was never made with information that did not exist. So the
 * highlights are drawn only from things that are true on the scoresheet —
 * margins, half-time turnarounds, goals — and the one comparative claim
 * (an upset) uses each club's league position BEFORE the round, recomputed by
 * the standings engine, which is knowledge the reader had at kick-off too.
 */

export interface RoundHighlight {
  kind: 'upset' | 'comeback' | 'rout' | 'thriller';
  match: Match;
  /** A sentence the card can print verbatim, already carrying its evidence. */
  detail: string;
}

export interface RoundMover {
  team: Team;
  from: number;
  to: number;
  /** Places gained; negative is a fall. */
  places: number;
}

export interface Round {
  /** Stable across renders and safe in a URL fragment. */
  key: string;
  label: string;
  matchweek: number | null;
  matches: Match[];
  from: ISODate;
  to: ISODate;
  played: number;
  /** True once every fixture in the round has a final score. */
  complete: boolean;
  /** Null when nothing in the round has been played — never a misleading 0. */
  goals: number | null;
  homeWins: number;
  draws: number;
  awayWins: number;
  highlights: RoundHighlight[];
  movers: RoundMover[];
}

/** A win this many places up the table counts as an upset. */
const UPSET_GAP = 6;
/** Goal margin at which a win stops being a win and becomes a statement. */
const ROUT_MARGIN = 3;
/** Goals in a match that stayed close. */
const THRILLER_GOALS = 5;

const isPlayed = (m: Match) => m.homeScore !== null && m.awayScore !== null;

export function buildRounds(
  snapshot: DatasetSnapshot,
  progression: Progression | null,
): Round[] {
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));

  // Positions after each completed matchweek, so a round can be read against
  // the table as it stood when it kicked off.
  const positionsAfter = new Map<number, Map<ID, number>>();
  for (const club of progression?.clubs ?? []) {
    for (const p of club.points) {
      const week = positionsAfter.get(p.matchweek) ?? new Map<ID, number>();
      week.set(club.teamId, p.position);
      positionsAfter.set(p.matchweek, week);
    }
  }
  const completedWeeks = [...positionsAfter.keys()].sort((a, b) => a - b);
  const positionsBefore = (matchweek: number | null): Map<ID, number> | null => {
    if (matchweek === null) return null;
    const prior = completedWeeks.filter((w) => w < matchweek);
    const last = prior[prior.length - 1];
    return last === undefined ? null : positionsAfter.get(last) ?? null;
  };

  // A league groups by matchweek; a knockout has none, so the round label —
  // 'Quarter-final' — is the only grouping the competition itself supplies.
  const buckets = new Map<string, Match[]>();
  for (const m of snapshot.matches) {
    if (m.status === 'CANCELLED') continue;
    const key = m.matchweek !== null ? `mw-${m.matchweek}` : `r-${m.roundLabel}`;
    buckets.set(key, [...(buckets.get(key) ?? []), m]);
  }

  const rounds: Round[] = [];
  for (const [key, all] of buckets) {
    const matches = [...all].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    const first = matches[0];
    const last = matches[matches.length - 1];
    if (!first || !last) continue;

    const played = matches.filter(isPlayed);
    const matchweek = first.matchweek;
    const before = positionsBefore(matchweek);

    let homeWins = 0, draws = 0, awayWins = 0, goals = 0;
    for (const m of played) {
      const h = m.homeScore as number;
      const a = m.awayScore as number;
      goals += h + a;
      if (h > a) homeWins++;
      else if (h < a) awayWins++;
      else draws++;
    }

    rounds.push({
      key,
      label: first.roundLabel,
      matchweek,
      matches,
      from: first.kickoff,
      to: last.kickoff,
      played: played.length,
      complete: played.length === matches.length,
      goals: played.length ? goals : null,
      homeWins,
      draws,
      awayWins,
      highlights: highlightsFor(played, teamById, before),
      movers: moversFor(matchweek, positionsAfter, completedWeeks, teamById),
    });
  }

  // Newest first: the round a reader wants is almost always the last one played
  // or the next one coming, and both live at this end of the season.
  return rounds.sort((a, b) => b.from.localeCompare(a.from));
}

function highlightsFor(
  played: Match[],
  teamById: Map<ID, Team>,
  before: Map<ID, number> | null,
): RoundHighlight[] {
  const found: (RoundHighlight & { weight: number })[] = [];

  for (const m of played) {
    const h = m.homeScore as number;
    const a = m.awayScore as number;
    const home = teamById.get(m.homeTeamId);
    const away = teamById.get(m.awayTeamId);
    if (!home || !away) continue;

    const winner = h > a ? home : a > h ? away : null;
    const loser = h > a ? away : a > h ? home : null;
    const margin = Math.abs(h - a);
    const total = h + a;

    // An upset needs both clubs to have been in the table before the round —
    // a promoted side's first fixture has no prior position and gets no claim.
    if (winner && loser && before) {
      const wp = before.get(winner.id);
      const lp = before.get(loser.id);
      if (wp !== undefined && lp !== undefined && wp - lp >= UPSET_GAP) {
        found.push({
          kind: 'upset',
          match: m,
          detail: `${winner.shortName}, ${ordinalish(wp)} before the round, beat ${ordinalish(lp)}-placed ${loser.shortName}`,
          weight: 400 + (wp - lp) * 10,
        });
        continue;
      }
    }

    // A turnaround is only knowable where half-time is recorded, and the sign
    // has to actually flip — 1-0 to 3-0 is not a comeback, it is a second half.
    if (m.homeScoreHT !== null && m.awayScoreHT !== null) {
      const htLead = Math.sign(m.homeScoreHT - m.awayScoreHT);
      const ftLead = Math.sign(h - a);
      if (htLead !== 0 && ftLead !== htLead) {
        const rescued = ftLead === 0
          ? null
          : ftLead > 0 ? home : away;
        const led = htLead > 0 ? home : away;
        found.push({
          kind: 'comeback',
          match: m,
          detail: rescued
            ? `${rescued.shortName} were losing at half-time and won it`
            : `${led.shortName} led at the break and were pegged back`,
          weight: rescued ? 300 : 200,
        });
        continue;
      }
    }

    if (margin >= ROUT_MARGIN && winner && loser) {
      found.push({
        kind: 'rout',
        match: m,
        detail: `${winner.shortName} beat ${loser.shortName} by ${margin}`,
        weight: 100 + margin * 10,
      });
      continue;
    }

    if (total >= THRILLER_GOALS && margin <= 1) {
      found.push({
        kind: 'thriller',
        match: m,
        detail: `${total} goals, and one of them settled it`,
        weight: 50 + total,
      });
    }
  }

  /**
   * Three highlights, and preferably three DIFFERENT ones.
   *
   * Ranked purely by weight, a round with four heavy defeats reports four
   * routs, and the reader learns one thing about a round in which four things
   * happened. So the best of each kind goes in first — an upset, a turnaround,
   * a rout, a thriller — and only then are the remaining slots filled by
   * weight. A round that really was three routs still says so.
   */
  const ranked = found.sort((x, y) => y.weight - x.weight);
  const picked: typeof ranked = [];
  const kindsTaken = new Set<RoundHighlight['kind']>();
  for (const h of ranked) {
    if (picked.length === 3) break;
    if (kindsTaken.has(h.kind)) continue;
    kindsTaken.add(h.kind);
    picked.push(h);
  }
  for (const h of ranked) {
    if (picked.length === 3) break;
    if (!picked.includes(h)) picked.push(h);
  }

  return picked.map(({ weight: _weight, ...h }) => h);
}

/**
 * Who the round moved, in places.
 *
 * The table after a round means nothing on its own; the DIFFERENCE it made is
 * the whole point of playing it. This is only computable for a matchweek that
 * follows another completed one, so the season's opening round honestly
 * reports no movers rather than treating everyone as having climbed from
 * nowhere.
 */
function moversFor(
  matchweek: number | null,
  positionsAfter: Map<number, Map<ID, number>>,
  completedWeeks: number[],
  teamById: Map<ID, Team>,
): RoundMover[] {
  if (matchweek === null) return [];
  const now = positionsAfter.get(matchweek);
  const priorWeeks = completedWeeks.filter((w) => w < matchweek);
  const prevWeek = priorWeeks[priorWeeks.length - 1];
  const prev = prevWeek === undefined ? undefined : positionsAfter.get(prevWeek);
  if (!now || !prev) return [];

  const movers: RoundMover[] = [];
  for (const [teamId, to] of now) {
    const from = prev.get(teamId);
    const team = teamById.get(teamId);
    if (from === undefined || !team || from === to) continue;
    movers.push({ team, from, to, places: from - to });
  }
  return movers
    .sort((a, b) => Math.abs(b.places) - Math.abs(a.places))
    .slice(0, 4);
}

const ordinalish = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** The round a reader lands on: the most recent one with a result in it. */
export function latestPlayedRound(rounds: Round[]): Round | undefined {
  return rounds.find((r) => r.played > 0);
}

/** The round coming next: the earliest one still carrying unplayed fixtures. */
export function nextRound(rounds: Round[]): Round | undefined {
  return [...rounds]
    .reverse()
    .find((r) => r.matches.some((m) => !isPlayed(m) && m.status !== 'POSTPONED'));
}
