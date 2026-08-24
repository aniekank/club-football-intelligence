# Club Football Intelligence

Cross-league club football analytics: live tables, Monte Carlo season odds,
shot-level xG, and a model-versus-market Betting Edge — across the Premier
League, LaLiga, Serie A, the Bundesliga, Ligue 1 and the UEFA competitions.

The successor to [World Cup Intelligence](https://github.com/aniekank/world-cup-intelligence).
The analytics engine was harvested from it; the presentation layer was rebuilt
from nothing.

---

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

No API key is required for match data. The Betting Edge needs one:

```bash
cp .env.example .env
# ODDS_API_KEY=...   from the-odds-api.com (free tier: 500 credits/month)
```

| Command | |
|---|---|
| `npm run dev` | development server |
| `npm run build && npm start` | production build |
| `npm test` | 132 tests, hermetic, no network |
| `npm run typecheck` | `tsc --noEmit` |
| `npx tsx scripts/probe-fotmob.mts epl` | load a competition live and check conformance |
| `npx tsx scripts/probe-forecast.mts epl` | run the full engine against live data |
| `npx tsx scripts/probe-odds.mts epl` | check the odds join (costs 3 credits) |
| `node scripts/fetch-statsbomb.mjs 2 27 epl` | rebuild a historical edition (slow, offline) |

## How it fits together

```
FotMob ──┐
         ├──► adapter ──► DatasetSnapshot ──► store (globalThis) ──► pages
Odds API ┘                    ▲                     │
                              │                     ▼
                     conformance (zod)      ratings → Monte Carlo
```

Everything reads a `DatasetSnapshot`. Nothing touches a provider directly, so
adding a feed means writing one adapter that satisfies the contract and passes
`checkSnapshot()`.

| Path | |
|---|---|
| `src/domain/` | types, competition registry, zod conformance |
| `src/analytics/` | standings, goal model, ratings, season Monte Carlo, betting maths |
| `src/data/` | adapters, HTTP, snapshot store, bootstrap |
| `src/ai/` | entity resolver, narrative engine, natural-language ask |
| `src/components/` | tokens-driven UI and hand-built SVG charts |
| `src/app/` | routes |

## Design principles carried from the parent

**Missing data is `—`, never `0`.** The parent shipped advanced-metric UI against
a feed with no xG and spent weeks on "why does it show 0" bugs. Optional metrics
are `number | null` end to end; capability flags say what the source can do; the
UI hides what is absent and marks what is modelled `est.`

**The snapshot cache lives on `globalThis`, and indexes are keyed to snapshot
identity.** `instrumentation.ts` runs in a different module instance from request
handlers. Without the identity key, a handler serves new rows from the list
accessor while the keyed accessor misses on every lookup, and the app renders
blank with the data present.

**Never `!` an entity lookup.** A knockout tie with an undecided opponent renders
"TBD"; it does not crash a page.

**A conformance gate on the adapter's OUTPUT.** TypeScript checks the source;
zod checks what the untyped upstream JSON actually became.

## What is club-specific

A tournament is one competition, fixed squads, four weeks, neutral pitches. All
four break here, and the breaks are load-bearing:

- **Many competitions at once.** A club page fuses its league and its European
  campaign; `teamAcrossCompetitions` does the join.
- **Per-league tiebreakers, as data.** LaLiga and Serie A settle level clubs on
  head-to-head first; the Premier League never does; the Bundesliga reaches it
  only after goal difference. Same table, different champion — there is a test
  that asserts exactly that.
- **Home advantage is real.** The parent had to suppress its home multiplier
  because World Cup venues are neutral. Here it finally earns its keep.
- **Seasons, not brackets.** The Monte Carlo plays out remaining fixtures 8,000
  times, reconciled against results already played.
- **Squads mutate.** Player–club affiliation is an interval, not a field.
- **Editions, not just competitions.** The same competition has several seasons;
  live ones stream, completed ones load instantly from a committed cache.

## Search, narratives and ask

Both are DETERMINISTIC, not generative. Every sentence is assembled from numbers
already in the snapshot, so each is checkable, reproducible between requests, and
incapable of inventing a fact. Insight cards carry their own arithmetic; ask
answers ship the rows they were read from.

When a question is not understood, it says so and lists what it can do. Guessing
at an intent and answering confidently is worse than no answer — and the three
tests named "refusing rather than guessing" pin the accidents that made that
concrete: a stray possessive `s` resolving Swansea, `"per 90"` resolving Per
Mertesacker, `"eiffel tower"` resolving Kevin Toner.

Fuzzy matching is kept for the search box, where a typo should still find
Haaland, and switched off inside a sentence, where every ordinary word is a
chance to match something by accident.

## Editions

An *edition* is one competition in one season. Live editions stream from FotMob
and refresh; historical ones are built offline from StatsBomb open data and
committed, because a season is 380 matches at ~3MB of event data each.

| Edition | Source | Coverage |
|---|---|---|
| Top-5 leagues + UCL, current | FotMob | live, detail for a recent window |
| Premier League 2015/16 | StatsBomb | complete — 380 matches, 9,908 shots |
| LaLiga 2015/16 | StatsBomb | complete — 380 matches, 9,168 shots |

The historical editions are the only place a per-90 rate rests on a whole
season, and their tests assert against known football history: Leicester finish
on 81 points, Suárez wins the Pichichi on 40. If the standings engine or the xG
fold ever breaks, those stop being true.

## The data situation, honestly

Verified 2026-08-23. SportMonks and API-Football are both on free tiers that do
not cover the current season for the major leagues, so the live source is
**FotMob's public API** — no key, current season, genuine shot-level xG. It is
undocumented and could block at any time; everything sits behind the snapshot
contract and a last-known-good disk cache so a swap stays cheap.

See `docs/DECISIONS.md`.

## Betting Edge

Model probabilities against the sharpest available price, margin removed with
the power method. Three gates run before any number reaches the page:

1. **Market plausibility** — books whose probabilities sum outside ~100–125% are
   rejected. The feed serves 280%-overround placeholder pricing for markets that
   have not opened, and de-vigging that manufactures huge fake edges.
2. **Model readiness** — the entire edge column is withheld until the median club
   has played 6 matches, because early-season ratings are compressed and
   systematically over-rate underdogs.
3. **Implausibility** — EV above 20% against a sharp book is reported as "check
   model", not as value.

Staking is quarter-Kelly. The responsible-gambling panel sits above the numbers,
not in a footer.

**A positive expected value is not profit.** It is the average of many identical
bets assuming the model is right — and the model has no knowledge of team news,
injuries or motivation, all of which the market prices.

## Documentation

| | |
|---|---|
| `BUGS.md` | every defect, its root cause, and the test that pins it |
| `TEST-PLAN.md` | behaviour checks — content, never HTTP 200 |
| `docs/DESIGN-SYSTEM.md` | tokens, validated palette, chart rules |
| `docs/DECISIONS.md` | choices that would look arbitrary later |
| `DEPLOY.md` | Render setup, promotion sequence, quota, failure modes |

## Deployment

`render.yaml` defines production (`main`) and staging (`staging`) as persistent
web services — the app is stateful (in-memory snapshot, background refresh loop,
on-disk last-known-good cache), so never serverless.

`/api/health` reports the live commit, the real data source read from the loaded
snapshot, and per-competition row counts. It distinguishes *booting* from
*broken*: an empty instance is healthy for its first 180 seconds and a 503 after
that, so a release is never killed mid-boot but a genuinely empty one still
alerts.

See **`DEPLOY.md`** for the one-time Render setup, the promotion sequence, the
odds credit budget, and what to do if the live source goes away.
