import type { DatasetSnapshot, SeasonForecast } from '@/domain/types';
import { extractTeams, extractPlayers, normalize } from './resolver';
import { computePer90, leaderboard, METRIC_LABELS } from '@/server/players';

/**
 * Natural-language ask over the active edition.
 *
 * Deterministic intent matching, not a language model. Two reasons, and the
 * second is the important one:
 *
 *   1. It is free, instant and offline.
 *   2. It CANNOT make a number up. Every answer here is read out of the
 *      snapshot, and every answer ships the rows it was read from, so the
 *      reader can check the claim rather than trust it. A model that invents a
 *      plausible xG figure is worse than one that says "I don't know", because
 *      the invented figure is indistinguishable from a real one.
 *
 * When a question is not understood, it says so and suggests what it CAN answer,
 * rather than guessing at an intent and confidently answering the wrong question.
 */

export interface AskResult {
  query: string;
  intent: string;
  /** Prose answer. Always backed by `rows`. */
  answer: string;
  columns: string[];
  rows: (string | number)[][];
  /** Where to go for the full picture. */
  href?: string;
  followUps: string[];
  understood: boolean;
}

export interface AskContext {
  snapshot: DatasetSnapshot;
  forecasts: SeasonForecast[];
  competitionId: string;
  seasonParam: string;
}

const pct = (v: number | null) =>
  v === null ? '—' : v > 0 && v < 0.01 ? '<1%' : `${Math.round(v * 100)}%`;
const num = (v: number, d = 2) => v.toFixed(d);
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th');
};

/** Metric synonyms → the field a question is really about. */
const METRIC_WORDS: { words: string[]; key: string; per90Default?: boolean }[] = [
  { words: ['goal', 'goals', 'scorer', 'scorers', 'scoring'], key: 'goals' },
  { words: ['assist', 'assists'], key: 'assists' },
  { words: ['xg', 'expected goals'], key: 'xG' },
  { words: ['xa', 'expected assists'], key: 'xA' },
  { words: ['shot', 'shots'], key: 'shots' },
  { words: ['chance', 'chances', 'key pass', 'key passes', 'created'], key: 'keyPasses' },
  { words: ['tackle', 'tackles'], key: 'tackles' },
  { words: ['interception', 'interceptions'], key: 'interceptions' },
  { words: ['recovery', 'recoveries'], key: 'ballRecoveries' },
  { words: ['dribble', 'dribbles'], key: 'dribblesCompleted' },
  { words: ['save', 'saves'], key: 'saves' },
  { words: ['clean sheet', 'clean sheets'], key: 'cleanSheets' },
  { words: ['minute', 'minutes'], key: 'minutes' },
];

function detectMetric(q: string): { key: string } | null {
  const n = normalize(q);
  // Longest phrase first, so "expected goals" beats "goals".
  const sorted = METRIC_WORDS.flatMap((m) => m.words.map((w) => ({ w, key: m.key })))
    .sort((a, b) => b.w.length - a.w.length);
  for (const { w, key } of sorted) {
    if (new RegExp(`\\b${w}\\b`).test(n)) return { key };
  }
  return null;
}

const has = (q: string, ...words: string[]) => {
  const n = normalize(q);
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(n));
};

