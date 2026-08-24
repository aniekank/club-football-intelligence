#!/usr/bin/env node
/**
 * Build a historical edition from StatsBomb open data.
 *
 * Run offline; commit the result. This is deliberately NOT a boot-path adapter:
 * a season is 380 matches at ~3MB of event data each, so ingesting it live
 * would mean a gigabyte of downloads before the first page rendered. The script
 * distils that into a compact snapshot the app loads from disk instantly —
 * the same pattern the parent product used for its historical tournaments.
 *
 *   node scripts/fetch-statsbomb.mjs <competitionId> <seasonId> <ourCompetitionId>
 *   node scripts/fetch-statsbomb.mjs 2 27 epl        # Premier League 2015/16
 *   node scripts/fetch-statsbomb.mjs 11 27 laliga    # LaLiga 2015/16
 *   node scripts/fetch-statsbomb.mjs 12 27 seriea    # Serie A 2015/16
 *   node scripts/fetch-statsbomb.mjs 7 27 ligue1     # Ligue 1 2015/16
 *
 * What is kept and what is dropped matters for the committed size. Every event
 * file carries `freeze_frame` — the position of every player at the moment of
 * each shot — which is the single largest field and is not something any surface
 * here renders. Dropping it is most of the compression.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const OUT_DIR = path.join(process.cwd(), 'src', 'data', 'cache');

const [compId, seasonId, ourId] = process.argv.slice(2);
if (!compId || !seasonId || !ourId) {
  console.error('usage: node scripts/fetch-statsbomb.mjs <competitionId> <seasonId> <ourCompetitionId>');
  process.exit(2);
}

// StatsBomb's pitch is 120 x 80; the domain normalises to 0..100 on both axes.
const PITCH_X = 120;
const PITCH_Y = 80;

const BODY_PART = {
  'Left Foot': 'left_foot', 'Right Foot': 'right_foot',
  Head: 'head', Other: 'other',
};

const SITUATION = {
  'Open Play': 'open_play', 'From Corner': 'corner', 'From Free Kick': 'free_kick',
  'From Throw In': 'set_piece', 'From Counter': 'fast_break',
  'From Keeper': 'open_play', 'From Kick Off': 'open_play',
  'From Goal Kick': 'open_play', Penalty: 'penalty',
};

const OUTCOME = {
  Goal: 'goal', Saved: 'saved', Blocked: 'blocked', Off: 'off_target',
  Wayward: 'off_target', Post: 'post', 'Saved to Post': 'post',
  'Saved Off Target': 'saved', 'Saved Off T': 'saved',
};

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * 3 ** (attempt - 1)));
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'club-football-intelligence/0.1' } });
      if (res.ok) return res.json();
      // A 404 is a permanent answer; retrying it wastes time and bandwidth.
      if (res.status === 404) return null;
    } catch {
      /* retry */
    }
  }
  return null;
}

/** Bounded-concurrency map, so we never open 380 sockets at once. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const code = (name) =>
  name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'UNK';

/**
 * Minutes played, derived from the event stream.
 *
 * StatsBomb has no minutes field: it has a Starting XI event listing the eleven,
 * Substitution events naming who came off (with the replacement in
 * `substitution.replacement`), and Bad Behaviour / Foul Committed events
 * carrying red cards. Everyone still on the pitch at the final whistle played to
 * the end. Getting this right is what makes per-90 rates meaningful; guessing 90
 * for everyone would quietly flatter every substitute.
 */
function computeMinutes(events) {
  const last = events.reduce((m, e) => Math.max(m, e.minute ?? 0), 90);
  const on = new Map();   // playerId -> minute they came on
  const off = new Map();  // playerId -> minute they went off
  const starters = new Set();

  for (const e of events) {
    const type = e.type?.name;
    if (type === 'Starting XI') {
      for (const p of e.tactics?.lineup ?? []) {
        starters.add(p.player.id);
        on.set(p.player.id, 0);
      }
    } else if (type === 'Substitution') {
      if (e.player?.id != null) off.set(e.player.id, e.minute ?? last);
      const rep = e.substitution?.replacement;
      if (rep?.id != null) on.set(rep.id, e.minute ?? last);
    } else if (type === 'Bad Behaviour' || type === 'Foul Committed') {
      const card = e.bad_behaviour?.card?.name ?? e.foul_committed?.card?.name;
      if ((card === 'Red Card' || card === 'Second Yellow') && e.player?.id != null) {
        off.set(e.player.id, e.minute ?? last);
      }
    }
  }

  const minutes = new Map();
  for (const [id, start] of on) {
    minutes.set(id, Math.max(0, (off.get(id) ?? last) - start));
  }
  return { minutes, starters, last };
}

