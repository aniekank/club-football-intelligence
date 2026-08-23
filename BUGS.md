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
