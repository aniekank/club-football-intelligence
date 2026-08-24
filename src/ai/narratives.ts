import type { DatasetSnapshot, Insight, SeasonForecast, StandingRow, Team } from '@/domain/types';

/**
 * The narrative engine.
 *
 * Deterministic, not generative. Every sentence here is assembled from numbers
 * the snapshot already contains, which means each one is checkable, reproducible
 * between requests, and incapable of inventing a fact. An LLM layer can sit on
 * top later to vary the prose — the parent product's `narrate()` did exactly
 * that — but the CLAIMS must come from arithmetic, because a hallucinated
 * statistic in a football product is indistinguishable from a real one.
 *
 * ── What makes these club narratives rather than tournament ones ───────────
 * A tournament's stories are about survival: who goes through, who goes home.
 * A league's are about accumulation and position — a title race measured in
 * points and games left, a relegation fight measured in the gap to safety, a
 * side outrunning its xG and the regression that implies. Different questions,
 * so a different set of story kinds.
 *
 * Every insight carries its own evidence in `metrics`, so a reader can check the
 * claim without leaving the card.
 */

export interface NarrativeContext {
  snapshot: DatasetSnapshot;
  forecasts: SeasonForecast[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** Deterministic pick from a phrasing pool, keyed by a stable string. */
function phrase(pool: string[], key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return pool[(h >>> 0) % pool.length] as string;
}

interface Ctx {
  snapshot: DatasetSnapshot;
  forecasts: Map<string, SeasonForecast>;
  standings: StandingRow[];
  teamById: Map<string, Team>;
  /** Matches remaining for the median club — the "how much is left" number. */
  gamesLeft: number;
  played: number;
}

function buildCtx({ snapshot, forecasts }: NarrativeContext): Ctx {
  const standings = [...snapshot.standings].sort((a, b) => a.rank - b.rank);
  const playedCounts = standings.map((r) => r.played).sort((a, b) => a - b);
  const played = playedCounts[Math.floor(playedCounts.length / 2)] ?? 0;
  const total = snapshot.season.totalMatchweeks ?? played;
  return {
    snapshot,
    forecasts: new Map(forecasts.map((f) => [f.teamId, f])),
    standings,
    teamById: new Map(snapshot.teams.map((t) => [t.id, t])),
    gamesLeft: Math.max(0, total - played),
    played,
  };
}

const insight = (
  kind: Insight['kind'],
  severity: Insight['severity'],
  o: Omit<Insight, 'kind' | 'severity' | 'createdAt'>,
): Insight => ({ ...o, kind, severity, createdAt: new Date().toISOString() });

// ── Story generators ────────────────────────────────────────────────────────

/**
 * The title race.
 *
 * Three distinct shapes, and conflating them produces nonsense. A decided
 * league needs a champion sentence, not a "race"; a runaway leader needs the
 * margin; a genuine contest needs the gap AND the games left, because eight
 * points is a chasm in April and nothing in October.
 */
function titleRace(ctx: Ctx): Insight | null {
  const [first, second] = ctx.standings;
  if (!first || !second || ctx.played === 0) return null;
  const leader = ctx.teamById.get(first.teamId);
  const chaser = ctx.teamById.get(second.teamId);
  if (!leader || !chaser) return null;

  const gap = first.points - second.points;
  const maxSwing = ctx.gamesLeft * 3;
  const decided = ctx.gamesLeft === 0 || gap > maxSwing;
  const leaderOdds = ctx.forecasts.get(first.teamId)?.winTitle ?? null;

  // In a play-off league, finishing top wins a seeding and nothing else. MLS
  // has a Supporters' Shield for exactly this and it is not MLS Cup.
  const playoff = ctx.snapshot.competition.titleDecidedByPlayoff === true;

  if (decided) {
    return insight('milestone', 'high', {
      id: 'title-decided',
      title: playoff
        ? `${leader.name} finish top of the regular season`
        : `${leader.name} are champions`,
      body:
        (ctx.gamesLeft === 0
          ? `${leader.name} finish on ${first.points} points, ${gap} clear of ${chaser.name}.`
          : `With ${ctx.gamesLeft} to play, ${first.points} points and a ${gap}-point lead put ${leader.name} out of reach.`)
        + (playoff ? ' The title itself is decided by the play-offs.' : ''),
      entityType: 'team',
      entityId: leader.id,
      metrics: [
        { label: 'Points', value: String(first.points) },
        { label: 'Margin', value: `+${gap}` },
        { label: 'Goal difference', value: `${first.goalDifference > 0 ? '+' : ''}${first.goalDifference}` },
      ],
    });
  }

  const tight = gap <= 3;
  const openers = tight
    ? [`${gap === 0 ? 'Level at the top' : `Just ${gap} point${gap === 1 ? '' : 's'} in it`}`, 'This one is going the distance']
    : [`${leader.name} lead by ${gap}`, `A ${gap}-point cushion at the top`];

  return insight('prediction', tight ? 'high' : 'medium', {
    id: 'title-race',
    title: `${phrase(openers, first.teamId)}`,
    body:
      `${leader.name} (${first.points}) from ${chaser.name} (${second.points}) with ` +
      `${ctx.gamesLeft} matchweek${ctx.gamesLeft === 1 ? '' : 's'} left` +
      (leaderOdds !== null ? `. The model gives ${leader.name} ${pct(leaderOdds)}.` : '.'),
    entityType: 'team',
    entityId: leader.id,
    metrics: [
      { label: leader.shortName, value: String(first.points) },
      { label: chaser.shortName, value: String(second.points) },
      { label: 'Games left', value: String(ctx.gamesLeft) },
    ],
  });
}

/** The relegation fight, framed by the gap to safety rather than by position. */
function relegationFight(ctx: Ctx): Insight | null {
  const zone = ctx.snapshot.competition.zones.find((z) => z.kind === 'relegation');
  if (!zone || ctx.played === 0) return null;

  const firstDoomed = ctx.standings[zone.fromRank - 1];
  const safe = ctx.standings[zone.fromRank - 2];
  if (!firstDoomed || !safe) return null;
  const dropping = ctx.teamById.get(firstDoomed.teamId);
  const safeTeam = ctx.teamById.get(safe.teamId);
  if (!dropping || !safeTeam) return null;

  const gap = safe.points - firstDoomed.points;
  const risk = ctx.forecasts.get(firstDoomed.teamId)?.relegation ?? null;

  return insight('wall', gap <= 3 ? 'high' : 'medium', {
    id: 'relegation-fight',
    title:
      gap === 0
        ? `Level on the relegation line`
        : `${gap} point${gap === 1 ? '' : 's'} between ${dropping.shortName} and safety`,
    body:
      `${dropping.name} sit ${ordinal(firstDoomed.rank)} on ${firstDoomed.points}, with ` +
      `${safeTeam.name} the first side above the line on ${safe.points}` +
      (risk !== null ? `. The model puts ${dropping.shortName} down ${pct(risk)} of the time.` : '.'),
    entityType: 'team',
    entityId: dropping.id,
    metrics: [
      { label: 'Gap to safety', value: gap === 0 ? 'level' : `${gap}` },
      { label: 'Games left', value: String(ctx.gamesLeft) },
      ...(risk !== null ? [{ label: 'Relegation risk', value: pct(risk) }] : []),
    ],
  });
}

/**
 * Over- and under-performance against xG.
 *
 * The most useful thing a model can tell a supporter, and the one most often
 * told badly. The claim is about REGRESSION, not about luck being deserved: a
 * side ten points above its expected total is not "clinical forever", it is
 * likely to score less often from the same chances. Saying so plainly is the
 * difference between analysis and a fan blog.
 */
function xgOutliers(ctx: Ctx): Insight[] {
  const rows = ctx.standings.filter((r) => r.expectedPoints !== null && r.played >= 4);
  if (rows.length < 6) return [];

  const withDelta = rows
    .map((r) => ({ row: r, delta: r.points - (r.expectedPoints as number) }))
    .sort((a, b) => b.delta - a.delta);

  const out: Insight[] = [];
  const top = withDelta[0];
  const bottom = withDelta[withDelta.length - 1];

  if (top && top.delta >= 4) {
    const team = ctx.teamById.get(top.row.teamId);
    if (team) {
      out.push(insight('overperformer', 'medium', {
        id: `xg-over-${team.id}`,
        title: `${team.name} are ${one(top.delta)} points ahead of their xG`,
        body:
          `${top.row.points} points from an expected ${one(top.row.expectedPoints as number)}. ` +
          `That gap is finishing and fine margins rather than chance creation, and it is the ` +
          `kind of lead that historically shrinks rather than holds.`,
        entityType: 'team',
        entityId: team.id,
        metrics: [
          { label: 'Points', value: String(top.row.points) },
          { label: 'Expected', value: one(top.row.expectedPoints as number) },
          { label: 'xG for', value: one(top.row.xGFor ?? 0) },
        ],
      }));
    }
  }

  if (bottom && bottom.delta <= -4) {
    const team = ctx.teamById.get(bottom.row.teamId);
    if (team) {
      out.push(insight('underperformer', 'medium', {
        id: `xg-under-${team.id}`,
        title: `${team.name} are ${one(Math.abs(bottom.delta))} points short of their xG`,
        body:
          `${bottom.row.points} points from an expected ${one(bottom.row.expectedPoints as number)}. ` +
          `The chances are being created; they are not being taken. On the same underlying ` +
          `numbers this is the profile that tends to improve.`,
        entityType: 'team',
        entityId: team.id,
        metrics: [
          { label: 'Points', value: String(bottom.row.points) },
          { label: 'Expected', value: one(bottom.row.expectedPoints as number) },
          { label: 'xG for', value: one(bottom.row.xGFor ?? 0) },
        ],
      }));
    }
  }
  return out;
}

/** A run of results good or bad enough to be worth naming. */
function formRuns(ctx: Ctx): Insight[] {
  const out: Insight[] = [];
  for (const row of ctx.standings) {
    if (row.form.length < 4) continue;
    const recent = row.form.slice(-5);
    const wins = recent.filter((f) => f === 'W').length;
    const losses = recent.filter((f) => f === 'L').length;
    const team = ctx.teamById.get(row.teamId);
    if (!team) continue;

    if (wins >= 4) {
      out.push(insight('form', 'medium', {
        id: `form-hot-${team.id}`,
        title: `${team.name} have won ${wins} of their last ${recent.length}`,
        body: `${ordinal(row.rank)} on ${row.points} points, and the run has taken them there.`,
        entityType: 'team', entityId: team.id,
        metrics: [
          { label: 'Form', value: recent.join(' ') },
          { label: 'Position', value: ordinal(row.rank) },
        ],
      }));
    } else if (losses >= 4) {
      out.push(insight('form', 'medium', {
        id: `form-cold-${team.id}`,
        title: `${team.name} have lost ${losses} of their last ${recent.length}`,
        body: `${ordinal(row.rank)} on ${row.points}, and falling.`,
        entityType: 'team', entityId: team.id,
        metrics: [
          { label: 'Form', value: recent.join(' ') },
          { label: 'Position', value: ordinal(row.rank) },
        ],
      }));
    }
  }
  return out.slice(0, 2);
}

/**
 * A promoted side doing better than promoted sides do.
 *
 * Only fires where the prior says the club is newly up, so it cannot
 * accidentally celebrate an established mid-table team having a decent month.
 */
function promotedSurprise(ctx: Ctx): Insight | null {
  const promoted = new Set(
    ctx.snapshot.priorRatings.filter((p) => p.promoted).map((p) => p.teamId),
  );
  if (!promoted.size || ctx.played < 3) return null;

  const best = ctx.standings.find((r) => promoted.has(r.teamId));
  if (!best) return null;
  // Comfortably in the top half is the bar; anything looser is just noise.
  if (best.rank > Math.floor(ctx.standings.length / 2)) return null;

  const team = ctx.teamById.get(best.teamId);
  if (!team) return null;
  const risk = ctx.forecasts.get(best.teamId)?.relegation ?? null;

  return insight('breakout', 'medium', {
    id: `promoted-${team.id}`,
    title: `${team.name} are ${ordinal(best.rank)} in their first season up`,
    body:
      `${best.points} points from ${best.played} — promoted sides are not supposed to do this` +
      (risk !== null ? `, and the model has already cut their relegation risk to ${pct(risk)}.` : '.'),
    entityType: 'team',
    entityId: team.id,
    metrics: [
      { label: 'Position', value: ordinal(best.rank) },
      { label: 'Points', value: String(best.points) },
      ...(risk !== null ? [{ label: 'Relegation risk', value: pct(risk) }] : []),
    ],
  });
}

/** The tightest European-qualification cluster, when it is genuinely tight. */
function europeanScrap(ctx: Ctx): Insight | null {
  const european = ctx.snapshot.competition.zones
    .filter((z) => z.kind.startsWith('ucl') || z.kind.startsWith('uel') || z.kind.startsWith('conference'))
    .map((z) => z.toRank);
  if (!european.length || ctx.played < 4) return null;
  const cut = Math.max(...european);
  const inside = ctx.standings[cut - 1];
  const outside = ctx.standings[cut];
  if (!inside || !outside) return null;

  const gap = inside.points - outside.points;
  if (gap > 2) return null;

  const a = ctx.teamById.get(inside.teamId);
  const b = ctx.teamById.get(outside.teamId);
  if (!a || !b) return null;

  return insight('prediction', 'medium', {
    id: 'european-scrap',
    title: gap === 0
      ? `${a.shortName} and ${b.shortName} are level on the European cut`
      : `${gap} point${gap === 1 ? '' : 's'} decides the last European place`,
    body: `${a.name} hold ${ordinal(inside.rank)} on ${inside.points}; ${b.name} are ${ordinal(outside.rank)} on ${outside.points}.`,
    entityType: 'team',
    entityId: a.id,
    metrics: [
      { label: a.shortName, value: String(inside.points) },
      { label: b.shortName, value: String(outside.points) },
      { label: 'Games left', value: String(ctx.gamesLeft) },
    ],
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export function generateInsights(input: NarrativeContext): Insight[] {
  const ctx = buildCtx(input);
  if (!ctx.standings.length) return [];

  const all = [
    titleRace(ctx),
    relegationFight(ctx),
    europeanScrap(ctx),
    promotedSurprise(ctx),
    ...xgOutliers(ctx),
    ...formRuns(ctx),
  ].filter((i): i is Insight => i !== null);

  const weight: Record<Insight['severity'], number> = { high: 0, medium: 1, low: 2 };
  return all.sort((a, b) => weight[a.severity] - weight[b.severity]);
}

export interface Briefing {
  headline: string;
  body: string;
  bullets: string[];
}

/**
 * The daily briefing.
 *
 * Aware of what is actually happening across every loaded competition, because
 * in club football several run at once and a briefing scoped to one of them
 * misses the week. `liveElsewhere` carries that context in.
 */
export function generateBriefing(
  input: NarrativeContext,
  liveElsewhere: { competitionName: string; count: number }[] = [],
): Briefing {
  const ctx = buildCtx(input);
  const insights = generateInsights(input);
  const competition = ctx.snapshot.competition.name;
  const label = ctx.snapshot.season.label;

  if (!ctx.standings.length || ctx.played === 0) {
    return {
      headline: `${competition} ${label} is about to begin`,
      body: 'No matches played yet, so there is nothing to report beyond the fixtures.',
      bullets: [],
    };
  }

  const leader = ctx.teamById.get(ctx.standings[0]!.teamId);
  const done = ctx.gamesLeft === 0;

  const headline = done
    ? `${leader?.name ?? 'The champions'} win the ${competition}`
    : `${leader?.name ?? 'The leaders'} lead the ${competition} after ${ctx.played}`;

  const bullets = insights.slice(0, 4).map((i) => i.title);
  for (const l of liveElsewhere) {
    bullets.push(`${l.count} match${l.count === 1 ? '' : 'es'} live now in the ${l.competitionName}`);
  }

  return {
    headline,
    body: insights[0]?.body ?? `${ctx.played} matchweeks played, ${ctx.gamesLeft} to go.`,
    bullets,
  };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th');
}
