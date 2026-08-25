import { Skeleton } from '@/components/ui';
import { buildTour } from '@/server/tour';
import { WorldTour } from './WorldTour';

/**
 * The tour, resolved on the server.
 *
 * ── Why this is its own async component ────────────────────────────────────
 * Building the tour can require a cold venue lookup per club, and the whole
 * lobby should not wait behind that. Wrapped in a Suspense boundary, the rest
 * of the page streams immediately and the globe arrives when it has somewhere
 * honest to point. After the first request the lookups are cached for a day and
 * this resolves instantly.
 *
 * ── It renders nothing rather than a globe with one pin ────────────────────
 * A tour needs somewhere to go. With fewer than two locatable fixtures there is
 * no journey to make, and a globe holding a single dot is a picture of the
 * product not having any data — which is worse than the product not showing a
 * picture.
 */
export async function WorldTourPanel({ suffix }: { suffix: string }) {
  const stops = await buildTour(new Date().toISOString());
  if (stops.length < 2) return null;
  return <WorldTour stops={stops} suffix={suffix} />;
}

export function WorldTourSkeleton() {
  return (
    <div className="lit-edge overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
      <div className="grid gap-0 md:grid-cols-[minmax(0,20rem)_1fr] lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="aspect-square w-full border-b border-border-subtle p-6 md:border-b-0 md:border-r">
          <Skeleton className="h-full w-full rounded-full" />
        </div>
        <div className="space-y-3 p-5">
          <Skeleton className="h-3 w-[9rem]" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-[0.375rem] w-full" />
          <Skeleton className="h-3 w-[12rem]" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
