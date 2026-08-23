# Decisions

Short record of choices that would otherwise look arbitrary later.

## Fork nothing, harvest organs

`SPINOFF.md` in the parent repo specified a new repo with files copied
deliberately, not a fork — because the single-tournament assumption is baked
through the store, registry and forecast ladder. The build prompt said "extend
the World Cup codebase". Both were followed where they agree (heavy reuse) and
`SPINOFF.md` won where they conflict, reinforced by the later instruction that
the UI is not inherited at all.

Harvested: the bivariate-Poisson model, the seeded RNG, the Monte Carlo tally
pattern, the snapshot/capability architecture, and the scar tissue (stale-index
keying, never-bang-a-lookup, stale-live guards, BUGS.md discipline).

Rebuilt: the whole domain model, the standings engine, the data layer, and every
line of UI.

## FotMob as the live source

The build prompt assumed SportMonks covered the major leagues with xG. Probed
2026-08-23: it does not on this account — free plan, Denmark and Scotland only,
no xG. API-Football is also free-tier and refuses the current season. Understat
is unreachable from this network; FBref answers 403.

FotMob's public JSON needs no key, covers the current season across the top five
leagues plus UEFA, and carries genuine shot-level xG. It is undocumented and
could add auth or block at any time, so it sits behind the source-agnostic
snapshot contract with a last-known-good disk cache.

## No Recharts

The brief asked for charts that are not default Recharts, and the dataviz skill
requires a validated palette and specific mark specs. Adopting a library would
have meant fighting its defaults on colour, grid weight and tooltips. Recharts is
not a dependency at all.

## Next 14, and the two advisories that remain

npm flagged `next@14.2.5` (the parent's pin); moved to the patched `14.2.35`. Two
advisories remain and are only fixable by jumping to Next 16, which the Next 14
target rules out. One of them — the Image Optimizer `remotePatterns` DoS — did
apply to us, so that surface was removed outright: `next.config.mjs` declares no
remote image hosts and crests render through a plain `<img>` with explicit
dimensions. The other is a build-time postcss path, not reachable at runtime.

## The disk cache behind `webpackIgnore`

Next bundles `instrumentation.ts` for the EDGE runtime as well as node, and the
edge bundle has no loader for node built-ins — so a top-level `import fs` fails
the production build even though the code only runs under node. The import is
deferred with `webpackIgnore` rather than dropped, because losing it would cost
restart resilience. The pure edition/forecast store was split into
`src/data/editions.ts` so page code never reaches the Node-only module.

## Betting: three gates before a number exists

Documented at length in `BUGS.md` CFI-003. Briefly: an overround plausibility
check (the feed serves 280%-overround placeholder pricing), a model-readiness
gate (early-season ratings are compressed and "find value" on every underdog),
and an implausible tier (EV above 20% against a sharp book means the model is
wrong). Quarter-Kelly, never full.

## Zones from the feed, tiebreakers from the registry

European qualification bands move with cup winners and coefficient spots, so the
source's own legend wins where present and the static registry is the fallback.
Tiebreaker chains are the opposite: they are stable regulation, they differ
between leagues in ways no feed exposes, and getting them wrong silently
reorders a table — so they live in the registry as data with tests.
