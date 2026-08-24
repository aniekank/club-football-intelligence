import type { DatasetSnapshot, Player, Team } from '@/domain/types';
import { COMPETITIONS } from '@/domain/competitions';

/**
 * Entity resolver — one matching brain behind both the search box and the
 * natural-language ask, so "messi" finds the same player whether it is typed
 * alone or buried in a sentence.
 *
 * The SCORING below is harvested verbatim from World Cup Intelligence, where it
 * was tuned against real misses and every threshold in it is scar tissue: the
 * transposition cost that catches "halaand", the five-character floor that stops
 * "kane" fuzzing into "sané", the sentinel check that stops a 5-char token
 * leaking a spurious match. Re-deriving those numbers would have meant
 * re-earning the same bugs.
 *
 * What is NOT harvested is everything above it. The parent ranked 48 national
 * teams and a fixed player pool from a global store; this ranks clubs, players
 * and competitions out of a SNAPSHOT passed in, because the same name resolves
 * to different entities in different editions — "Leicester City" is a title
 * winner in 2015/16 and absent from the current Premier League.
 *
 * Pure and deterministic. No network.
 */

/** lowercase, fold diacritics, turn separators into spaces, collapse. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._\-'']/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const toks = (s: string): string[] => normalize(s).split(' ').filter(Boolean);

/**
 * Bounded Damerau (optimal string alignment) distance — like Levenshtein but an
 * adjacent transposition ("halaand"↔"haaland") costs 1, since that's one of the
 * most common typos. Returns `max+1` as soon as it's provably over budget.
 */
function editDistance(a: string, b: string, max: number): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev: number[] = Array.from({ length: bl + 1 }, (_, j) => j);
  for (let i = 1; i <= al; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2]! + 1); // adjacent transposition
      }
      row.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[bl]!;
}

/** Score one query token against one name token, 0..1. */
function tokenScore(qt: string, nt: string): number {
  if (qt === nt) return 1;
  if (nt.length === 1) return qt[0] === nt ? 0.5 : 0; // name initial, e.g. "l" of "L. Messi" ← "lionel" (alone < threshold)
  if (qt.length === 1) return nt[0] === qt ? 0.4 : 0; // query gave an initial
  if (nt.startsWith(qt)) return 0.7 + 0.25 * (qt.length / nt.length); // prefix
  if (nt.length >= 4 && qt.startsWith(nt)) return 0.6 + 0.2 * (nt.length / qt.length); // query extends a real name token (not a 2-char fragment like "ho")
  if (qt.length >= 4 && nt.includes(qt)) return 0.6; // internal substring
  const max = qt.length >= 6 ? 2 : qt.length >= 5 ? 1 : 0; // typo tolerance — only for ≥5-char tokens, so short names ("kane") don't fuzz into "sané"
  if (max > 0) {
    const d = editDistance(qt, nt, max);
    // `editDistance` returns `max+1` as its over-budget sentinel. For a 5-char
    // token (max=1) that sentinel is exactly 2 — which must NOT be read as "two
    // typos". Trust the distance only when it's genuinely within budget, or a
    // 5-char token leaks a spurious 0.45 against almost any word ("messi"↔"scaloni").
    if (d <= max) {
      if (d === 1) return 0.62; // one typo → still a confident match
      if (d === 2) return 0.45; // two typos → weak, needs corroboration
    }
  }
  return 0;
}

/**
 * Score the whole query as a name against a candidate name. 0 = no match.
 * Order-independent greedy token assignment + substring/prefix bonuses. A real
 * (≥3-char) query token that matches nothing vetoes the candidate (so
 * "lionel ronaldo" doesn't resolve "L. Messi").
 */
export function scoreName(query: string, name: string): number {
  const nq = normalize(query);
  const nn = normalize(name);
  if (!nq || !nn) return 0;
  if (nq === nn) return 100;

  let bonus = 0;
  if (nq.length >= 4 && nn.includes(nq)) bonus += 0.8; // contiguous substring (not short tokens)
  if (nn.startsWith(nq)) bonus += 0.4;

  const qts = nq.split(' ');
  const nts = nn.split(' ');
  const used = new Array(nts.length).fill(false);
  let total = 0;
  let sig = 0;
  let sigMatched = 0;
  let strong = 0; // sig tokens matched on real content (exact / prefix), not just an initial or a fuzzy near-miss
  for (const qt of qts) {
    const isSig = qt.length >= 3;
    if (isSig) sig++;
    let best = 0;
    let idx = -1;
    for (let i = 0; i < nts.length; i++) {
      if (used[i]) continue;
      const s = tokenScore(qt, nts[i]!);
      if (s > best) {
        best = s;
        idx = i;
      }
    }
    if (idx >= 0 && best > 0) {
      used[idx] = true;
      total += best;
      if (isSig && best >= 0.5) sigMatched++;
      if (isSig && best >= 0.7) strong++;
    } else if (isSig) {
      return bonus; // a meaningful word matched nothing → wrong entity (keep only a pure-substring hit)
    }
  }
  if (sig > 0 && sigMatched === 0) return bonus;
  // An initial-only match (a full first name "lionel" hitting the stored "L") plus
  // a fuzzy near-miss surname ("messi"↔"bessi") can clear the bar on weak evidence
  // alone. Require at least one strongly-matched word (exact or prefix) once the
  // query carries two+ significant tokens, so "lionel messi" can't surface "L. Bessi".
  if (sig >= 2 && strong === 0) return bonus;
  return total + bonus;
}

