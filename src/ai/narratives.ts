import type {
  DatasetSnapshot, Insight, SeasonForecast, StandingRow, Team, VenueKind,
} from '@/domain/types';

/**
 * How a match forecast is obtained, injected rather than imported.
 *
 * The narrative engine stays free of the model: it decides WHICH games matter
 * and the caller supplies what the model thinks of them. That keeps this file
 * deterministic and testable with a stub, and stops a story generator quietly
 * becoming a second place where predictions are made.
 */
export type MatchPredictor = (
  home: Team,
  away: Team,
  venueKind: VenueKind,
) => { homeWin: number; draw: number; awayWin: number };

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
  /** Absent for callers that only want table-level stories. */
  predict?: MatchPredictor;
  /** Minutes a player needs before appearing in a leaderboard-style story. */
  minutesFloor?: number;
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
    ...(input.predict ? keyFixtures(ctx, input.predict) : []),
    ...keyPlayers(ctx, input.minutesFloor ?? 0),
    ...coachingHeadlines(ctx),
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

// ── Fixtures, players and dugouts ───────────────────────────────────────────

/**
 * The games that will actually move the table.
 *
 * "Key fixture" is easy to fake and hard to define. The next match is not a key
 * match; the biggest club playing is not a key match. What makes a game matter
 * is the product of three things, and all three are already in the snapshot:
 *
 *   STAKES — how unsettled the two clubs' seasons are. A probability of 0.5 is
 *   maximally unsettled and 0.02 or 0.98 barely moves whatever the result;
 *   `4p(1-p)` peaks at a coin-flip and vanishes at both certainties.
 *
 *   BALANCE — how close the match itself is. A game one side wins 80% of the
 *   time carries less information than a toss-up, because the likely result is
 *   already priced into both clubs' projections.
 *
 *   PROXIMITY — whether they are near each other in the table. A six-pointer
 *   swings the gap by twice what an ordinary win does, which is exactly why the
 *   phrase exists.
 *
 * Multiplied rather than added, so a game has to be interesting on every axis:
 * two dead-rubber clubs in a thriller still cannot move a table.
 */
function keyFixtures(ctx: Ctx, predict: MatchPredictor): Insight[] {
  const upcoming = ctx.snapshot.matches
    .filter((m) => m.status === 'SCHEDULED')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    // A month out. Beyond that the ratings that produced the forecast will have
    // moved more than the forecast is worth.
    .slice(0, 40);
  if (!upcoming.length || ctx.played < 2) return [];

  const rankOf = new Map(ctx.standings.map((r) => [r.teamId, r.rank]));
  const unsettled = (teamId: string): number => {
    const f = ctx.forecasts.get(teamId);
    if (!f) return 0;
    // Whichever question is live for this club — the title or the drop.
    const p = Math.max(4 * f.winTitle * (1 - f.winTitle), 4 * f.relegation * (1 - f.relegation));
    return p;
  };

  const scored = upcoming.flatMap((m) => {
    const home = ctx.teamById.get(m.homeTeamId);
    const away = ctx.teamById.get(m.awayTeamId);
    if (!home || !away) return [];

    const stakes = Math.max(unsettled(m.homeTeamId), unsettled(m.awayTeamId));
    if (stakes <= 0) return [];

    const p = predict(home, away, m.venueKind);
    const balance = 1 - Math.abs(p.homeWin - p.awayWin);

    const rh = rankOf.get(m.homeTeamId);
    const ra = rankOf.get(m.awayTeamId);
    const gap = rh && ra ? Math.abs(rh - ra) : 99;
    // Within four places is a six-pointer in any division.
    const proximity = gap <= 4 ? 1.5 : gap <= 8 ? 1.15 : 1;

    return [{ m, home, away, p, score: stakes * (0.4 + 0.6 * balance) * proximity, rh, ra }];
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ m, home, away, p, rh, ra }) =>
      insight('fixture', 'high', {
        id: `key-fixture-${m.id}`,
        title: `${home.shortName} v ${away.shortName}`,
        body:
          rh && ra && Math.abs(rh - ra) <= 4
            ? `${ordinal(rh)} against ${ordinal(ra)} — the sort of game that moves the gap by two results, not one.`
            : `Close on the model, and both sides still have a season to settle.`,
        entityType: 'match',
        entityId: m.id,
        metrics: [
          { label: home.code, value: pct(p.homeWin) },
          { label: 'Draw', value: pct(p.draw) },
          { label: away.code, value: pct(p.awayWin) },
        ],
      }),
    );
}

/**
 * The players most likely to decide one of them.
 *
 * Goal involvement per 90 rather than totals, so a player who has started every
 * game is not automatically ahead of one who has been decisive in fewer. The
 * minutes floor is the same season-scaled one the leaderboards use — without it
 * this is a list of substitutes with one goal in twenty minutes.
 *
 * Returns nothing at all where the competition has no player data, which is the
 * honest answer for the continental competitions rather than an empty heading.
 *
 * ── The window has to be stated ────────────────────────────────────────────
 * Player stats cover only the matches detail was fetched for — 29 of
 * Brasileirão's 234 when this was written. The rest of the product says so
 * (`CoverageNote` puts "Last 29 of 234 matches" on every player page); this
 * generator did not, so "2 goals and 1 assist" read as a season total and made
 * the league's top scorer look like a squad player. The card now carries its
 * own window, because a card travels away from the page that framed it.
 */