export function ask(ctx: AskContext, query: string): AskResult {
  const { snapshot } = ctx;
  const q = query.trim();
  const suffix = ctx.seasonParam
    ? `?competition=${ctx.competitionId}&season=${ctx.seasonParam}`
    : `?competition=${ctx.competitionId}`;

  if (normalize(q).length < 2) return unknown(q);

  const teams = extractTeams(snapshot, q, 2);
  const players = extractPlayers(snapshot, q, 2);
  const forecastById = new Map(ctx.forecasts.map((f) => [f.teamId, f]));
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));
  const per90 = has(q, 'per 90', 'per90', 'per game', 'rate');

  // ── Leaderboards ─────────────────────────────────────────────────────────
  const metric = detectMetric(q);
  if (metric && has(q, 'who', 'most', 'top', 'best', 'leading', 'leader', 'leaders')) {
    const rows = leaderboard(snapshot, metric.key, { per90, limit: 10 });
    if (rows.length) {
      const best = rows[0]!;
      const label = (METRIC_LABELS[metric.key] ?? metric.key).toLowerCase();
      return {
        query: q, intent: 'leaderboard', understood: true,
        answer:
          `${best.player.name} leads on ${num(best.value, Number.isInteger(best.value) ? 0 : 2)} ` +
          `${label}${per90 ? ' per 90' : ''} for ${best.team?.shortName ?? 'their club'}.`,
        columns: ['#', 'Player', 'Club', per90 ? `${label} / 90` : label],
        rows: rows.map((r, i) => [
          i + 1, r.player.name, r.team?.shortName ?? '',
          num(r.value, Number.isInteger(r.value) ? 0 : 2),
        ]),
        href: `/players${suffix}`,
        followUps: ['Who has the most assists?', 'Who leads on xG per 90?'],
      };
    }
  }

  // ── The table itself ─────────────────────────────────────────────────────
  if (has(q, 'table', 'standings', 'top', 'leading', 'first', 'bottom', 'last')) {
    const bottom = has(q, 'bottom', 'last', 'worst', 'relegation');
    const rows = bottom ? snapshot.standings.slice(-5) : snapshot.standings.slice(0, 5);
    if (rows.length) {
      const lead = snapshot.standings[0];
      const leadTeam = lead ? teamById.get(lead.teamId) : undefined;
      return {
        query: q, intent: 'table', understood: true,
        answer: bottom
          ? `${teamById.get(rows[0]!.teamId)?.name ?? ''} are ${ordinal(rows[0]!.rank)} in the ${snapshot.competition.name}.`
          : `${leadTeam?.name ?? 'The leaders'} top the ${snapshot.competition.name} on ${lead?.points ?? 0} points.`,
        columns: ['#', 'Club', 'Pl', 'Pts', 'GD'],
        rows: rows.map((r) => [
          r.rank, teamById.get(r.teamId)?.name ?? r.teamId, r.played, r.points, r.goalDifference,
        ]),
        href: `/table${suffix}`,
        followUps: [`Who wins the ${snapshot.competition.shortName}?`, 'Who is going down?'],
      };
    }
  }

  // ── Who is going down / who is going up ──────────────────────────────────
  if (
    !teams.length &&
    has(
      q,
      // Past and present tense both matter: a live season is asked "who is
      // going down", a completed one "who went down".
      'going down', 'go down', 'went down', 'goes down', 'relegated', 'relegation',
      'drop', 'dropped', 'dropping', 'survive', 'survived', 'safe', 'demoted',
    )
  ) {
    const zone = snapshot.competition.zones.find((z) => z.kind === 'relegation');
    const inTrouble = snapshot.standings
      .filter((r) => r.relegationProbability !== null)
      .sort((a, b) => (b.relegationProbability ?? 0) - (a.relegationProbability ?? 0))
      .slice(0, 6);

    // A finished season has no probabilities left — it has facts. Answer with
    // who actually went down rather than with an empty forecast table.
    if (!inTrouble.length && zone) {
      const relegated = snapshot.standings.filter((r) => r.rank >= zone.fromRank);
      if (relegated.length) {
        return {
          query: q, intent: 'relegation-final', understood: true,
          answer:
            `${relegated.map((r) => teamById.get(r.teamId)?.name ?? r.teamId).join(', ')} ` +
            `went down from the ${snapshot.competition.name} in ${snapshot.season.label}.`,
          columns: ['#', 'Club', 'Pts', 'GD'],
          rows: relegated.map((r) => [
            r.rank, teamById.get(r.teamId)?.name ?? r.teamId, r.points, r.goalDifference,
          ]),
          href: `/table${suffix}`,
          followUps: ['Show me the table'],
        };
      }
    }

    if (inTrouble.length) {
      const worst = inTrouble[0]!;
      return {
        query: q, intent: 'relegation-odds', understood: true,
        answer:
          `${teamById.get(worst.teamId)?.name ?? ''} are most at risk, going down in ` +
          `${pct(worst.relegationProbability)} of simulated seasons.`,
        columns: ['Club', 'Pos', 'Pts', 'Relegation'],
        rows: inTrouble.map((r) => [
          teamById.get(r.teamId)?.name ?? r.teamId, ordinal(r.rank), r.points,
          pct(r.relegationProbability),
        ]),
        href: `/table${suffix}`,
        followUps: ['Show me the table'],
      };
    }
  }

  // ── Title / relegation odds for a named club ─────────────────────────────
  if (teams.length === 1 && has(q, 'title', 'win', 'champion', 'relegated', 'relegation', 'top four', 'top 4', 'chance', 'chances', 'odds')) {
    const team = teams[0]!;
    const f = forecastById.get(team.id);
    const row = snapshot.standings.find((r) => r.teamId === team.id);
    if (f && row) {
      const wantsRelegation = has(q, 'relegated', 'relegation', 'go down', 'drop');
      const headline = wantsRelegation
        ? `${team.name} are relegated in ${pct(f.relegation)} of simulated seasons.`
        : `${team.name} win the ${snapshot.competition.name} in ${pct(f.winTitle)} of simulated seasons.`;
      return {
        query: q, intent: 'season-odds', understood: true,
        answer:
          `${headline} They are ${ordinal(row.rank)} on ${row.points} points, with a projected ` +
          `finish of ${num(f.projectedPoints.p50, 0)} (likely ${f.projectedPoints.p10}–${f.projectedPoints.p90}).`,
        columns: ['Outcome', 'Probability'],
        rows: [
          ['Win the league', pct(f.winTitle)],
          ['Top four', pct(f.top4)],
          ['European place', pct(f.europeanQualification)],
          ['Relegation', pct(f.relegation)],
        ],
        href: `/teams/${team.id}${suffix}`,
        followUps: [`How is ${team.shortName} performing against xG?`, `Who is ${team.shortName}'s top scorer?`],
      };
    }
  }

  // ── Two clubs compared ───────────────────────────────────────────────────
  if (teams.length === 2) {
    const [a, b] = teams as [typeof teams[0], typeof teams[0]];
    const ra = snapshot.standings.find((r) => r.teamId === a.id);
    const rb = snapshot.standings.find((r) => r.teamId === b.id);
    if (ra && rb) {
      const better = ra.rank < rb.rank ? a : b;
      return {
        query: q, intent: 'team-comparison', understood: true,
        answer:
          `${better.name} are ahead: ${ordinal(ra.rank)} on ${ra.points} against ` +
          `${ordinal(rb.rank)} on ${rb.points}.`,
        columns: ['', a.shortName, b.shortName],
        rows: [
          ['Position', ordinal(ra.rank), ordinal(rb.rank)],
          ['Points', ra.points, rb.points],
          ['Played', ra.played, rb.played],
          ['Goal difference', ra.goalDifference, rb.goalDifference],
          ['xG for', ra.xGFor ?? '—', rb.xGFor ?? '—'],
          ['xG against', ra.xGAgainst ?? '—', rb.xGAgainst ?? '—'],
          ['Form', ra.form.join(' '), rb.form.join(' ')],
        ],
        href: `/table${suffix}`,
        followUps: [`Who wins the ${snapshot.competition.shortName}?`],
      };
    }
  }

  // ── One player ───────────────────────────────────────────────────────────
  if (players.length >= 1) {
    const player = players[0]!;
    const stats = snapshot.playerStats.find((s) => s.playerId === player.id);
    if (stats) {
      const p90 = computePer90(stats);
      const team = teamById.get(player.teamId);
      const metric = detectMetric(q);
      const coverage = snapshot.meta.playerStatsCoverage;
      const scope = coverage && !coverage.complete
        ? ` (from ${coverage.matchesCovered} of ${coverage.matchesPlayed} matches)`
        : '';

      if (metric && metric.key in (stats as unknown as Record<string, number>)) {
        const total = (stats as unknown as Record<string, number>)[metric.key] as number;
        const rate = p90[metric.key];
        return {
          query: q, intent: 'player-stat', understood: true,
          answer:
            `${player.name} has ${num(total, Number.isInteger(total) ? 0 : 2)} ` +
            `${(METRIC_LABELS[metric.key] ?? metric.key).toLowerCase()}` +
            (rate !== undefined ? `, or ${num(rate)} per 90` : '') +
            ` in ${stats.minutes} minutes for ${team?.shortName ?? 'their club'}${scope}.`,
          columns: ['Metric', 'Total', 'Per 90'],
          rows: [[METRIC_LABELS[metric.key] ?? metric.key, num(total, Number.isInteger(total) ? 0 : 2), rate !== undefined ? num(rate) : '—']],
          href: `/players/${player.id}${suffix}`,
          followUps: [`How does ${player.name} compare to other ${player.position}s?`],
        };
      }

      return {
        query: q, intent: 'player-lookup', understood: true,
        answer:
          `${player.name}, ${player.detailedPosition} for ${team?.name ?? 'their club'}: ` +
          `${stats.goals} goals and ${stats.assists} assists in ${stats.minutes} minutes${scope}.`,
        columns: ['Metric', 'Total', 'Per 90'],
        rows: [
          ['Goals', stats.goals, num(p90.goals ?? 0)],
          ['Assists', stats.assists, num(p90.assists ?? 0)],
          ['xG', num(stats.xG), num(p90.xG ?? 0)],
          ['xA', num(stats.xA), num(p90.xA ?? 0)],
          ['Shots', stats.shots, num(p90.shots ?? 0)],
          ['Minutes', stats.minutes, '—'],
        ],
        href: `/players/${player.id}${suffix}`,
        followUps: [`Who has the most goals in the ${snapshot.competition.shortName}?`],
      };
    }
  }

  // ── One club, no specific metric ─────────────────────────────────────────
  if (teams.length === 1) {
    const team = teams[0]!;
    const row = snapshot.standings.find((r) => r.teamId === team.id);
    if (row) {
      const overPerf =
        row.expectedPoints !== null ? row.points - row.expectedPoints : null;
      return {
        query: q, intent: 'team-lookup', understood: true,
        answer:
          `${team.name} are ${ordinal(row.rank)} on ${row.points} points from ${row.played}` +
          (overPerf !== null
            ? `, ${Math.abs(overPerf).toFixed(1)} ${overPerf >= 0 ? 'above' : 'below'} their expected total.`
            : '.'),
        columns: ['Metric', 'Value'],
        rows: [
          ['Position', ordinal(row.rank)],
          ['Points', row.points],
          ['Record', `${row.won}W ${row.drawn}D ${row.lost}L`],
          ['Goals', `${row.goalsFor}–${row.goalsAgainst}`],
          ['xG', row.xGFor ?? '—'],
          ['Expected points', row.expectedPoints ?? '—'],
          ['Form', row.form.join(' ')],
        ],
        href: `/teams/${team.id}${suffix}`,
        followUps: [`What are ${team.shortName}'s title chances?`],
      };
    }
  }

  return unknown(q);
}

/**
 * The honest failure.
 *
 * Says plainly that it did not understand, and lists what it can do. The
 * alternative — picking the nearest intent and answering confidently — is how a
 * question about one thing gets answered about another, which is worse than no
 * answer at all.
 */
function unknown(query: string): AskResult {
  return {
    query,
    intent: 'unknown',
    understood: false,
    answer:
      "I could not read that as a question about this competition. I answer from " +
      'the loaded data only — no guessing — so here is what I can do.',
    columns: ['Try'],
    rows: [
      ['Who has the most goals?'],
      ["What are Arsenal's title chances?"],
      ['Compare Liverpool and Chelsea'],
      ['Who leads on xG per 90?'],
      ['Show me the table'],
      ['Who is going down?'],
    ],
    followUps: [],
  };
}
