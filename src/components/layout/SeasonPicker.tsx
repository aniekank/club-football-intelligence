'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import { sectionRoot } from '@/lib/sectionRoot';
import type { Edition } from '@/data/editions';

/**
 * Season picker for the active competition.
 *
 * Only rendered when a competition genuinely has more than one edition, so the
 * control appears where it means something instead of sitting inert on every
 * page. The live season carries a dot in the brand colour — the same "now"
 * signal used by the live match indicator, so the vocabulary stays consistent.
 */
export function SeasonPicker({
  editions, activeKey,
}: {
  editions: Edition[];
  activeKey: string | undefined;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (editions.length < 2) return null;

  function hrefFor(edition: Edition): string {
    const next = new URLSearchParams(params.toString());
    next.set('competition', edition.competitionId);
    if (edition.live) next.delete('season');
    else next.set('season', edition.seasonLabel.replace('/', '-'));
    // A season change invalidates any entity id in the path — a 2015/16 player
    // does not exist in the current squad — so it always lands on the section's
    // LIST route rather than 404ing on a stale id.
    return `${sectionRoot(pathname)}?${next.toString()}`;
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Season">
      {editions.map((e) => {
        const active = e.key === activeKey;
        return (
          <Link
            key={e.key}
            href={hrefFor(e)}
            aria-current={active ? 'true' : undefined}
            title={e.blurb}
            className={cn(
              'inline-flex items-center gap-[0.375rem] rounded-sm px-2 py-1 text-2xs font-semibold uppercase tracking-caps',
              'transition-colors duration-fast ease-standard',
              active
                ? 'bg-surface-3 text-ink'
                : 'text-ink-muted hover:bg-surface-2 hover:text-ink-secondary',
            )}
          >
            {e.live ? (
              <span aria-hidden="true" className="h-[0.375rem] w-[0.375rem] rounded-full bg-brand" />
            ) : null}
            {e.live ? 'Live' : e.seasonLabel.replace('/', '–')}
          </Link>
        );
      })}
    </div>
  );
}
