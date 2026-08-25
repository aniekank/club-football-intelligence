import { allSnapshots } from '@/data/store';
import { fetchClubHistory } from '@/data/providers/fotmobClub';
import { predictMatch } from '@/analytics/poisson';
import { playersToWatch, regularFloor, type WatchPlayer } from '@/server/watch';
import type { DatasetSnapshot, ID, ISODate, Match, MatchStatus, Team } from '@/domain/types';

/**
 * The next football on earth, in the order it happens, with somewhere to point.
 *
 * ── Why the globe needed a server module at all ────────────────────────────
 * A globe that flies to the next match is only as honest as its pins. Every
 * number a stop carries — the model's split, the previous meetings, who is
 * worth watching — is computed here, once, on the server, from the same
 * functions the match page uses. The client component receives values and
 * draws them; it never derives a claim of its own. A canvas that computed its
 * own odds would be a second model, and the two would disagree.
 *
 * ── Coordinates are FOUND, never guessed ───────────────────────────────────
 * The pin is the home club's ground, from the venue coordinates the feed
 * publishes. Where a club has none, the fixture is dropped from the tour rather
 * than pinned to its country's centroid: a stadium placed in the middle of
 * Brazil is not a rough answer, it is a wrong one, and on a map it looks
 * exactly as confident as a right one.
 *
 * A neutral-venue fixture is dropped for the same reason. The home club's
 * ground is the wrong place by definition when the match is somewhere else, and
 * "somewhere else" is not in the feed.
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
  competitionName: string;
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

/** Stops on the tour. More than a dozen is a screensaver, not a briefing. */
const MAX_STOPS = 8;
/** How many fixtures to consider before giving up on filling the tour. */
const CANDIDATES = 28;
/** A page render cannot wait on a cold club lookup for long. */
const LOOKUP_MS = 2500;

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
  snapshots: DatasetSnapshot[],
  homeId: ID,
  awayId: ID,
  /** The fixture being previewed, which is not one of its own precedents. */
  excludeMatchId: ID,
  limit = 5,
): { meetings: H2HMeeting[]; record: { home: number; draw: number; away: number } | null } {
  const all: H2HMeeting[] = [];

  for (const s of snapshots) {
    for (const m of s.matches) {
      if (m.id === excludeMatchId) continue;
      if (m.status !== 'FINISHED') continue;
      if (m.homeScore === null || m.awayScore === null) continue;
      const sameWayRound = m.homeTeamId === homeId && m.awayTeamId === awayId;
      const reversed = m.homeTeamId === awayId && m.awayTeamId === homeId;
      if (!sameWayRound && !reversed) continue;

      all.push({
        kickoff: m.kickoff,
        homeScore: sameWayRound ? m.homeScore : m.awayScore,
        awayScore: sameWayRound ? m.awayScore : m.homeScore,
        competitionName: s.competition.name,
      });
    }
  }

  if (!all.length) return { meetings: [], record: null };

  all.sort((a, b) => b.kickoff.localeCompare(a.kickoff));
  const record = { home: 0, draw: 0, away: 0 };
  for (const m of all) {
    if (m.homeScore > m.awayScore) record.home++;
    else if (m.homeScore < m.awayScore) record.away++;
    else record.draw++;
  }

  return { meetings: all.slice(0, limit), record };
}

/** A cold club lookup cannot hold a page render open. */
async function coordinatesFor(teamId: ID): Promise<{ lat: number; lon: number; venue: string | null; city: string | null } | null> {
  const history = await Promise.race([
    fetchClubHistory(teamId),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_MS)),
  ]);
  const v = history?.venue;
  if (!v || v.lat === null || v.lon === null) return null;
  return { lat: v.lat, lon: v.lon, venue: v.name, city: v.city };
}

export async function buildTour(nowISO: string): Promise<TourStop[]> {
  const snapshots = allSnapshots();
  const live = snapshots.filter((s) => s.season.isCurrent);

  interface Candidate { match: Match; snapshot: DatasetSnapshot; home: Team; away: Team }
  const candidates: Candidate[] = [];

  for (const s of live) {
    const byId = new Map(s.teams.map((t) => [t.id, t]));
    for (const m of s.matches) {
      if (m.status === 'POSTPONED' || m.status === 'CANCELLED') continue;
      // A neutral venue is somewhere the feed does not name, so there is
      // nowhere honest to put the pin.
      if (m.venueKind === 'neutral') continue;
      // A scheduled fixture whose kick-off has passed without a result is a
      // feed that has not caught up, not a match to fly to.
      if (m.status === 'SCHEDULED' && m.kickoff < nowISO) continue;

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
   * be watching right now. Then the next kick-off anywhere. Results come last
   * and only as BACKFILL — on a quiet Tuesday there may be three fixtures on
   * the planet worth flying to, and a globe with three pins is not a tour. A
   * finished match still has a place, two clubs and a score, so it is a real
   * stop rather than filler; it is simply not what anyone opened the page for.
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

  const shortlist = candidates.slice(0, CANDIDATES);

  // Resolved together rather than one at a time: nearly all of these are cache
  // hits, and the few that are not should not queue behind each other.
  const located = await Promise.all(
    shortlist.map(async (c) => ({ c, place: await coordinatesFor(c.home.id) })),
  );

  const stops: TourStop[] = [];
  const seenCity = new Set<string>();

  for (const { c, place } of located) {
    if (stops.length >= MAX_STOPS) break;
    if (!place) continue;

    // The tour is meant to travel. Two consecutive stops in one city is a
    // camera that has not moved, which is the one thing this cannot be.
    const cityKey = (place.city ?? place.venue ?? '').toLowerCase();
    if (cityKey && seenCity.has(cityKey)) continue;
    if (cityKey) seenCity.add(cityKey);

    const prediction = predictMatch(c.home, c.away, { venueKind: c.match.venueKind });
    const { meetings, record } = meetingsBetween(snapshots, c.home.id, c.away.id, c.match.id);
    const floor = regularFloor(c.snapshot);

    stops.push({
      matchId: c.match.id,
      kickoff: c.match.kickoff,
      status: c.match.status,
      competitionId: c.snapshot.competition.id,
      competitionName: c.snapshot.competition.name,
      accentKey: c.snapshot.competition.accentKey,
      lat: place.lat,
      lon: place.lon,
      venue: place.venue,
      city: place.city,
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
      meetings,
      watch: [
        ...playersToWatch(c.snapshot, c.home.id, floor, 2),
        ...playersToWatch(c.snapshot, c.away.id, floor, 2),
      ],
    });
  }

  return stops;
}