// ── Club-side ranking ───────────────────────────────────────────────────────

/**
 * Aliases the feed will never supply: what supporters actually call a club.
 * Keyed by normalised alias, valued by a normalised fragment of the real name.
 */
const TEAM_ALIASES: Record<string, string> = {
  spurs: 'tottenham', gunners: 'arsenal', reds: 'liverpool', blues: 'chelsea',
  citizens: 'manchester city', city: 'manchester city', united: 'manchester united',
  'man u': 'manchester united', 'man utd': 'manchester united',
  wolves: 'wolverhampton', hammers: 'west ham', toffees: 'everton',
  saints: 'southampton', foxes: 'leicester', seagulls: 'brighton',
  villa: 'aston villa', forest: 'nottingham forest', magpies: 'newcastle',
  barca: 'barcelona', barsa: 'barcelona', blaugrana: 'barcelona',
  madrid: 'real madrid', merengues: 'real madrid', atleti: 'atletico',
  juve: 'juventus', nerazzurri: 'inter', rossoneri: 'milan',
  bayern: 'bayern', bvb: 'borussia dortmund', dortmund: 'borussia dortmund',
  gladbach: 'monchengladbach', psg: 'paris', om: 'marseille', ol: 'lyon',
};

const THRESHOLD = 0.55;

function expandAlias(query: string): string {
  const n = normalize(query);
  return TEAM_ALIASES[n] ?? n;
}

export interface Ranked<T> { item: T; score: number }

/**
 * The bar a match must clear.
 *
 * Two bars, because the two callers face opposite risks. A SEARCH BOX is given
 * a name and nothing else, so fuzziness is a feature — "halaand" should find
 * Haaland. A SENTENCE is mostly ordinary words, so fuzziness is a liability:
 * every word is a chance to match something by accident.
 *
 * These are the accidents that were actually observed before strict mode
 * existed, all from real questions:
 *   "Leicester's title chances" → the stray "s" matched Swansea, via the
 *                                 startsWith bonus, giving TWO clubs and
 *                                 answering a comparison nobody asked for
 *   "xG per 90"                 → "per" exactly matched Per Mertesacker
 *   "how tall is the eiffel tower" → "tower" is one edit from Toner
 */
const THRESHOLD_STRICT = 0.9;

