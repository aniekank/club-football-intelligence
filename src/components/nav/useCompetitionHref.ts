'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { sectionRoot } from '@/lib/sectionRoot';

/**
 * Builds the link for switching competition, in one place.
 *
 * Two controls now offer this — the country rail and the international bar —
 * and they must agree exactly, because the rules are not obvious: switching
 * competition invalidates any entity id in the path (an EPL match id is not a
 * LaLiga match id) and any season (a 2015/16 key means nothing in a competition
 * that has no such edition). Both were live 404s before; see CFI-010.
 */
export function useCompetitionHref() {
  const pathname = usePathname();
  const params = useSearchParams();

  return function hrefFor(id: string): string {
    const next = new URLSearchParams(params.toString());
    next.set('competition', id);
    next.delete('season');
    return `${sectionRoot(pathname)}?${next.toString()}`;
  };
}