function keyPlayers(ctx: Ctx, floor: number): Insight[] {
  const stats = ctx.snapshot.playerStats;
  if (!stats.length) return [];

  const cov = ctx.snapshot.meta.playerStatsCoverage;
  const partial = cov && cov.matchesCovered < cov.matchesPlayed;
  const window = partial
    ? ` Over the last ${cov!.matchesCovered} of ${cov!.matchesPlayed} matches.`
    : '';

  const playerById = new Map(ctx.snapshot.players.map((p) => [p.id, p]));

  /**
   * The floor is RELATIVE to the pool, not to the season.
   *
   * A season-scaled floor assumes stats cover the season, and here they cover a
   * three-week window — so it let anyone with an hour of football onto a list of
   * players who decide games. Igor Gomes led Brasileirão's on nought goals and
   * one assist, at 1.6 per 90, off about fifty minutes.
   *
   * Requiring 45% of the most-used player's minutes is window-agnostic: it
   * means "a regular", whether the pool covers 29 matches or 380, and it needs
   * no knowledge of how long the season is or how much of it was ingested.
   */
  const maxMinutes = Math.max(...stats.map((s) => s.minutes), 0);
  const relativeFloor = Math.max(floor, maxMinutes * 0.45);

  const ranked = stats
    .filter((s) => s.minutes >= relativeFloor)
    .map((s) => {
      const per90 = (v: number) => (s.minutes > 0 ? (v * 90) / s.minutes : 0);
      return { s, involvement: per90(s.goals + s.assists), goals: s.goals, assists: s.assists };
    })
    .filter((r) => r.goals + r.assists >= 2)
    .sort((a, b) => b.involvement - a.involvement)
    .slice(0, 3);

  return ranked.flatMap(({ s, involvement, goals, assists }) => {
    const player = playerById.get(s.playerId);
    if (!player) return [];
    const team = ctx.teamById.get(player.teamId);
    const overP = s.xG > 0 ? goals - s.xG : null;

    return [
      insight('player', 'medium', {
        id: `key-player-${player.id}`,
        title: player.name,
        body:
          `${goals} ${goals === 1 ? 'goal' : 'goals'} and ${assists} ${assists === 1 ? 'assist' : 'assists'}` +
          `${team ? ` for ${team.shortName}` : ''}, ` +
          `${one(involvement)} involvements per 90.` +
          (overP !== null && Math.abs(overP) >= 2
            ? ` ${overP > 0 ? 'Ahead of' : 'Behind'} their expected goals by ${one(Math.abs(overP))}.`
            : '') +
          window,
        entityType: 'player',
        entityId: player.id,
        metrics: [
          { label: 'Goals', value: String(goals) },
          { label: 'Assists', value: String(assists) },
          { label: 'Per 90', value: one(involvement) },
        ],
      }),
    ];
  });
}

/**
 * The dugout.
 *
 * Two stories worth telling and both are checkable. A new appointment is a fact
 * with a date, so "N games into the job" is arithmetic rather than opinion. A
 * manager under pressure is stated only as the gap between results and the
 * underlying numbers — the product should not be in the business of predicting
 * sackings, but "this side is losing games it is playing well enough to draw"
 * is a real observation with a real number behind it.
 */
function coachingHeadlines(ctx: Ctx): Insight[] {
  const out: Insight[] = [];
  const now = Date.parse(ctx.snapshot.meta.fetchedAt);

  for (const row of ctx.standings) {
    const team = ctx.teamById.get(row.teamId);
    const manager = team?.manager;
    if (!team || !manager?.appointedAt) continue;

    const days = (now - Date.parse(manager.appointedAt)) / 86_400_000;
    if (!Number.isFinite(days) || days < 0 || days > 150) continue;

    out.push(insight('coach', 'medium', {
      id: `coach-new-${team.id}`,
      title: `${manager.name} is new at ${team.shortName}`,
      body: `Appointed ${Math.round(days)} days ago, with the club ${ordinal(row.rank)} on ${row.points} points from ${row.played}.`,
      entityType: 'team',
      entityId: team.id,
      metrics: [
        { label: 'Position', value: ordinal(row.rank) },
        { label: 'Form', value: row.form.slice(-5).join(' ') || '—' },
      ],
    }));
  }

  // A side losing games it plays well enough not to lose.
  const undershoot = ctx.standings
    .filter((r) => r.expectedPoints !== null && r.played >= 5)
    .map((r) => ({ r, delta: r.points - (r.expectedPoints as number) }))
    .sort((a, b) => a.delta - b.delta)[0];

  if (undershoot && undershoot.delta <= -4) {
    const team = ctx.teamById.get(undershoot.r.teamId);
    if (team?.manager) {
      out.push(insight('coach', 'low', {
        id: `coach-pressure-${team.id}`,
        title: `${team.manager.name} is ${one(Math.abs(undershoot.delta))} points short of the performances`,
        body: `${team.shortName} sit ${ordinal(undershoot.r.rank)} on ${undershoot.r.points}, where the underlying numbers argue for ${one(undershoot.r.expectedPoints as number)}. That gap usually closes; it is not a prediction about anyone's job.`,
        entityType: 'team',
        entityId: team.id,
        metrics: [
          { label: 'Points', value: String(undershoot.r.points) },
          { label: 'Expected', value: one(undershoot.r.expectedPoints as number) },
        ],
      }));
    }
  }

  return out.slice(0, 2);
}
