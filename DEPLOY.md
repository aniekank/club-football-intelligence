# DEPLOY

Repo: <https://github.com/aniekank/club-football-intelligence>
Branches: `main` → production · `staging` → staging

Everything below is done. The only step that needs you is connecting the repo in
the Render dashboard, because that requires your account.

---

## What the app needs from a host

It is a **stateful single-process server**, not a set of serverless functions:

- the dataset snapshot lives in memory on `globalThis`
- a background refresh loop starts on boot and keeps running
- a last-known-good cache is written to `.snapshot-cache/` on local disk

So it must run as one persistent web service. Serverless would reload the
snapshot on every cold start, hammer the upstream, and lose the disk cache.

## One-time Render setup

1. **New → Blueprint**, connect `aniekank/club-football-intelligence`.
   Render reads `render.yaml` and proposes two services:
   `club-football-intelligence` (from `main`) and
   `club-football-intelligence-staging` (from `staging`).
2. Set the one secret on **both** services, under Environment:

   | Key | Value | Needed for |
   |---|---|---|
   | `ODDS_API_KEY` | your the-odds-api.com key | Betting Edge only |
   | `ANTHROPIC_API_KEY` | optional | upgrades narratives when built |

   `NODE_VERSION` and `DATA_SOURCE` come from `render.yaml`.
   `RENDER_GIT_COMMIT` is injected by Render automatically — do not set it.

   **Match data needs no key.** With `ODDS_API_KEY` unset, everything works
   except the Betting Edge, which says so rather than erroring.
3. Deploy. Watch the log for `✓ Ready`, then check `/api/health`.

### Plan

`starter` (~$7/mo) per service in `render.yaml`. The **free** plan sleeps after
~15 minutes idle, and every wake re-runs the full boot load — roughly 20 upstream
requests. That is slow for the visitor and impolite to a source that costs
nothing. If you want to halve the cost, drop *staging* to free rather than
production.

## The health contract

`/api/health` is the health-check path and reports what is actually true:

```json
{
  "status": "ok",
  "commit": "d56eb48b6d91",
  "service": "club-football-intelligence",
  "dataSource": "fotmob",
  "competitionsLoaded": 6,
  "competitions": [
    { "id": "epl", "teams": 20, "matches": 380, "played": 9,
      "players": 360, "degraded": false, "state": "ready" }
  ],
  "failed": []
}
```

Three things to know:

- **`commit` answers "is my fix live?"** If it does not match the SHA you pushed,
  the deploy did not happen. Nothing else on this page matters more.
- **`dataSource` is read from the loaded snapshot, not from an env var.** An env
  var states an intention; a health check should state a fact.
- **`status` distinguishes booting from broken.** The snapshot load is
  asynchronous and takes tens of seconds, so for the first 180 seconds an empty
  instance reports `starting` and **200** — otherwise Render would kill every
  release mid-boot. After that grace period, still-empty reports `no-data` and
  **503**, which is a genuine failure worth alerting on.

## Promoting staging → production

```bash
# 1. Work on staging.
git checkout staging && git push origin staging      # auto-deploys staging

# 2. Gate locally.
npm run typecheck && npm test && npm run build

# 3. Gate on the deployed staging URL — CONTENT, not status codes.
curl -s https://<staging>.onrender.com/api/health | jq '.commit, .competitionsLoaded, .failed'
#    then walk TEST-PLAN.md sections 1, 2, 3 and 5.

# 4. Promote.
git checkout main && git merge --ff-only staging && git push origin main
```

Section 1.3 of `TEST-PLAN.md` is the one people skip and shouldn't: change a
visible string, push, and confirm `/api/health` reports the NEW commit. It is
the only proof the pipeline works.

## Cost and quota

| | |
|---|---|
| Render | ~$7/mo per always-on service |
| Match data (FotMob) | free, no key |
| Odds (free tier) | **500 credits/month** |

The odds budget is the real constraint. A sweep costs 3 credits per competition
(one per market, one region) — 18 for all six, so about one sweep a day with
headroom. `ODDS_TTL_MS` is 20 hours to enforce that, and the fetcher stops
before the wall rather than at it, keeping a reserve for a manual refresh during
a big matchweek. Raise the cadence only if you upgrade the plan.

## If the live source goes away

FotMob's API is undocumented. It needs no key today, has previously required an
`x-mas` header, and could add auth or block at any time. When that happens:

1. The app keeps serving. `loadOne()` falls back to `.snapshot-cache/`, flags the
   snapshot `degraded`, and the home page shows a "Showing cached data" banner
   with the age.
2. `/api/health` shows the competition's `state` as `stale-cache` with the error.
3. To swap sources, write one adapter that returns a `DatasetSnapshot` and passes
   `checkSnapshot()`. Nothing above the data layer changes — that is the entire
   point of the contract. `src/data/providers/fotmob.ts` is the worked example.

Note that `.snapshot-cache/` is on the instance's local disk, so a Render restart
loses it and the next boot re-fetches. If the upstream is blocked at the exact
moment of a restart, the app starts empty and reports `no-data`. A Render Disk,
or committing a snapshot export to the repo, would close that gap.
