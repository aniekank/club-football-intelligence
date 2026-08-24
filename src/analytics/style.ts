import type { DatasetSnapshot, ID, MatchTeamStats } from '@/domain/types';

/**
 * How a side actually plays, from what it actually did.
 *
 * Every number here is an average over the matches the snapshot has detail
 * for — never a scouting opinion, never a formation label treated as a style.
 * A formation is a starting shape and tells you almost nothing: two sides in
 * 4-2-3-1 can play completely different football, and the numbers below are
 * what separates them.
 *
 * ── Coverage is part of the profile, not a footnote ────────────────────────
 * Detail is fetched for a rolling window, so a club's profile may rest on three
 * matches or thirty. `matches` travels with the profile and every surface that
 * renders it is expected to say so — a tactical read from two games is a
 * curiosity, and presenting it with the same confidence as one from twenty is
 * the same failure as showing a partial total as a season total.
 *
 * ── Why these six ──────────────────────────────────────────────────────────
 * They are chosen to be as close to INDEPENDENT as the feed allows, because six
 * correlated measures describe one thing six times:
 *
 *   possession   — do they want the ball
 *   territory    — where do they have it (share of passes in the opposition half)
 *   press        — PPDA; how quickly they try to win it back. LOWER is more intense
 *   setPieceShare— how they create: share of expected goals from set plays
 *   shotQuality  — expected goals per shot; working it in vs shooting on sight
 *   directness   — long balls as a share of passes
 *
 * A possession side and a counter-attacking side differ on all six. A good
 * possession side and a bad one differ on almost none of them, which is the
 * point: this describes STYLE, not quality, and the ratings already do quality.
 */
export interface TeamStyle {
  teamId: ID;
  /** Matches with detail behind these numbers. */
  matches: number;
  possession: number | null;
  territory: number | null;
  press: number | null;
  setPieceShare: number | null;
  shotQuality: number | null;
  directness: number | null;
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/**
 * A team's style over every match the snapshot has stats for.
 *
 * Nulls are DROPPED rather than treated as zero — a competition without xG
 * yields a null `setPieceShare` and `shotQuality`, and the surfaces above
 * simply omit those rows instead of claiming a side never scores from a corner.
 */
export function teamStyle(snapshot: DatasetSnapshot, teamId: ID): TeamStyle {
  const rows: MatchTeamStats[] = [];
  for (const m of snapshot.matches) {
    const s = m.teamStats[teamId];
    // `possession` standing in for "this row was populated at all": a match we
    // never fetched detail for carries an all-null stats object.
    if (s && s.possession !== null) rows.push(s);
  }

  const nums = (pick: (s: MatchTeamStats) => number | null): number[] =>
    rows.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));

  const setPiece = rows
    .map((s) => {
      const open = s.xGOpenPlay;
      const set = s.xGSetPlay;
      if (open === null || set === null) return null;
      const total = open + set;
      return total > 0 ? (set / total) * 100 : null;
    })
    .filter((v): v is number => v !== null);

  const quality = rows
    .map((s) => (s.xG !== null && s.shots ? s.xG / s.shots : null))
    .filter((v): v is number => v !== null);

  const direct = rows
    .map((s) => (s.longBalls !== null && s.passes ? (s.longBalls / s.passes) * 100 : null))
    .filter((v): v is number => v !== null);

  return {
    teamId,
    matches: rows.length,
    possession: mean(nums((s) => s.possession)),
    territory: mean(nums((s) => s.fieldTilt)),
    press: mean(nums((s) => s.ppda)),
    setPieceShare: mean(setPiece),
    shotQuality: mean(quality),
    directness: mean(direct),
  };
}

/** One line of contrast between two sides on one measure. */
export interface StyleContrast {
  key: keyof Omit<TeamStyle, 'teamId' | 'matches'>;
  label: string;
  /** What a HIGH value means, in words. */
  highMeans: string;
  home: number | null;
  away: number | null;
  format: (v: number) => string;
  /** True when a lower number is the more aggressive/proactive reading. */
  lowerIsMore?: boolean;
}

export function styleContrasts(home: TeamStyle, away: TeamStyle): StyleContrast[] {
  const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const rows: StyleContrast[] = [
    {
      key: 'possession', label: 'Possession', highMeans: 'keeps the ball',
      home: home.possession, away: away.possession, format: (v) => `${Math.round(v)}%`,
    },
    {
      key: 'territory', label: 'Territory', highMeans: 'plays in the opposition half',
      home: home.territory, away: away.territory, format: (v) => `${Math.round(v)}%`,
    },
    {
      key: 'press', label: 'Press', highMeans: 'sits off', lowerIsMore: true,
      home: home.press, away: away.press, format: one,
    },
    {
      key: 'setPieceShare', label: 'From set plays', highMeans: 'creates from dead balls',
      home: home.setPieceShare, away: away.setPieceShare, format: (v) => `${Math.round(v)}%`,
    },
    {
      key: 'shotQuality', label: 'Chance quality', highMeans: 'works better openings',
      home: home.shotQuality, away: away.shotQuality,
      format: (v) => (Math.round(v * 1000) / 1000).toFixed(2),
    },
    {
      key: 'directness', label: 'Directness', highMeans: 'goes long',
      home: home.directness, away: away.directness, format: (v) => `${one(v)}%`,
    },
  ];
  // A measure neither side has data for is not a row of dashes; it is absent.
  return rows.filter((r) => r.home !== null || r.away !== null);
}

/**
 * The single sentence a reader would want if they read nothing else.
 *
 * Returns null rather than reaching for a phrase when the two sides are not
 * meaningfully different — "both play a fairly similar game" is true far more
 * often than football writing admits, and inventing a contrast that is not in
 * the numbers is exactly what this engine exists not to do.
 */
export function styleHeadline(
  home: TeamStyle, away: TeamStyle, homeName: string, awayName: string,
): string | null {
  const gap = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : a - b;

  const poss = gap(home.possession, away.possession);
  if (poss !== null && Math.abs(poss) >= 8) {
    const [more, less] = poss > 0 ? [homeName, awayName] : [awayName, homeName];
    return `${more} will have the ball; ${less} will not mind.`;
  }

  const press = gap(home.press, away.press);
  // PPDA: lower is a more intense press, so the sign is inverted here.
  if (press !== null && Math.abs(press) >= 3) {
    const [harder, softer] = press < 0 ? [homeName, awayName] : [awayName, homeName];
    return `${harder} press higher up than ${softer} do.`;
  }

  const set = gap(home.setPieceShare, away.setPieceShare);
  if (set !== null && Math.abs(set) >= 15) {
    const [dead] = set > 0 ? [homeName] : [awayName];
    return `${dead} get an unusual share of their chances from set plays.`;
  }

  return null;
}
