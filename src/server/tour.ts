import { allSnapshots } from '@/data/store';
import { VENUES } from '@/data/geo/venues';
import { predictMatch } from '@/analytics/poisson';
import { playersToWatch, regularFloor, type WatchPlayer } from '@/server/watch';
import type { DatasetSnapshot, ID, ISODate, Match, MatchStatus, Team } from '@/domain/types';

/**
 * A week of football on earth, in the order it happens, with somewhere to point.
 *
 * ── Why the globe needed a server module at all ────────────────────────────
 * A globe that flies to the next match is only as honest as its pins. Every
 * number a stop carries — the model's split, the previous meetings, who is
 * worth watching — is computed here, once, from the same functions the match
 * page uses. The client draws values; it never derives a claim of its own. A
 * canvas that computed its own odds would be a second model, and the two would
 * disagree.
 *
 * ── Coordinates are LOOKED UP, never guessed ───────────────────────────────
 * The pin is the home club's ground, from a table built once by
 * `scripts/build-venues.mjs` and committed. A club the table does not know is
 * dropped from the tour rather than pinned to its country's centroid: a stadium
 * placed in the middle of Brazil is not a rough answer, it is a wrong one, and
 * on a map it looks exactly as confident as a right one.
 *
 * A neutral-venue fixture is dropped for the same reason — the home club's
 * ground is the wrong place by definition when the match is somewhere else, and
 * "somewhere else" is not in the feed.
 *
 * ── Why the table replaced a fetch ─────────────────────────────────────────
 * This used to resolve each ground from the club endpoint on the request path.
 * That is a network call per club, a cache that empties on every restart, and a
 * home page that took two seconds to render cold — to place a stadium that has
 * not moved since 1884.
 */

export interface TourTeam {
  id: ID;
  name: string;
  shortName: string;
  code: string;
  crestUrl: string | null;
}

export interface H2HMeeting {
  kickoff: ISODate;
  /** Scores oriented to THIS fixture's home side, not the old fixture's. */
  homeScore: number;
  awayScore: number;
}

export interface TourStop {
  matchId: ID;
  kickoff: ISODate;
  status: MatchStatus;
  competitionId: ID;
  competitionName: string;
  accentKey: string;
  lat: number;
  lon: number;
  venue: string | null;
  city: string | null;
  country: string;
  home: TourTeam;
  away: TourTeam;
  /**
   * The model's three-way split, from the same predictor as the match page.
   *
   * Only rendered for a fixture that has NOT been played. Ratings here are
   * season-to-date, so running them over a match that is already finished
   * grades a prediction nobody made with information that did not exist when
   * it would have mattered — the same reason the round summaries refuse to
   * score results against the model.
   */
  odds: { home: number; draw: number; away: number };
  /** Set only where the match has been played. Never 0 for "not played". */
  homeScore: number | null;
  awayScore: number | null;
  /** Wins for each side and draws, across every meeting in the loaded data. */
  record: { home: number; draw: number; away: number } | null;
  meetings: H2HMeeting[];
  watch: WatchPlayer[];
}

/**
 * How much of the calendar the tour covers, and how many stops it holds.
 *
 * A week forward is what "what is on" means to somebody planning an evening,
 * and at three seconds a fixture sixty stops is three minutes of cycling — long
 * enough that it never visibly repeats while anyone is watching, short enough
 * that the payload stays small.
 */
const FORWARD_DAYS = 7;
const BACK_DAYS = 2;
const MAX_STOPS = 60;
/** Trimmed at the source: this is serialised to the browser sixty times over. */
const MEETINGS_PER_STOP = 3;
const WATCH_PER_SIDE = 2;

const isLive = (s: MatchStatus) => s === 'LIVE' || s === 'HALFTIME';

const team = (t: Team): TourTeam => ({
  id: t.id, name: t.name, shortName: t.shortName, code: t.code, crestUrl: t.crestUrl,
});

/**
 * Every previous meeting between two clubs in the loaded data.
 *
 * Scanned across ALL snapshots, archive editions included, because a rivalry
 * does not start at the beginning of the current season. Scores are re-oriented
 * to the UPCOMING fixture's home side — a reader comparing "3-1" against a
 * fixture where the sides have swapped is being shown the number backwards.
 */
function meetingsBetween(
  index: MeetingIndex,
  homeId: ID,
  awayId: ID,
  /** The fixture being previewed, which is not one of its own precedents. */
  excludeMatchId: ID,
): { meetings: H2HMeeting[]; record: { home: number; draw: number; away: number } | null } {
  const all = index.get(pairKey(homeId, awayId));
  if (!all?.length) return { meetings: [], record: null };

  const record = { home: 0, draw: 0, away: 0 };
  const meetings: H2HMeeting[] = [];

  for (const m of all) {
    if (m.matchId === excludeMatchId) continue;
    const sameWayRound = m.homeTeamId === homeId;
    const hs = sameWayRound ? m.homeScore : m.awayScore;
    const as = sameWayRound ? m.awayScore : m.homeScore;
    if (hs > as) record.home++;
    else if (hs < as) record.away++;
    else record.draw++;
    if (meetings.length < MEETINGS_PER_STOP) {
      meetings.push({ kickoff: m.kickoff, homeScore: hs, awayScore: as });
    }
  }

  if (!record.home && !record.draw && !record.away) return { meetings: [], record: null };
  return { meetings, record };
}

interface PastMeeting {
  matchId: ID;
  kickoff: ISODate;
  homeTeamId: ID;
  homeScore: number;
  awayScore: number;
}
type MeetingIndex = Map<string, PastMeeting[]>;