/** Rank clubs in a snapshot. The whole query is treated as a name. */
export function rankTeams(
  snapshot: DatasetSnapshot,
  query: string,
  limit = 6,
  strict = false,
): Team[] {
  const expanded = expandAlias(query);
  const bar = strict ? THRESHOLD_STRICT : THRESHOLD;
  const scored: Ranked<Team>[] = [];
  for (const team of snapshot.teams) {
    // Best of the club's several names, plus its three-letter code, so "MCI"
    // and "Man City" and "Manchester City" all land in the same place.
    const score = Math.max(
      scoreName(expanded, team.name),
      scoreName(expanded, team.shortName),
      normalize(query) === normalize(team.code) ? 100 : 0,
    );
    if (score >= bar) scored.push({ item: team, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}

/**
 * Rank players in a snapshot.
 *
 * Ties break on MINUTES, not alphabetically. Two players can share a surname and
 * the one who actually plays is nearly always the one meant — an alphabetical
 * tiebreak surfaces the reserve keeper.
 */
export function rankPlayers(
  snapshot: DatasetSnapshot,
  query: string,
  limit = 8,
  strict = false,
): Player[] {
  const minutes = new Map(snapshot.playerStats.map((s) => [s.playerId, s.minutes]));
  const bar = strict ? THRESHOLD_STRICT : THRESHOLD;
  const scored: (Ranked<Player> & { mins: number })[] = [];
  for (const player of snapshot.players) {
    const score = Math.max(
      scoreName(query, player.name),
      player.fullName ? scoreName(query, player.fullName) : 0,
    );
    if (score >= bar) {
      scored.push({ item: player, score, mins: minutes.get(player.id) ?? 0 });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || b.mins - a.mins)
    .slice(0, limit)
    .map((s) => s.item);
}

export function rankCompetitions(query: string, limit = 4) {
  const scored = COMPETITIONS.map((c) => ({
    item: c,
    score: Math.max(scoreName(query, c.name), scoreName(query, c.shortName)),
  })).filter((s) => s.score >= THRESHOLD);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}

// ── Extraction from a sentence ──────────────────────────────────────────────

/**
 * Words that are never an entity, however well they score.
 *
 * Without this a question like "who has the most shots" resolves "most" to a
 * club through fuzzy matching and answers about the wrong thing entirely. The
 * parent hit exactly this; the fix is a stop list applied before scoring, not a
 * higher threshold, because raising the threshold also loses real short names.
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'who', 'what', 'which', 'how',
  'many', 'much', 'most', 'best', 'worst', 'top', 'has', 'have', 'had', 'do',
  'does', 'did', 'in', 'on', 'at', 'of', 'for', 'to', 'from', 'by', 'with',
  'and', 'or', 'vs', 'versus', 'against', 'this', 'that', 'season', 'league',
  'team', 'club', 'player', 'players', 'teams', 'clubs', 'goals', 'assists',
  'points', 'form', 'table', 'win', 'wins', 'lose', 'loses', 'draw', 'draws',
  'more', 'than', 'better', 'worse', 'good', 'bad', 'me', 'my', 'show', 'tell',
  'about', 'chance', 'chances', 'odds', 'title', 'relegation', 'relegated',
  'xg', 'expected', 'per', 'game', 'match', 'matches', 'now', 'currently',
]);

/** Contiguous word runs of 1..4 tokens, longest first, stopwords excluded. */
function candidatePhrases(sentence: string): string[] {
  const words = normalize(sentence).split(' ').filter(Boolean);
  const out: string[] = [];
  for (let size = 4; size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const run = words.slice(i, i + size);
      // A single stopword is never an entity; a multi-word run made ENTIRELY of
      // them is not either, but "west ham" must survive a stopword inside it.
      if (run.every((w) => STOPWORDS.has(w))) continue;
      if (size === 1 && STOPWORDS.has(run[0] as string)) continue;
      // A run that STARTS or ENDS with a stopword is that stopword plus a real
      // phrase, not one entity — "per 90" is not a club, and letting it through
      // is how "per" resolved Per Mertesacker.
      if (run.length > 1 && (STOPWORDS.has(run[0] as string) || STOPWORDS.has(run[run.length - 1] as string))) continue;
      // Numbers are never entity names, and a bare digit run drags a real token
      // along with it.
      if (run.every((w) => /^\d+$/.test(w))) continue;
      // Possessive debris: "leicester's" normalises to "leicester s", and that
      // orphan "s" scored 0.8 against Swansea through the prefix bonus.
      if (size === 1 && (run[0] as string).length < 3) continue;
      out.push(run.join(' '));
    }
  }
  return out;
}

/** Find club mentions inside a sentence, longest phrase winning. */
export function extractTeams(
  snapshot: DatasetSnapshot,
  sentence: string,
  limit = 2,
): Team[] {
  const found: Team[] = [];
  const seen = new Set<string>();
  for (const phrase of candidatePhrases(sentence)) {
    // Strict: inside a sentence, a match must be exact or a clean prefix. A
    // fuzzy near-miss on an ordinary word is far more likely to be an accident
    // than an intent.
    for (const team of rankTeams(snapshot, phrase, 1, true)) {
      if (seen.has(team.id)) continue;
      seen.add(team.id);
      found.push(team);
      if (found.length >= limit) return found;
    }
  }
  return found;
}

/** Find player mentions inside a sentence. */
export function extractPlayers(
  snapshot: DatasetSnapshot,
  sentence: string,
  limit = 2,
): Player[] {
  const found: Player[] = [];
  const seen = new Set<string>();
  for (const phrase of candidatePhrases(sentence)) {
    // Single tokens are too promiscuous for player names inside a sentence —
    // they match a surname fragment in half the squad.
    if (!phrase.includes(' ') && phrase.length < 5) continue;
    for (const player of rankPlayers(snapshot, phrase, 1, true)) {
      if (seen.has(player.id)) continue;
      seen.add(player.id);
      found.push(player);
      if (found.length >= limit) return found;
    }
  }
  return found;
}

export interface SearchHit {
  kind: 'team' | 'player' | 'competition';
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

/** Unified search across the active edition. */
export function search(
  snapshot: DatasetSnapshot,
  query: string,
  competitionId: string,
  seasonParam: string,
): SearchHit[] {
  if (normalize(query).length < 2) return [];
  const suffix = seasonParam ? `?competition=${competitionId}&season=${seasonParam}` : `?competition=${competitionId}`;
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));

  const teams: SearchHit[] = rankTeams(snapshot, query, 5).map((t) => ({
    kind: 'team', id: t.id, label: t.name, sublabel: t.country,
    href: `/teams/${t.id}${suffix}`,
  }));

  const players: SearchHit[] = rankPlayers(snapshot, query, 6).map((p) => ({
    kind: 'player', id: p.id, label: p.name,
    sublabel: `${p.detailedPosition} · ${teamById.get(p.teamId)?.shortName ?? ''}`,
    href: `/players/${p.id}${suffix}`,
  }));

  const comps: SearchHit[] = rankCompetitions(query, 2).map((c) => ({
    kind: 'competition', id: c.id, label: c.name, sublabel: c.country,
    href: `/table?competition=${c.id}`,
  }));

  return [...teams, ...players, ...comps];
}
