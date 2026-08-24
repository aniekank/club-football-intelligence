# BUGS

Running defect log, in the parent product's discipline: every bug gets an id, a
symptom, a root cause, and the hermetic test that stops it coming back. Numbering
starts at CFI-001.

Status: `open` · `fixed` · `wontfix`

---

## CFI-001 — Champions League table counted knockout ties as league-phase fixtures
**Status:** fixed · **Found:** 2026-08-23, by the live adapter probe
**Severity:** high — the flagship competition's table was simply wrong

**Symptom.** The UCL table showed Arsenal on 15 played, PSG on 17 and Bayern on
14. Every club plays exactly 8 in the league phase, so no row was correct, and
points, goal difference and every derived rank were inflated accordingly.

**Root cause.** UEFA's Swiss model ships the league phase and the knockout
bracket in ONE fixture list. The adapter coerced `roundName` with `Number()` and
treated anything finite as a matchweek; the knockout rounds arrive as `'playoff'`,
`'1/8'`, `'1/4'`, `'1/2'` and `'final'`, which coerce to `NaN` — but they were
still passed to the standings engine, which happily counted them.

**Fix.** `classifyRound()` splits numeric rounds (league phase, matchweek set)
from named rounds (knockout, matchweek `null`), and the standings engine receives
only `matchweek !== null` fixtures for non-`league` formats. Knockout ties stay
in the match list, so nothing is lost from the fixture surfaces.

**Test.** `src/data/providers/fotmob.test.ts` → "keeps knockout ties out of the
league-phase table" builds a fixture list mixing rounds 1-3 with a play-off, an
R16 tie and a final, and asserts the club appearing in five fixtures shows two
played.

**Lesson.** This is the same shape as the parent's WC-088 stage-mapping bug. A
competition format is not a detail of presentation — it decides which fixtures
are even eligible for the table.

---

## CFI-002 — Conformance check rejected a valid completed-season snapshot
**Status:** fixed · **Found:** 2026-08-23, immediately after CFI-001
**Severity:** low — a false failure, but one that would have trained us to ignore the gate

**Symptom.** Loading a completed UCL season failed conformance with
"meta.capabilities.hasXG is true but no match carries an xG value", despite the
league table carrying full season xG for all 36 clubs.

**Root cause.** xG legitimately arrives at two grains: per-match, derived from
the shot stream, and as season totals on the table. Match detail is only fetched
for a recent window, so a season that finished months ago has the second and not
the first. The check only looked at the first.

**Fix.** The capability-honesty rule now accepts xG at either grain.

**Lesson.** A conformance rule that fails on valid data is worse than no rule —
it teaches you to skip the output. Worth noting the gate still did its job here:
it forced a look that surfaced CFI-001 one line above.

---

## Known limitations (not bugs — tracked so they are not rediscovered)

- **Player data is not yet mapped.** FotMob's `matchDetails` carries `lineup` and
  `playerStats`; the adapter reports `hasPlayerStats: false` and `hasLineups:
  false` until they are. The capability flags are honest, so player surfaces are
  hidden rather than empty.
- **PPDA is unavailable.** No defensive-action-by-zone data upstream. Reported as
  `null` and hidden, never rendered as 0.
- **`fieldTilt` is modelled, not measured.** It is the share of a side's passes
  played in the opposition half, not the tracking-data definition (final-third
  touch share). Declared in `modeledMetrics` so the UI labels it "(est.)".
- **`isBigChance` is modelled** at an xG ≥ 0.30 threshold; FotMob exposes no
  per-shot big-chance flag.
- **The live source is undocumented.** FotMob's public API needs no key today but
  has previously required an `x-mas` header and could add auth or block at any
  time. Everything sits behind the snapshot contract so a swap stays cheap.

---

## CFI-003 — Fake betting edges from markets that had not opened
**Status:** fixed · **Found:** 2026-08-23, by the live odds probe
**Severity:** high — the most dangerous class of wrong number this product can emit

**Symptom.** The Betting Edge showed "+52.2% EV, strong value" on several
fixtures. Real edges against a sharp book are one to two percent.

**Root cause.** Two independent problems compounding.

First, the odds feed serves placeholder pricing for fixtures whose market has
not opened. Observed live: Newcastle 1.08 / Bournemouth 1.06 / Draw 1.06 — an
overround of 280%. De-vigging that produces meaningless "fair" probabilities,
and comparing a model against meaningless probabilities manufactures enormous
fake edges.

