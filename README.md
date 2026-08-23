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
| `npm test` | 83 tests, hermetic, no network |
| `npm run typecheck` | `tsc --noEmit` |
| `npx tsx scripts/probe-fotmob.mts epl` | load a competition live and check conformance |
| `npx tsx scripts/probe-forecast.mts epl` | run the full engine against live data |
| `npx tsx scripts/probe-odds.mts epl` | check the odds join (costs 3 credits) |

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

## Deployment

`render.yaml` defines production and staging as persistent web services — the
app is stateful (in-memory snapshot, background refresh), so never serverless.
`/api/health` echoes the live commit, which is what makes "is my fix deployed?"
answerable.

Promote staging to production only after `TEST-PLAN.md` sections 1, 2, 3 and 5
pass.
