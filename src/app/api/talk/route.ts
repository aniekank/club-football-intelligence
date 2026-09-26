import { NextResponse } from 'next/server';
import { resolveActive } from '@/server/active';
import { narrativeContext } from '@/server/narrative';
import { generateInsights } from '@/ai/narratives';
import { predictMatch } from '@/analytics/poisson';
import type { Match, Team } from '@/domain/types';

export const dynamic = 'force-dynamic';

/**
 * Talking points: what a person in a car would actually say about the league right now.
 *
 * Built for Motion (motionpage.link/tapes), whose passengers talk football between songs, but it is a plain
 * public read: small, cached, no keys. It carries FACTS with their numbers, not prose to paste: the caller
 * puts the sentence in its own voice, and every claim in it comes from the same arithmetic the site shows
 * (the Poisson model for a fixture, the table, the storyline engine). Nothing here is invented, and a
 * model number always travels labelled as the model's.
 *
 *   GET /api/talk?competition=epl   (default epl)
 *   → { app, competition, url, generatedAt, points: Point[] }
 *
 * A point: { kind, text, home?, away?, score?, minute?, kickoff?, model?, link }
 *   kind  live      a match on now (score, minute)
 *         result    the latest round's results, biggest margin first
 *         fixture   the next round's tightest and heaviest matches, with the model's 1X2 (model: {home, draw, away})
 *                   (rounds, not a date window: an international break leaves a fortnight with no football)
 *         table     who leads, and by how much
 *         story     the storyline engine's lead insights (title race, relegation, form, xG luck)
 */
type Point = {
  kind: 'live' | 'result' | 'fixture' | 'table' | 'story';
  text: string;
  home?: string;
  away?: string;
  score?: string;
  minute?: number;
  kickoff?: string;
  model?: { home: number; draw: number; away: number };
  link: string;
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://club-football-intelligence.onrender.com').replace(/\/$/, '');
const pct = (v: number) => Math.round(v * 100);

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('competition') ?? 'epl';
  const { competition, snapshot, forecast } = resolveActive(id);
  const headers = {
    'Cache-Control': 'public, max-age=300, s-maxage=300',
    'Access-Control-Allow-Origin': '*',
  };
  if (!snapshot) {
    return NextResponse.json({ app: 'cfi', competition: competition.id, url: SITE, generatedAt: new Date().toISOString(), points: [] }, { headers });
  }

  const team = new Map<string, Team>(snapshot.teams.map((t) => [t.id, t]));
  const name = (tid: string) => team.get(tid)?.shortName || team.get(tid)?.name || 'TBC';
  const q = `?competition=${competition.id}`;
  const matchLink = (m: Match) => `${SITE}/matches/${m.id}${q}`;
  const now = Date.now();
  const points: Point[] = [];

  // live
  for (const m of snapshot.matches.filter((x) => x.status === 'LIVE' || x.status === 'HALFTIME').slice(0, 3)) {
    const score = `${m.homeScore ?? 0}-${m.awayScore ?? 0}`;
    points.push({
      kind: 'live', home: name(m.homeTeamId), away: name(m.awayTeamId), score, minute: m.minute,
      text: `${name(m.homeTeamId)} ${score} ${name(m.awayTeamId)}, ${m.status === 'HALFTIME' ? 'half-time' : `${m.minute}'`}`,
      link: matchLink(m),
    });
  }

  // the latest round's results (the last ten finished), the biggest margins first
  const recent = snapshot.matches
    .filter((m) => m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .slice(0, 10)
    .sort((a, b) => Math.abs(b.homeScore! - b.awayScore!) - Math.abs(a.homeScore! - a.awayScore!))
    .slice(0, 3);
  for (const m of recent) {
    const score = `${m.homeScore}-${m.awayScore}`;
    points.push({ kind: 'result', home: name(m.homeTeamId), away: name(m.awayTeamId), score, kickoff: m.kickoff,
      text: `${name(m.homeTeamId)} ${score} ${name(m.awayTeamId)}`, link: matchLink(m) });
  }

  // the next round (the next ten scheduled): the tightest match and the most one-sided, with the model's 1X2
  const upcoming = snapshot.matches
    .filter((m) => m.status === 'SCHEDULED' && Date.parse(m.kickoff) > now)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 10)
    .flatMap((m) => {
      const h = team.get(m.homeTeamId), a = team.get(m.awayTeamId);
      if (!h || !a) return [];
      const p = predictMatch(h, a, { venueKind: m.venueKind });
      return [{ m, p, spread: Math.max(p.homeWin, p.draw, p.awayWin) - Math.min(p.homeWin, p.draw, p.awayWin) }];
    })
    .sort((x, y) => x.spread - y.spread);
  const picks = [...new Set([upcoming[0], upcoming[1], upcoming[upcoming.length - 1]].filter(Boolean))];
  for (const { m, p } of picks as typeof upcoming) {
    const model = { home: pct(p.homeWin), draw: pct(p.draw), away: pct(p.awayWin) };
    points.push({
      kind: 'fixture', home: name(m.homeTeamId), away: name(m.awayTeamId), kickoff: m.kickoff, model,
      text: `${name(m.homeTeamId)} v ${name(m.awayTeamId)}: model ${model.home}/${model.draw}/${model.away} (home/draw/away)`,
      link: matchLink(m),
    });
  }

  // the table and the stories
  const ctx = narrativeContext(snapshot, forecast?.forecasts ?? []);
  const rows = snapshot.standings ?? [];
  if (rows.length >= 2 && rows[0]!.played > 0) {
    const gap = rows[0]!.points - rows[1]!.points;
    points.push({ kind: 'table', home: name(rows[0]!.teamId), away: name(rows[1]!.teamId),
      text: gap === 0 ? `${name(rows[0]!.teamId)} top on goal difference from ${name(rows[1]!.teamId)}` : `${name(rows[0]!.teamId)} top, ${gap} clear of ${name(rows[1]!.teamId)}`,
      link: `${SITE}/table${q}` });
  }
  if (ctx) {
    for (const i of generateInsights(ctx).filter((x) => x.severity !== 'low').slice(0, 3)) {
      // the title names it ("Liverpool v Arsenal"), the body's first sentence is the claim; either alone reads half a thought
      const first = i.body.split(/(?<=[.!?])\s+/)[0] ?? i.title;
      points.push({ kind: 'story', text: `${i.title.replace(/[.:]$/, '')}: ${first}`, link: `${SITE}/storylines${q}` });
    }
  }

  return NextResponse.json(
    { app: 'cfi', competition: competition.id, competitionName: competition.name, url: SITE, generatedAt: new Date().toISOString(), points },
    { headers },
  );
}
