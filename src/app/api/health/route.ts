import { NextResponse } from 'next/server';
import { loadedKeys, getCachedSnapshot } from '@/data/store';
import { loadStatus } from '@/data/bootstrap';

export const dynamic = 'force-dynamic';

/**
 * Health and provenance.
 *
 * Two jobs, and the second is the one that earns its keep.
 *
 * 1. WHICH BUILD IS SERVING. Render injects RENDER_GIT_COMMIT; without a commit
 *    hash in the response, "is my fix deployed?" is unanswerable and you end up
 *    debugging a deploy that silently never happened.
 *
 * 2. WHETHER THE DATA IS ACTUALLY THERE. A process can be perfectly healthy and
 *    serving an empty site — the snapshot load is asynchronous and the upstream
 *    is an undocumented API that can block. So this reports the real state of
 *    every competition rather than a bare "ok", and `dataSource` is read from
 *    the loaded snapshot, not from an env var. An env var states an INTENTION;
 *    a health check should state a fact.
 */
export async function GET() {
  const commit =
    process.env.RENDER_GIT_COMMIT ??
    process.env.NEXT_PUBLIC_COMMIT_SHA ??
    'dev';

  const keys = loadedKeys();
  const status = loadStatus();

  const competitions = keys.map((key) => {
    const snap = getCachedSnapshot(key);
    return {
      id: key,
      teams: snap?.teams.length ?? 0,
      matches: snap?.matches.length ?? 0,
      played: snap?.matches.filter((m) => m.status === 'FINISHED').length ?? 0,
      players: snap?.players.length ?? 0,
      degraded: snap?.meta.degraded ?? false,
      fetchedAt: snap?.meta.fetchedAt ?? null,
      state: status.competitions[key]?.state ?? 'unknown',
    };
  });

  const anyLoaded = competitions.some((c) => c.teams > 0);
  const failed = Object.entries(status.competitions)
    .filter(([, v]) => v.state === 'failed')
    .map(([k, v]) => ({ id: k, error: v.error }));

  /**
   * The grace period is load-bearing for deployability.
   *
   * Reporting unhealthy the moment data is absent looks rigorous and would
   * break every deploy: the snapshot load is asynchronous and takes tens of
   * seconds, so Render would see a failing health check on a booting instance
   * and kill the release before it ever finished starting.
   *
   * So the check distinguishes STILL BOOTING (healthy — give it time) from
   * BOOTED BUT EMPTY (genuinely unhealthy). Only the second is a 503.
   */
  const BOOT_GRACE_SECONDS = 180;
  const uptime = Math.round(process.uptime());
  const stillBooting = uptime < BOOT_GRACE_SECONDS;
  const healthy = anyLoaded || stillBooting;

  return NextResponse.json(
    {
      // "ok" only once real data is serving. A green health check on an empty
      // site is worse than a red one, because nothing then alerts.
      status: anyLoaded ? 'ok' : stillBooting ? 'starting' : 'no-data',
      commit: commit.slice(0, 12),
      service: process.env.RENDER_SERVICE_NAME ?? 'local',
      // The source that actually produced the active data.
      dataSource: getCachedSnapshot(keys[0] ?? '')?.meta.source ?? null,
      competitionsLoaded: competitions.filter((c) => c.teams > 0).length,
      competitions,
      failed,
      startedAt: status.startedAt,
      uptimeSeconds: uptime,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