/** Unordered pair, so one lookup serves a fixture and its reverse. */
const pairKey = (a: ID, b: ID) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Every finished match, indexed by the pair who played it.
 *
 * Built once per request rather than scanning every snapshot per fixture: sixty
 * stops against forty-odd competitions of match lists is a few million
 * comparisons done sixty times, which is exactly the shape of an accidentally
 * quadratic page.
 */
function indexMeetings(snapshots: DatasetSnapshot[]): MeetingIndex {
  const index: MeetingIndex = new Map();
  for (const s of snapshots) {
    for (const m of s.matches) {
      if (m.status !== 'FINISHED') continue;
      if (m.homeScore === null || m.awayScore === null) continue;
      const key = pairKey(m.homeTeamId, m.awayTeamId);
      const list = index.get(key);
      const entry: PastMeeting = {
        matchId: m.id,
        kickoff: m.kickoff,
        homeTeamId: m.homeTeamId,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
      };
      if (list) list.push(entry);
      else index.set(key, [entry]);
    }
  }
  for (const list of index.values()) list.sort((a, b) => b.kickoff.localeCompare(a.kickoff));
  return index;
}

export function buildTour(nowISO: string): TourStop[] {
  const snapshots = allSnapshots();
  const live = snapshots.filter((s) => s.season.isCurrent);
  const meetings = indexMeetings(snapshots);

  const now = Date.parse(nowISO);
  const horizon = new Date(now + FORWARD_DAYS * 86_400_000).toISOString();
  const floorISO = new Date(now - BACK_DAYS * 86_400_000).toISOString();

  interface Candidate { match: Match; snapshot: DatasetSnapshot; home: Team; away: Team }
  const candidates: Candidate[] = [];

  for (const s of live) {
    const byId = new Map(s.teams.map((t) => [t.id, t]));
    for (const m of s.matches) {
      if (m.status === 'POSTPONED' || m.status === 'CANCELLED') continue;
      // A neutral venue is somewhere the feed does not name, so there is
      // nowhere honest to put the pin.
      if (m.venueKind === 'neutral') continue;
      // Nothing is drawn without a ground, so a club the table does not know is
      // not a candidate at all.
      if (!VENUES[m.homeTeamId]) continue;

      if (m.status === 'SCHEDULED') {
        // A scheduled fixture whose kick-off has passed without a result is a
        // feed that has not caught up, not a match to fly to.
        if (m.kickoff < nowISO || m.kickoff > horizon) continue;
      } else if (m.status === 'FINISHED') {
        if (m.kickoff < floorISO) continue;
      }

      const home = byId.get(m.homeTeamId);
      const away = byId.get(m.awayTeamId);
      if (!home || !away) continue;
      candidates.push({ match: m, snapshot: s, home, away });
    }
  }

  /**
   * Live, then next, then last.
   *
   * Live football leads because it is the only thing on the list a reader could
   * be watching right now. Then the week ahead, in kick-off order — that
   * ordering is what makes the tour read as a clock going round the planet
   * rather than a shuffle. Results come last and only as BACKFILL: on a quiet
   * Tuesday there may be a handful of fixtures on earth, and a finished match
   * still has two clubs and a score.
   */
  const rank = (m: Match) => (isLive(m.status) ? 0 : m.status === 'FINISHED' ? 2 : 1);
  candidates.sort((a, b) => {
    const gap = rank(a.match) - rank(b.match);
    if (gap !== 0) return gap;
    // Fixtures read forwards from now; results read backwards from now.
    return rank(a.match) === 2
      ? b.match.kickoff.localeCompare(a.match.kickoff)
      : a.match.kickoff.localeCompare(b.match.kickoff);
  });

  const stops: TourStop[] = [];
  let lastCity = '';

  for (const c of candidates) {
    if (stops.length >= MAX_STOPS) break;

    const venue = VENUES[c.home.id];
    if (!venue) continue;
    const [lat, lon, name, city] = venue;

    /**
     * Never two in a row in the same place.
     *
     * A Saturday in England is six fixtures within an hour, several of them in
     * London, and a camera that lands on the same square mile three times
     * running has stopped being a tour. Only CONSECUTIVE repeats are skipped —
     * over a whole week a city deserves more than one visit, just not two
     * back to back.
     */
    const cityKey = (city ?? name ?? '').toLowerCase();
    if (cityKey && cityKey === lastCity) continue;
    lastCity = cityKey;

    const prediction = predictMatch(c.home, c.away, { venueKind: c.match.venueKind });
    const { meetings: past, record } = meetingsBetween(
      meetings, c.home.id, c.away.id, c.match.id,
    );
    const floor = regularFloor(c.snapshot);

    stops.push({
      matchId: c.match.id,
      kickoff: c.match.kickoff,
      status: c.match.status,
      competitionId: c.snapshot.competition.id,
      competitionName: c.snapshot.competition.name,
      accentKey: c.snapshot.competition.accentKey,
      lat,
      lon,
      venue: name,
      city,
      country: c.snapshot.competition.country,
      home: team(c.home),
      away: team(c.away),
      odds: {
        home: prediction.homeWin,
        draw: prediction.draw,
        away: prediction.awayWin,
      },
      homeScore: c.match.homeScore,
      awayScore: c.match.awayScore,
      record,
      meetings: past,
      watch: [
        ...playersToWatch(c.snapshot, c.home.id, floor, WATCH_PER_SIDE),
        ...playersToWatch(c.snapshot, c.away.id, floor, WATCH_PER_SIDE),
      ],
    });
  }

  return stops;
}