Second, and more fundamental: one matchweek into a season the model's ratings
are almost entirely last season's regressed prior, which compresses the spread
between clubs. A compressed model under-separates good teams from bad and so
"finds value" on essentially every underdog — systematically, and in the
direction most likely to lose money.

**Fix.** Three gates, all before an edge is produced rather than filtered from
the display afterwards:
1. `isUsableMarket()` rejects any book whose overround falls outside 100.5%-125%.
2. `assessReadiness()` withholds the entire edge column until the median club has
   played 6 matches, and says on the page exactly why.
3. An `implausible` strength tier: EV above 20% is reported as "check model", not
   as value. Major-league markets are efficient; a model claiming +40% against
   Pinnacle has found a bug in itself.

**Test.** `src/analytics/betting.test.ts` → "rejects the placeholder pricing the
live feed actually serves" uses the exact observed prices; "tiers a huge EV as
implausible rather than strong" pins the ceiling; "withholds edges until the
season has evidence" covers the readiness gate.

**Lesson.** For a product that touches money, a plausibility gate on the INPUT is
worth more than any amount of care in the maths downstream. The de-vig was
correct throughout; it was being fed garbage.

---

## CFI-004 — Kickoff times rendered in the server's timezone
**Status:** fixed · **Found:** 2026-08-23, by reading a screenshot
**Severity:** medium — a wrong time that looks right

**Symptom.** Liverpool v Nottingham Forest, an 11:30 UTC kickoff, rendered as
"07:30" — the host machine's US-Eastern time, served to every visitor.

**Root cause.** `Intl.DateTimeFormat` on the server uses the SERVER's timezone.
Every date and time in the app was formatted during server rendering.

**Fix.** `<LocalTime>` renders UTC with an explicit "UTC" marker on the server and
swaps to the viewer's timezone on mount. Deterministic SSR output, no hydration
mismatch, and a no-JavaScript reader still gets a correct time rather than a
confidently wrong one.

**Lesson.** The kickoff time is one of the few facts a reader will act on. This
is the parent product's LocalTime lesson arriving on schedule.

---

## CFI-005 — Club-name normaliser mangled names containing a legal-form prefix
**Status:** fixed · **Found:** 2026-08-23, by the odds-join probe
**Severity:** medium — silent, and silent is the worst kind

**Symptom.** "Aston Villa" normalised to `tonvilla`, so its fixtures never joined
to their odds and simply vanished from the Betting Edge. No error, no log.

**Root cause.** The normaliser stripped legal-form prefixes (`fc`, `afc`, `as`…)
with a regex over the CONCATENATED name, so `^as` matched the "as" inside
"astonvilla".

**Fix.** Tokenise first, then drop whole tokens that are legal-form noise, and
never drop the only token.

**Lesson.** A join that fails silently is worse than one that throws. The probe
that printed missed joins is what surfaced this; without it the fixtures would
just have been absent.

---

## CFI-006 — A result with nobody attached to it
**Status:** fixed · **Found:** 2026-08-24, by the user looking at a page
**Severity:** high — the product failed at the most basic thing it exists to do

**Symptom.** The Arsenal 3-0 Coventry page showed the scoreline, an xG race, a
shot map, a momentum chart, line-ups and eleven rows of match stats — and never
said who scored.

**Root cause.** `Match.events` was in the domain from the first commit and no
adapter ever populated it. FotMob serves the whole stream under
`matchFacts.events`; the shot stream I *was* ingesting even carried the goals
with `eventType: 'Goal'` and a `playerName`. The data was present throughout.

The deeper cause is what I chose to verify. Every check I wrote asked whether the
numbers were internally consistent — do goal events match the scoreline, do
minutes sum correctly, does the table add up — and none asked the question a
reader asks first. Conformance passing is not the same as the page being useful,
and a schema cannot tell you that a field nobody fills is a field nobody sees.

**Fix.** `mapEvents()` maps goals (with assists, penalties and own goals), cards
and substitutions from the live feed; the StatsBomb ingest derives the same from
its event stream. Scorers now appear on every match card, and a full timeline
sits directly under the score.

