import { buildTour } from '@/server/tour';
import { WorldTour } from './WorldTour';

/**
 * The tour, resolved on the server.
 *
 * ── It renders nothing rather than a globe with one pin ────────────────────
 * A tour needs somewhere to go. With fewer than two locatable fixtures there is
 * no journey to make, and a globe holding a single dot is a picture of the
 * product not having any data — which is worse than the product not showing a
 * picture.
 */
export function WorldTourPanel({ suffix }: { suffix: string }) {
  const stops = buildTour(new Date().toISOString());
  if (stops.length < 2) return null;
  return <WorldTour stops={stops} suffix={suffix} />;
}
