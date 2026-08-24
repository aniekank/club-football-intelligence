/**
 * Only link an entity that exists.
 *
 * The project's standing rule is "never `!` an entity lookup". This is its
 * mirror image, and it shipped broken: a lineup, a timeline and the transfer
 * table all linked /players/{id} unconditionally, and 137 of those links 404'd.
 *
 * The ids are real — they just are not in THIS snapshot. A match lineup names
 * players whose season stats were never ingested, and a transfer names the
 * player at both ends of a move, including the one who has just left the
 * competition. Neither has a page here.
 *
 * The transfer table already handled this correctly for CLUBS — a club outside
 * the competition is named but not linked — so the fix is to apply the rule the
 * page already demonstrated to the entity type that was missed.
 */
export function playerHref(
  id: string | null | undefined,
  known: Set<string>,
  suffix: string,
): string | null {
  if (!id || !known.has(id)) return null;
  return `/players/${id}${suffix}`;
}

/**
 * The query string every entity link must carry.
 *
 * Competition alone is not enough. An entity id is only meaningful inside one
 * EDITION: team 40 is Bournemouth in 2015/16 and nothing at all in the current
 * snapshot. Links built as `?competition=epl` therefore resolved against the
 * live season and 404'd for every club and player on an archive page — the
 * historical editions rendered perfectly and were entirely un-clickable.
 *
 * This existed correctly in five places as a local `suffix` and was hardcoded
 * without the season in nine others. One function so the two cannot drift.
 */
export function entitySuffix(competitionId: string, seasonParam?: string | null): string {
  return seasonParam
    ? `?competition=${competitionId}&season=${seasonParam}`
    : `?competition=${competitionId}`;
}

/**
 * Where an insight points.
 *
 * Insights name teams, matches and players, and each has its own route. Three
 * components render insights, and having each derive this independently is how
 * the link rules drifted last time — see CFI-010. One function.
 *
 * Returns null for a competition-level insight, which has no page of its own:
 * the card then renders unlinked rather than pointing somewhere arbitrary.
 */
export function insightHref(
  entityType: 'team' | 'player' | 'match' | 'competition',
  entityId: string | null,
  suffix: string,
): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case 'team': return `/teams/${entityId}${suffix}`;
    case 'match': return `/matches/${entityId}${suffix}`;
    case 'player': return `/players/${entityId}${suffix}`;
    case 'competition': return null;
  }
}
