# TEST-PLAN

Behaviour tests. The rule inherited from the parent product: **assert on
CONTENT, never on HTTP 200.** A page that returns 200 with an empty table is the
failure mode this product is most prone to, because the data layer degrades
quietly by design.

Two tiers:

- **Automated** — `npm test`. Hermetic, no network, runs in under a second.
- **Manual** — the checks below. Run against staging before every promotion to
  production, and against production after.

---

## Automated coverage (122 tests)

| Area | File | What it pins |
|---|---|---|
| League tables | `src/analytics/standings.test.ts` | Per-competition tiebreaker chains, head-to-head mini-tables, zone bands, determinism |
| Goal model | `src/analytics/poisson.test.ts` | Venue asymmetry, distribution integrity, Asian handicap and totals settlement |
| Season forecast | `src/analytics/season.test.ts` | Probability sums, reconciliation against played fixtures, shrinkage, priors |
| Betting maths | `src/analytics/betting.test.ts` | De-vigging, Kelly bounds, value thresholds, market plausibility, readiness gate |
| Data adapter | `src/data/providers/fotmob.test.ts` | Round classification, conformance, capability honesty, code collisions |
| Snapshot store | `src/data/store.test.ts` | Index invalidation on swap, safe misses, stale-live guard |
| Player views | `src/server/players.test.ts` | Per-90 vs ratio handling, mid-rank percentile ties, missing-metric omission, leaderboard minutes floor |
| Historical editions | `src/data/providers/statsbomb.test.ts` | Real 2015/16 tables reproduced exactly, champion, code collisions, full-season coverage, goals-vs-xG sanity |
| Ask & resolver | `src/ai/ask.test.ts` | Real answers over 2015/16, refusal instead of guessing, search-box typo tolerance, cameo exclusion |

**The single most important automated test** is
`standings.test.ts → "the same results, two different champions"`. It runs one
identical set of results through the Premier League's tiebreaker chain and
LaLiga's, and asserts the champions **differ**. If that ever passes with both
leagues agreeing, the per-competition chain has stopped being consulted and
every table in the product is silently suspect.

---

## Manual behaviour checks

Run with `npm run build && npm start`, or against the staging URL. Wait for the
snapshot to load — `/api/health` reports the commit, and the home page shows
club names once data is in.

### 1. Deploy contract

| # | Check | Pass |
|---|---|---|
| 1.1 | `/api/health` returns `status: ok` | |
| 1.2 | `commit` matches the SHA you just pushed — **not** `dev` | |
| 1.3 | Changing a visible string, pushing, and re-checking shows the NEW commit | |

1.3 is the one that matters. It is the check that proves a deploy actually
happened, and its absence is what makes "is my fix live?" unanswerable.

### 2. Data honesty — the "shows 0" bug class

| # | Check | Pass |
|---|---|---|
| 2.1 | No metric anywhere renders `0` where the source has no data — it must be `—` | |
| 2.2 | An unplayed fixture shows a kickoff TIME, never `0–0` | |
| 2.3 | A postponed fixture shows a "Postponed" badge, never a score | |
| 2.4 | Modelled values carry the `est.` mark (field tilt, all forecasts, projected points) | |
| 2.5 | Switch to a competition with no shot data: the xG race and shot map are **absent**, not empty axes | |
| 2.6 | The table's xG columns disappear entirely when no club has xG | |

### 3. League tables

| # | Check | Pass |
|---|---|---|
| 3.1 | EPL table has 20 rows; Bundesliga and Ligue 1 have 18 | |
| 3.2 | **UCL shows every club on exactly 8 played** — knockout ties must not count | |
| 3.3 | Qualification rails match the legend, and every band appears in the legend | |
| 3.4 | Rank 1 shows the champion rail, not the generic Champions League one | |
| 3.5 | Asterisks appear only where a tie is genuinely informative — not on every row | |
| 3.6 | Hovering an asterisk explains the tiebreaker | |
| 3.7 | Clicking a club opens its team page | |

### 4. Forecasts

| # | Check | Pass |
|---|---|---|
| 4.1 | Title probabilities across the division sum to 100% | |
| 4.2 | Relegation probabilities sum to the number of relegation places | |
| 4.3 | Reloading the page gives IDENTICAL probabilities — the seed makes them stable | |
| 4.4 | Projected-points ranges are ordered p10 ≤ p50 ≤ p90 | |
| 4.5 | A shown 0% is footnoted as "did not occur in 8,000 simulations" | |

4.3 is easy to lose and embarrassing when lost: a title probability that jitters
on every refresh reads as broken however defensible the sampling noise.

### 5. Betting Edge

