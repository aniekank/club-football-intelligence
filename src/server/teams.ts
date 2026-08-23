import { getCachedSnapshot, loadedKeys } from '@/data/store';
import type { Competition, Team } from '@/domain/types';

/**
 * Find every OTHER loaded competition a club is currently in.
 *
 * This is the join the tournament chassis had no concept of. A World Cup team
 * exists in exactly one competition; Arsenal are simultaneously in the Premier
 * League and the Champions League, and a team page that shows only one of them
 * is telling half the story during the half of the season that matters most.
 *
 * Matching is by club ID, which is stable across competitions because both come
 * from the same upstream source. If a second source is ever added, this becomes
 * a name-alias join like the odds one — and should reuse that machinery rather
 * than growing a second copy.
 */
export interface TeamElsewhere {
  competition: Competition;
  rank: number | null;
  played: number;
}

export function teamAcrossCompetitions(team: Team, excludeId: string): TeamElsewhere[] {
  const out: TeamElsewhere[] = [];
  for (const key of loadedKeys()) {
    const snap = getCachedSnapshot(key);
    if (!snap || snap.competition.id === excludeId) continue;
    if (!snap.teams.some((t) => t.id === team.id)) continue;
    const row = snap.standings.find((r) => r.teamId === team.id);
    out.push({
      competition: snap.competition,
      rank: row?.rank ?? null,
      played: row?.played ?? 0,
    });
  }
  // Domestic league first, then continental — the order a supporter thinks in.
  const tierOrder = { 'domestic-league': 0, 'domestic-cup': 1, continental: 2, 'super-cup': 3 };
  return out.sort((a, b) => tierOrder[a.competition.tier] - tierOrder[b.competition.tier]);
}
