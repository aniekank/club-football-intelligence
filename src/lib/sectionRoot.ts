/**
 * Where a switcher should land when it changes the dataset under the reader.
 *
 * Both the competition rail and the season picker swap the snapshot being
 * viewed. An entity id in the path does not survive that swap: match 5795372 is
 * a Premier League fixture and means nothing in LaLiga, and a 2015/16 squad
 * shares no player ids with the current one. So a detail page must fall back to
 * its LIST route.
 *
 * The subtlety that produced the bug: the list route is not always the detail
 * route's parent. Deriving it by trimming the last path segment sends
 * /matches/[id] to /matches and /teams/[id] to /teams, neither of which exists —
 * the lists live at /fixtures and /table. That shipped as four dead links
 * (two switchers x two sections), each a 404 from a control that looked fine.
 *
 * Hence an explicit map rather than string surgery. `detailRoutes.test.ts`
 * walks src/app and fails if a new [id] route appears without an entry here, so
 * the next detail page cannot reintroduce this quietly.
 */
export const LIST_ROUTE: Record<string, string> = {
  matches: '/fixtures',
  teams: '/table',
  players: '/players',
};

export function sectionRoot(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const section = segments[0];
  if (!section) return '/';
  // One segment is already a list or a top-level page — keep the reader there.
  if (segments.length === 1) return `/${section}`;
  return LIST_ROUTE[section] ?? `/${section}`;
}