**Verification.** Attribution was checked against lineups ingested by a separate
code path, so the check is genuinely independent: 25/25 goals, 31/31 cards and
81/81 substitutions on the correct side across nine live matches. Across the full
2015/16 season, goal events equal the scoreline in 380/380 matches and per-side
in 380/380, totalling 1,026 — the real figure for that season.

**Smaller things caught on the way:**
- `assistStr` already reads "assist by X", so the detail line said "assist assist
  by Harrison Armstrong".
- Event details used StatsBomb's registered names, so a timeline read "Wayne Mark
  Rooney" beside a player page reading "Wayne Rooney".
- An own goal has to be credited to the side that BENEFITS while naming the
  player who conceded it; treating it as an ordinary goal would flatter a
  defender and corrupt any top-scorer list built from the stream.

**Lesson.** Ask what a reader wants from the page before asking whether the data
is consistent. Internal consistency is necessary and nowhere near sufficient, and
no amount of schema validation substitutes for looking at the thing.

---

## CFI-007 — Conference tables silently dropped every cross-conference match
**Status:** fixed · **Found:** 2026-08-24, during the MLS build
**Severity:** high — a wrong table that looked entirely plausible

**Symptom.** Nashville SC showed 18 played and 42 points. The real figures were
21 and 49. Every club in the league was understated, and the order was wrong.

**Root cause.** MLS ranks Eastern and Western separately, so the first
implementation computed each conference's table from only that conference's
clubs. `computeStandings` skips a match when either side is outside the given
team list — correct behaviour, and exactly wrong here, because an Eastern club's
matches against Western clubs still count toward its record. Every
cross-conference fixture vanished.

**Fix.** Two steps rather than one. Tally and order ALL thirty clubs once with
the competition's tiebreaker chain, then partition into conferences and
renumber. Partitioning preserves relative order, so each conference is already
correctly ordered; only the rank and the zone need recomputing against the
conference position.

**Test.** `standings.test.ts` covers the chain; the live probe pins the outcome —
Nashville's 21 played and 49 points now match the source's own table exactly.

**Lesson.** "Rank within a group" and "tally within a group" are different
operations, and conflating them produces a table that adds up internally while
being wrong about the world.

---

## CFI-008 — One null in a chart series deleted two entire leagues
**Status:** fixed · **Found:** 2026-08-24, by the conformance gate at boot
**Severity:** high — LaLiga and Serie A failed to load at all

**Symptom.** After adding MLS and Liga MX, the boot reported 8 of 10 editions
loaded, with LaLiga and Serie A failing: `matches.14.momentum.17.value: Expected
number, received null`.

**Root cause.** FotMob's momentum series can carry null readings for minutes it
has no value for. The schema required a number, so a single null in one optional
chart series on one match rejected the entire competition.

**Fix.** Two changes, and the second matters more than the first. Nulls are
filtered at map time — a null is not a zero, and plotting it would draw a spike
to the baseline that never happened. And the failure is now logged with its
full detail before it propagates, so the shape problem is visible rather than
inferred from a missing league.

**Lesson.** A conformance gate should be proportionate to what it is protecting.
Rejecting a whole competition over a cosmetic field trades a small defect for a
large one; the same rigour applied to a scoreline or a team reference is right,
because those genuinely poison everything downstream.

---

## CFI-009 — coverage counted a live match as covered but not as played

**Status:** fixed · **Found:** live, mid-matchday · **Severity:** high — the
whole EPL refresh was rejected while a game was in progress

**Symptom.** `/api/health` reported `loaded 10 · failed 1` with
`meta.playerStatsCoverage: matchesCovered exceeds matchesPlayed`. Nothing broke
visibly, because the previously-loaded snapshot kept serving.

**Root cause.** Match detail is fetched for LIVE matches as well as FINISHED
ones, and a live match's minutes are genuinely folded into the running totals.
But the coverage denominator counted only FINISHED matches. The moment a game
kicked off, covered exceeded played and conformance rejected the snapshot.

**Fix.** The denominator is every match that could have detail — finished OR in
progress — and `matchesCovered` is clamped to it rather than merely counted, so
the invariant does not depend on two filters agreeing forever.

**Lesson.** A gate that only fails during a narrow window fails in production
and never in testing. The graceful degradation worked exactly as designed — but
"the site still looks fine" is why this could have gone unnoticed for weeks.
Health output has to be read, not assumed.

