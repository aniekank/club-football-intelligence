import { predictMatch } from '@/analytics/poisson';
import { minutesFloor } from '@/server/players';
import type { NarrativeContext } from '@/ai/narratives';
import type { DatasetSnapshot, SeasonForecast, Team, VenueKind } from '@/domain/types';

/**
 * The narrative context, built once.
 *
 * Two pages assembled this independently — the same snapshot, the same
 * forecasts, the same injected predictor — which is precisely how the fixture
 * on one page and the story about it on another drift apart. The engine takes
 * its model as an argument rather than importing one, so the argument has to be
 * supplied identically everywhere or that design buys nothing.
 */
export function narrativeContext(
  snapshot: DatasetSnapshot | undefined,
  forecasts: SeasonForecast[],
): NarrativeContext | null {
  if (!snapshot) return null;
  return {
    snapshot,
    forecasts,
    predict: (home: Team, away: Team, venueKind: VenueKind) =>
      predictMatch(home, away, { venueKind }),
    minutesFloor: minutesFloor(snapshot),
  };
}