async function main() {
  console.log(`\nStatsBomb → competition ${compId}, season ${seasonId} → "${ourId}"`);

  const matchList = await getJson(`${BASE}/matches/${compId}/${seasonId}.json`);
  if (!matchList?.length) {
    console.error('no matches found');
    process.exit(1);
  }
  const seasonName = matchList[0].season.season_name;
  const competitionName = matchList[0].competition.competition_name;
  console.log(`${competitionName} ${seasonName} — ${matchList.length} matches`);

  const teams = new Map();
  const players = new Map();
  const statsByPlayer = new Map();
  const ratingIgnored = 0; // StatsBomb publishes no match rating

  for (const m of matchList) {
    for (const side of [m.home_team, m.away_team]) {
      const id = String(side.home_team_id ?? side.away_team_id);
      const name = side.home_team_name ?? side.away_team_name;
      if (!teams.has(id)) {
        teams.set(id, {
          id, name, shortName: name, code: code(name),
          country: side.country?.name ?? '', countryCode: '',
          crestUrl: null, primaryColor: null, secondaryColor: null,
          venue: m.stadium?.name ?? null,
          manager: side.managers?.[0]?.name
            ? { name: side.managers[0].name, appointedAt: null }
            : null,
          elo: 1500, attackRating: 50, defenseRating: 50,
        });
      }
    }
  }

  console.log(`teams: ${teams.size} · downloading events…`);

  let done = 0;
  const matches = await mapLimit(matchList, 8, async (m) => {
    // Lineups alongside events. The event stream carries only a player's full
    // REGISTERED name — "Sergio Leonel Agüero del Castillo" — while the lineup
    // file carries the nickname they are actually known by, plus shirt number
    // and nationality. Three fields that would otherwise be null, and one that
    // would otherwise make every Spanish player's page look broken.
    const [events, lineupFile] = await Promise.all([
      getJson(`${BASE}/events/${m.match_id}.json`),
      getJson(`${BASE}/lineups/${m.match_id}.json`),
    ]);
    done += 1;
    if (done % 40 === 0) process.stdout.write(`  ${done}/${matchList.length}\r`);
    if (!events) return null;

    const homeId = String(m.home_team.home_team_id);
    const awayId = String(m.away_team.away_team_id);
    const teamIdByName = new Map([
      [m.home_team.home_team_name, homeId],
      [m.away_team.away_team_name, awayId],
    ]);

    // playerId -> { nickname, shirt, country }
    const identity = new Map();
    for (const side of lineupFile ?? []) {
      for (const p of side.lineup ?? []) {
        identity.set(String(p.player_id), {
          display: p.player_nickname || p.player_name,
          full: p.player_name,
          shirt: p.jersey_number ?? null,
          country: p.country?.name ?? null,
        });
      }
    }

    const { minutes, starters, last } = computeMinutes(events);
    const shots = [];
    const lineups = { [homeId]: [], [awayId]: [] };
    const teamAgg = {
      [homeId]: { shots: 0, sot: 0, xg: 0, passes: 0, passesOk: 0, fouls: 0, corners: 0, yellow: 0, red: 0 },
      [awayId]: { shots: 0, sot: 0, xg: 0, passes: 0, passesOk: 0, fouls: 0, corners: 0, yellow: 0, red: 0 },
    };

    const seen = new Set();

    for (const e of events) {
      const type = e.type?.name;
      const teamId = teamIdByName.get(e.team?.name);
      if (!teamId) continue;
      const pid = e.player?.id != null ? String(e.player.id) : null;

      // Player identity, first time we see them with a position.
      if (pid && !players.has(pid) && e.player?.name) {
        const ident = identity.get(pid);
        const posName = e.position?.name ?? '';
        const position =
          posName.includes('Goalkeeper') ? 'GK'
          : posName.includes('Back') ? 'DF'
          : posName.includes('Forward') || posName.includes('Striker') || posName.includes('Wing') ? 'FW'
          : 'MF';
        players.set(pid, {
          id: pid,
          name: ident?.display ?? e.player.name,
          // Keep the registered name when it differs — it is what a search for
          // "Fàbregas i Soler" would match.
          ...(ident?.full && ident.full !== (ident.display ?? '') ? { fullName: ident.full } : {}),
          teamId,
          affiliations: [{ teamId, from: m.match_date, to: null, onLoan: false }],
          shirtNumber: ident?.shirt ?? null, position,
          detailedPosition: position === 'GK' ? 'GK' : position === 'DF' ? 'CB' : position === 'FW' ? 'ST' : 'CM',
          age: null, birthDate: null, nationality: ident?.country ?? null, photoUrl: null,
          heightCm: null, foot: null, marketValueEur: null,
        });
      }

      if (pid && !seen.has(pid)) {
        seen.add(pid);
        lineups[teamId]?.push({
          playerId: pid,
          name: players.get(pid)?.name ?? e.player.name,
          position: players.get(pid)?.position ?? 'MF',
          shirtNumber: identity.get(pid)?.shirt ?? null,
          isStarter: starters.has(Number(pid)),
          minutesPlayed: minutes.get(Number(pid)) ?? 0,
          rating: null, // StatsBomb publishes no rating; null, never a fabricated one
        });
      }

      const agg = teamAgg[teamId];
      const st = pid ? ensureStats(statsByPlayer, pid, ourId, seasonName) : null;

      if (type === 'Shot') {
        const xg = e.shot?.statsbomb_xg ?? 0;
        const outcome = OUTCOME[e.shot?.outcome?.name] ?? 'off_target';
        agg.shots += 1;
        agg.xg += xg;
        if (outcome === 'goal' || outcome === 'saved') agg.sot += 1;
        if (pid) {
          st.shots += 1;
          st.xG += xg;
          if (outcome === 'goal' || outcome === 'saved') st.shotsOnTarget += 1;
          if (outcome === 'goal') st.goals += 1;
        }
        const [x, y] = e.location ?? [0, 0];
        shots.push({
          id: e.id,
          matchId: String(m.match_id),
          minute: e.minute ?? 0,
          teamId,
          playerId: pid ?? '',
          x: Math.max(0, Math.min(100, (x / PITCH_X) * 100)),
          y: Math.max(0, Math.min(100, (y / PITCH_Y) * 100)),
          xG: xg,
          xGOnTarget: null,
          bodyPart: BODY_PART[e.shot?.body_part?.name] ?? 'other',
          situation: e.shot?.type?.name === 'Penalty' ? 'penalty'
            : SITUATION[e.play_pattern?.name] ?? 'open_play',
          outcome,
          isBigChance: xg >= 0.3,
        });
      } else if (type === 'Pass') {
        agg.passes += 1;
        if (!e.pass?.outcome) agg.passesOk += 1;
        if (pid) {
          st.passes += 1;
          if (!e.pass?.outcome) st.passesCompleted += 1;
          if (e.pass?.shot_assist) st.keyPasses += 1;
          if (e.pass?.goal_assist) st.assists += 1;
          // The final third begins at x = 80 on a 120-long pitch.
          if ((e.pass?.end_location?.[0] ?? 0) >= 80 && (e.location?.[0] ?? 0) < 80) {
            st.passesFinalThird += 1;
          }
        }
        if (e.pass?.type?.name === 'Corner') agg.corners += 1;
      } else if (type === 'Foul Committed') {
        agg.fouls += 1;
        if (st) st.foulsCommitted += 1;
        const card = e.foul_committed?.card?.name;
        if (card === 'Yellow Card') { agg.yellow += 1; if (st) st.yellowCards += 1; }
        if (card === 'Red Card' || card === 'Second Yellow') { agg.red += 1; if (st) st.redCards += 1; }
      } else if (type === 'Bad Behaviour') {
        const card = e.bad_behaviour?.card?.name;
        if (card === 'Yellow Card') { agg.yellow += 1; if (st) st.yellowCards += 1; }
        if (card === 'Red Card' || card === 'Second Yellow') { agg.red += 1; if (st) st.redCards += 1; }
      } else if (type === 'Duel' && st) {
        st.duelsTotal += 1;
        if ((e.duel?.outcome?.name ?? '').includes('Won')) st.duelsWon += 1;
        if (e.duel?.type?.name === 'Tackle') {
          st.tackles += 1;
          if ((e.duel?.outcome?.name ?? '').includes('Won')) st.tacklesWon += 1;
        }
      } else if (type === 'Interception' && st) {
        st.interceptions += 1;
      } else if (type === 'Clearance' && st) {
        st.clearances += 1;
      } else if (type === 'Ball Recovery' && st) {
        st.ballRecoveries += 1;
      } else if (type === 'Carry' && st) {
        st.progressiveCarries += 1;
      } else if (type === 'Dribble' && st) {
        st.dribblesAttempted += 1;
        if (e.dribble?.outcome?.name === 'Complete') st.dribblesCompleted += 1;
      } else if (type === 'Goal Keeper' && st) {
        if ((e.goalkeeper?.type?.name ?? '').includes('Save')) st.saves += 1;
      }
    }

    // Appearances and minutes, once per match.
    for (const [numericId, mins] of minutes) {
      const pid = String(numericId);
      const st = statsByPlayer.get(pid);
      if (!st || mins <= 0) continue;
      st.minutes += mins;
      st.appearances += 1;
      if (starters.has(numericId)) st.starts += 1;
    }

    const hs = m.home_score;
    const as = m.away_score;
    for (const [teamId, conceded] of [[homeId, as], [awayId, hs]]) {
      if (conceded !== 0) continue;
      for (const slot of lineups[teamId] ?? []) {
        const st = statsByPlayer.get(slot.playerId);
        if (st && (slot.minutesPlayed ?? 0) >= 90) st.cleanSheets += 1;
      }
    }

    const mkStats = (teamId) => {
      const a = teamAgg[teamId];
      const totalPasses = teamAgg[homeId].passes + teamAgg[awayId].passes;
      return {
        teamId,
        possession: totalPasses > 0 ? Math.round((a.passes / totalPasses) * 100) : null,
        shots: a.shots, shotsOnTarget: a.sot,
        xG: Math.round(a.xg * 100) / 100,
        xGOnTarget: null,
        corners: a.corners, fouls: a.fouls, offsides: null,
        passes: a.passes,
        passAccuracy: a.passes > 0 ? Math.round((a.passesOk / a.passes) * 1000) / 10 : null,
        bigChances: null, saves: null,
        yellowCards: a.yellow, redCards: a.red,
        fieldTilt: null, ppda: null,
      };
    };

    return {
      id: String(m.match_id),
      competitionId: ourId,
      seasonId: `${ourId}-${seasonName.replace('/', '-')}`,
      matchweek: m.match_week ?? null,
      roundLabel: m.match_week ? `Matchweek ${m.match_week}` : 'Fixture',
      kickoff: `${m.match_date}T${m.kick_off ?? '15:00:00.000'}`.replace('.000', 'Z'),
      status: 'FINISHED',
      minute: last,
      venueKind: 'home-away',
      venue: m.stadium?.name ?? null,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeScore: hs,
      awayScore: as,
      homeScoreHT: null,
      awayScoreHT: null,
      penalties: null,
      teamStats: { [homeId]: mkStats(homeId), [awayId]: mkStats(awayId) },
      events: [],
      shots,
      lineups,
      referee: m.referee?.name ?? null,
    };
  });

  const ok = matches.filter(Boolean);
  console.log(`\nevents ingested: ${ok.length}/${matchList.length}`);

  const payload = {
    kind: 'statsbomb-edition',
    competitionId: ourId,
    seasonLabel: seasonName,
    competitionName,
    generatedAt: new Date().toISOString(),
    teams: [...teams.values()],
    players: [...players.values()],
    playerStats: [...statsByPlayer.values()].map((s) => ({
      ...s, xG: Math.round(s.xG * 100) / 100, xA: Math.round(s.xA * 100) / 100,
    })),
    matches: ok,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `statsbomb-${ourId}-${seasonName.replace('/', '-')}.json`);
  await fs.writeFile(file, JSON.stringify(payload));
  const { size } = await fs.stat(file);

  const shotCount = ok.reduce((n, m) => n + m.shots.length, 0);
  console.log(`teams ${payload.teams.length} · players ${payload.players.length} · shots ${shotCount}`);
  console.log(`wrote ${path.relative(process.cwd(), file)} (${(size / 1e6).toFixed(1)} MB)`);
  void ratingIgnored;
}

function ensureStats(map, playerId, competitionId, seasonName) {
  let s = map.get(playerId);
  if (!s) {
    s = {
      playerId, seasonId: `${competitionId}-${seasonName.replace('/', '-')}`, competitionId,
      minutes: 0, appearances: 0, starts: 0, goals: 0, assists: 0, xG: 0, xA: 0,
      shots: 0, shotsOnTarget: 0, bigChancesCreated: 0, bigChancesMissed: 0,
      passes: 0, passesCompleted: 0, keyPasses: 0, passesFinalThird: 0,
      progressiveCarries: 0, tackles: 0, tacklesWon: 0, interceptions: 0,
      clearances: 0, ballRecoveries: 0, duelsWon: 0, duelsTotal: 0, aerialsWon: 0,
      touches: 0, touchesInBox: 0, dribblesCompleted: 0, dribblesAttempted: 0,
      dispossessed: 0, yellowCards: 0, redCards: 0, foulsCommitted: 0, foulsWon: 0,
      saves: 0, goalsConceded: 0, cleanSheets: 0, averageRating: null,
    };
    map.set(playerId, s);
  }
  return s;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