---

## CFI-010 — the historical editions were loaded, rendered, and un-clickable

**Status:** fixed · **Found:** by crawling every internal link · **Severity:**
high — the archive feature was a dead end

**Symptom.** `/table?competition=epl&season=2015-2016` rendered the 2015/16
table correctly — Leicester, 81 points — and every single club link on it 404'd.
Same for every player on the archive players page. A link crawl over 18 seed
pages found **137 dead links**.

**Root cause.** Three separate defects that all presented as a 404:

1. **Entity links dropped the season.** An id is only meaningful inside one
   EDITION — team 40 is a 2015/16 club and does not exist in the live snapshot —
   but nine link sites were built as `?competition=epl`, so they resolved against
   the live season. The correct `suffix` pattern already existed in five other
   places; the two had silently drifted apart.
2. **Both switchers derived a dead base path.** The season picker sent
   `/matches/[id]` to `/matches` and `/teams/[id]` to `/teams`, neither of which
   is a route — the lists live at `/fixtures` and `/table`. The competition rail
   kept the entity id entirely, carrying an EPL match id into LaLiga.
3. **A squad member with no stats row 404'd.** `buildPlayerView` returned
   undefined when a player had no aggregated stats, so the page called
   `notFound()` for every unused substitute — 40 dead links on one match page.

**Fix.** One `entitySuffix()` so the two conventions cannot drift; one
`sectionRoot()` mapping detail routes to their real list route, used by both
switchers; and `buildPlayerView` degrading to identity-only instead of
vanishing. An unused substitute is a real player with a club, a shirt number and
a position — a 404 asserts they do not exist, which is false.

Verified by re-crawling: **590 links, 0 non-200**, and clicking through the
archive lands on Ranieri's Leicester and Kane's 25-goal season.

**Lesson.** Every one of these pages returned HTTP 200 and looked right. The
defect was only ever visible in what the page LINKED to, which no page test
checks. The link crawl also caught a regression I introduced while fixing the
others — the home page's live strip spans every competition, so it must carry
each match's own competition, not the active page's.

The guard that matters most is `sectionRoot.test.ts`: it walks `src/app`, and
fails if a new `[id]` route appears without a list-route mapping, or if a mapping
points at a directory with no `page.tsx`. Mutation-tested both ways.

---

## CFI-011 — a group stage loaded as a four-club competition

**Status:** fixed · **Found:** health output after adding the international
competitions · **Severity:** high — three competitions silently wrong

**Symptom.** FIFA Club World Cup loaded with **4 teams**, Copa Libertadores with
4, and AFC Champions League Elite with 16. All three reported `ready`, with no
error, and rendered a perfectly plausible small table.

**Root cause.** Composite tables were parsed on the assumption that they are
always "several conferences PLUS one combined overall", which is true of MLS
(Eastern 15, Western 15, Shield 30). The combined table was found by taking the
**widest** block. A group stage is eight groups of four and has no combined table
at all, so the widest was simply the first group — and the roster became Group A.

**The fix that did not work.** Comparing sizes: a combined table should be half
the total. That works for MLS and fails for AFC, where West-16 plus East-16 is
arithmetically identical to a combined-16 plus one group of 16.

**Fix.** A semantic test instead: the combined table is the one that *contains
exactly the clubs of all the others*. True of the Shield table, false of West, of
Group A, and of every real group. When none matches, the roster is the union of
every block and each block is a genuine group.

**Lesson.** "Take the widest" is a heuristic standing in for a definition. It
survived because MLS was the only composite competition in the product, and it
broke the moment a second shape arrived. The regression test now covers all
three shapes — combined-plus-groups, groups-with-no-combined, and two equal
regions — because the third is what makes the arithmetic shortcut wrong.

---

## CFI-012 — three ways a competition claimed something it had not won

**Status:** fixed · **Found:** reading the rendered tables · **Severity:**
medium — misleading, not incorrect arithmetic

Three separate misstatements, all surfaced by adding knockout competitions.

**A pure knockout rendered a table of zeroes.** Named rounds are excluded from
tallying — a final is not a matchweek, which is the CFI-001 fix — but a
competition made *entirely* of named rounds then produced a full standings table
with every club on played 0, points 0. CONCACAF Champions Cup looked like an
authoritative ranking of nothing. It now produces no standings, and the format
already had an honest empty state to fall back to.

