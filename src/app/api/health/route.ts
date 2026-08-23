import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Phase 0 contract: this endpoint proves WHICH BUILD is actually serving.
 *
 * The parent product learned this the expensive way — "is my fix live?" is
 * unanswerable without a commit hash in the response, and you end up debugging a
 * deploy that never happened. Render injects RENDER_GIT_COMMIT; locally we fall
 * back to the git hash captured at build time, then to 'dev'.
 */
export async function GET() {
  const commit =
    process.env.RENDER_GIT_COMMIT ??
    process.env.NEXT_PUBLIC_COMMIT_SHA ??
    'dev';

  return NextResponse.json(
    {
      status: 'ok',
      commit: commit.slice(0, 12),
      service: process.env.RENDER_SERVICE_NAME ?? 'local',
      dataSource: process.env.DATA_SOURCE ?? 'fotmob',
      startedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
