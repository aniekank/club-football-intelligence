/**
 * Every club's ground, resolved once and committed.
 *
 * ── Why this is a build step ───────────────────────────────────────────────
 * The globe flies to a stadium, so every fixture on the tour needs a
 * coordinate, and a week of international football is several hundred fixtures
 * across forty-three competitions. Resolving those on the request path meant a
 * per-club HTTP call, a cache that empties on every restart, and a home page
 * that took two seconds to render the first time anyone opened it.
 *
 * A ground does not move. So it is fetched once, here, and shipped as a table:
 * the tour becomes pure arithmetic over data the process already has, and the
 * network is not involved in drawing a globe.
 *
 * ── What it does ───────────────────────────────────────────────────────────
 * Walks every competition in the registry, collects every club id that appears
 * anywhere in the league payload — table rows for a league, fixture lists for a
 * knockout, which is why it walks the whole document rather than one known path
 * — and asks the club endpoint for each one's venue.
 *
 * Clubs whose venue has no coordinates are OMITTED rather than defaulted. The
 * consumer treats a missing club as "nowhere to point" and drops the fixture
 * from the tour, which is the only honest thing a map can do with an unknown
 * location.
 *
 * Usage: node scripts/build-venues.mjs [--only epl,laliga]
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = 'https://www.fotmob.com/api/data';
const HEADERS = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };
const CONCURRENCY = 6;

/** Read the league ids straight out of the adapter so the two cannot drift. */
function leagueIds() {
  const src = readFileSync('src/data/providers/fotmob.ts', 'utf8');
  const block = src.slice(
    src.indexOf('export const FOTMOB_LEAGUES'),
    src.indexOf('};', src.indexOf('export const FOTMOB_LEAGUES')),
  );
  const out = {};
  for (const [, key, id] of block.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*(\d+),/gm)) {
    out[key] = Number(id);
  }
  return out;
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return null;
}

/** Any object anywhere in the payload whose pageUrl names a team. */
function teamIdsIn(node, found = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) teamIdsIn(item, found);
    return found;
  }
  if (node && typeof node === 'object') {
    const url = typeof node.pageUrl === 'string' ? node.pageUrl : null;
    const match = url?.match(/\/teams\/(\d+)\//);
    if (match) found.add(match[1]);
    if (typeof node.id === 'number' && typeof node.name === 'string' && 'played' in node) {
      found.add(String(node.id));
    }
    for (const value of Object.values(node)) teamIdsIn(value, found);
  }
  return found;
}

async function pool(items, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const only = process.argv.includes('--only')
  ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(','))
  : null;

const leagues = leagueIds();
const wanted = Object.entries(leagues).filter(([key]) => !only || only.has(key));
console.log(`${wanted.length} competitions`);

const teamIds = new Set();
await pool(wanted, async ([key, id]) => {
  try {
    const league = await getJson(`${BASE}/leagues?id=${id}`);
    const found = teamIdsIn(league);
    for (const t of found) teamIds.add(t);
    console.log(`  ${key}: ${found.size} clubs`);
  } catch (err) {
    console.warn(`  ${key}: FAILED — ${err.message}`);
  }
});

console.log(`${teamIds.size} distinct clubs; fetching venues`);

const ids = [...teamIds].sort((a, b) => Number(a) - Number(b));
const round = (v) => Math.round(v * 10000) / 10000;
const venues = {};
let done = 0;

await pool(ids, async (id) => {
  try {
    const club = await getJson(`${BASE}/teams?id=${id}`, 2);
    const w = club?.overview?.venue?.widget;
    const lat = Number(w?.location?.[0]);
    const lon = Number(w?.location?.[1]);
    // Same rejection rule as the adapter: the pair survives together or not at
    // all, 0,0 is a place in the Atlantic rather than a missing value, and an
    // out-of-range number is what a moved field looks like.
    if (
      Number.isFinite(lat) && Number.isFinite(lon)
      && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      && !(lat === 0 && lon === 0)
    ) {
      venues[id] = [round(lat), round(lon), w.name ?? null, w.city ?? null];
    }
  } catch {
    // A club without a venue is simply absent from the table.
  }
  done += 1;
  if (done % 100 === 0) console.log(`  ${done}/${ids.length}`);
});

const entries = Object.entries(venues).sort((a, b) => Number(a[0]) - Number(b[0]));
const body = entries
  .map(([id, v]) => `  '${id}': ${JSON.stringify(v)},`)
  .join('\n');

const out = `/**
 * Where every club plays.
 *
 * GENERATED by scripts/build-venues.mjs from FotMob club endpoints.
 * Do not edit by hand — regenerate.
 *
 * ${entries.length} clubs of ${ids.length} seen across ${wanted.length} competitions.
 * A club is ABSENT rather than approximated when the feed publishes no
 * coordinates, and the tour drops its fixtures rather than pinning them to a
 * country. On a map a guess looks exactly as confident as a fact.
 *
 * [latitude, longitude, venue, city]
 */
export type VenueRow = [number, number, string | null, string | null];

export const VENUES: Record<string, VenueRow> = {
${body}
};
`;

const dest = 'src/data/geo/venues.ts';
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log(`${dest}: ${entries.length} clubs, ${(out.length / 1024).toFixed(1)}KB`);