**A group winner was labelled "Champions".** The adapter prefers the feed's
qualification legend over the registry, which is right for a league — it tracks
that season's real European allocation. FotMob labels position 1 of every block
"Champions", so Palmeiras topping Group A of the Club World Cup was captioned as
champions of it. The registry's own bands now win for group formats.

**A projection described a table that was not on screen.** The season model
ranks ONE combined table and reports P(finish 1st overall). Under a partitioned
table that is not what the column says: it read as "64% to win the Eastern
Conference" when it was really P(top all thirty MLS clubs), and as a flat 0% for
every club in a completed Club World Cup group that somebody had plainly won.
Model columns are now suppressed on grouped tables, with a line saying why.

**Lesson.** Each of these was a *label* problem rather than a maths problem, and
none would fail a test that only checked numbers. The product already spends
real effort refusing to call a league leader "champions"
(`titleDecidedByPlayoff`); the same claim walked back in through a vendor legend
and through a probability whose denominator had quietly changed.

**Still open:** the simulator cannot rank within a group. Suppressing the column
is honest but it is not the feature — per-group projection is the real fix.

---

## CFI-013 — a points deduction was adding points

**Status:** fixed · **Found:** reading the Championship table after widening
coverage · **Severity:** critical — wrong champion-facing data, silently

**Symptom.** Southampton sat **1st in the Championship on 7 points** from 1 win,
0 draws and 1 defeat. One win is three points. They were above three clubs on
two wins each.

The truth, from the same feed: Southampton are **24th on −1**, having been docked
four points.

**Root cause.** A sign convention mismatch across a boundary. The standings
engine's contract is that a deduction is a POSITIVE magnitude to subtract —
`points -= penalty`. FotMob publishes the opposite: an already-signed negative
number, `deduction: -4`. The adapter passed it straight through, so the engine
computed `3 − (−4) = 7`. A punishment became a bonus, and it moved the club from
bottom to top.

**Why it survived this long.** None of the original eight competitions had an
active deduction this season, so the path was never exercised on real data. The
unit test that covered it encoded my *assumption* rather than the vendor's
behaviour — a fixture with `deduction: 6` and `pts: 0`, which is internally
inconsistent and could not occur in a real feed.

**Fix.** The sign is now DERIVED rather than assumed: the adjustment is whatever
`pts` the feed publishes minus the points its own W/D/L imply. Self-consistent by
construction, and it survives the vendor changing convention. The `deduction`
field is a fallback for when the numbers to derive from are absent. The test
fixture is now shaped like a real feed row.

**Lesson.** Two lessons, and the second is the uncomfortable one.

A sign convention crossing a module boundary needs to be asserted at the
boundary, not assumed on both sides — the engine and the adapter were each
individually reasonable and disagreed silently.

And a hand-written fixture is only ever evidence about what the author believed.
This test passed for weeks while the behaviour it described was impossible. When
a fixture encodes a vendor's format, at least one case should be copied from a
real response rather than invented.

---

## CFI-014 — a three-week xG window presented as a season total

**Status:** fixed · **Found:** reading Argentina's table after adding it ·
**Severity:** high — a real number with the wrong meaning

**Symptom.** Vélez Sarsfield: **23 played, 2.3 xG**. That is a tenth of an
expected goal per match — not a rounding problem, a different quantity wearing
the same label.

**Root cause.** Where a competition's feed publishes season xG, the adapter uses
it. Where it does not — which is every league added from South America and
CONCACAF — the only xG available is derived from the shots in matches we fetched
detail for, a rolling three-week window. The tally summed those and labelled the
result a season total, so a club's "season xG" covered two of its twenty-three
games.

**Fix.** A season xG is now only reported when xG covers EVERY match the club has
played. Partial coverage reports null, which the column already renders as "—"
and the `hasXG` capability hides entirely. Competitions whose feed does publish
season totals are untouched, because the adapter overwrites the derived values
with the upstream ones afterwards.

**Lesson.** The product is careful never to render a missing number as zero. This
was the same failure in a subtler form: not a fabricated value, but a real value
whose denominator had quietly changed. "Do we have this number?" was answered
correctly; "does this number mean what the column says?" was never asked.