| # | Check | Pass |
|---|---|---|
| 5.1 | The responsible-gambling panel is ABOVE the numbers, not in a footer | |
| 5.2 | Early season: the readiness banner shows and **no** edge or stake is displayed | |
| 5.3 | After 6 matches: edges appear, and no EV above 20% is labelled anything but "check model" | |
| 5.4 | No fixture shows a market whose prices sum outside ~100–125% | |
| 5.5 | Stakes never exceed 25% of bankroll, and a negative-EV row shows no stake | |
| 5.6 | Every fixture names its bookmaker and the price's age | |
| 5.7 | The method section states the rejected-market and no-market counts honestly | |

### 6. Time and locale

| # | Check | Pass |
|---|---|---|
| 6.1 | With JS enabled, kickoff times show in YOUR timezone | |
| 6.2 | With JS disabled, times show UTC and are **labelled** UTC | |
| 6.3 | No hydration warning in the console | |

### 7. Degradation

| # | Check | Pass |
|---|---|---|
| 7.1 | Block `www.fotmob.com` in devtools, restart: the app serves the disk cache with a "Showing cached data" banner | |
| 7.2 | With no `.snapshot-cache` and the source blocked: skeletons, no crash, no blank white page | |
| 7.3 | Unset `ODDS_API_KEY`: the Betting Edge explains itself instead of erroring | |
| 7.4 | An unknown match or team id 404s once data has loaded | |

### 8. Appearance

| # | Check | Pass |
|---|---|---|
| 8.1 | `?theme=light` and `?theme=dark` both render correctly | |
| 8.2 | Toggling theme does NOT flash the wrong palette first | |
| 8.3 | At 375px wide, no page scrolls horizontally — only tables scroll, inside themselves | |
| 8.4 | With `prefers-reduced-motion`, the live dot stops pulsing and skeletons stop shimmering | |
| 8.5 | Tab through a page: focus rings are visible everywhere | |
| 8.6 | Every chart has a working "Show data" table | |
| 8.7 | Charts remain readable in both themes | |

**How to check 8.3 properly.** A screenshot cannot answer it: a clipped capture
and a scrolling body look identical, and headless Chrome does not reliably paint
scrollbars. Temporarily add `<OverflowProbe />` (from
`src/components/dev/OverflowProbe.tsx`) to the body in `src/app/layout.tsx`, run
`npm run dev`, and read the green strip at the foot of the page.
`{"overflow": false}` is the passing state — the `offenders` list will still name
the wide tables, which is correct, because they scroll inside their own
container. Remove the component when done; it is deliberately not wired in, so
that it is never bundled for readers.

_Last measured 2026-08-23: `overflow: false` on the home, table, fixtures, team,
match and edge pages._

### 9. Editions

| # | Check | Pass |
|---|---|---|
| 9.1 | The season picker appears only on competitions with more than one edition | |
| 9.2 | `?season=2015-2016` on EPL shows Leicester top on 81 points | |
| 9.3 | Switching season from a player or match page lands on the section root, not a 404 | |
| 9.4 | A historical edition shows "Full season" coverage; the live one shows the window | |
| 9.5 | A historical edition shows no forecast columns — nothing is left to simulate | |
| 9.6 | Player names read as nicknames ("Sergio Agüero"), not registered names | |

### 10. Narratives and ask

| # | Check | Pass |
|---|---|---|
| 10.1 | Every insight card's metrics support the sentence above them | |
| 10.2 | A completed season's briefing names the champion, not a "race" | |
| 10.3 | The briefing mentions live matches in OTHER competitions | |
| 10.4 | An unanswerable question says so and suggests alternatives — it never guesses | |
| 10.5 | Every ask answer shows the rows it came from | |
| 10.6 | A typo in the SEARCH box still resolves ("Leicster" → Leicester) | |
| 10.7 | Search works with JavaScript disabled, and a result URL is shareable | |
| 10.8 | Search results are scoped to the active edition and say so when empty | |

### 11. Accessibility

| # | Check | Pass |
|---|---|---|
| 11.1 | A screen reader announces form as one summary, not duplicated letters | |
| 11.2 | Every chart has a meaningful `aria-label` with real numbers | |
| 11.3 | Crests are decorative; club names are text | |
| 11.4 | Colour is never the only carrier of meaning — check the table bands and edge tiers | |

---

## Before promoting staging → production

1. `npm run typecheck && npm test && npm run build` all clean.
2. Sections 1, 2, 3 and 5 pass on staging.
3. `BUGS.md` updated for anything found.
4. Check the odds credit budget — the free tier is 500/month and a full sweep
   costs 18.
