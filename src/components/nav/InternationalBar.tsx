'use client';

import Link from 'next/link';
import { Flag, FLAG_FOR } from './Flag';
import { useCompetitionHref } from './useCompetitionHref';
import { cn } from '@/lib/cn';
import type { Competition } from '@/domain/types';

/**
 * Continental and world club competitions, centred above the page.
 *
 * These are the competitions that belong to no country, so they are the one
 * group that cannot live in the flag rail — a UEFA badge sitting in a column of
 * national flags claims an equivalence that is not true. Centring them is the
 * layout saying the same thing: the national leagues run down the side, and the
 * competitions that cut ACROSS them sit above.
 *
 * Grouped by confederation because the set now spans four of them plus FIFA,
 * and an ungrouped row of eight badges is a list rather than a structure. The
 * grouping is derived from each competition's `country` — 'Europe', 'World',
 * 'South America' — rather than hard-coded, so adding one is a registry edit.
 */

/** Display order. Anything unlisted sorts last, alphabetically. */
const REGION_ORDER = ['Europe', 'World', 'South America', 'North America', 'Asia'];

export function InternationalBar({
  competitions, activeId,
}: {
  competitions: Competition[];
  activeId: string | null;
}) {
  const hrefFor = useCompetitionHref();
  if (!competitions.length) return null;

  const byRegion = new Map<string, Competition[]>();
  for (const c of competitions) {
    const list = byRegion.get(c.country) ?? [];
    list.push(c);
    byRegion.set(c.country, list);
  }
  const regions = [...byRegion.entries()].sort(([a], [b]) => {
    const ia = REGION_ORDER.indexOf(a);
    const ib = REGION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  return (
    <nav
      aria-label="International club competitions"
      className="border-b border-border-subtle bg-surface-1/40"
    >
      {/*
        Centred with an AUTO MARGIN, not `justify-center`.

        `justify-content: center` on a scroller that overflows pushes the first
        items past the scroll origin and they become permanently unreachable —
        on a phone the Champions League was clipped off the left edge with no
        way to scroll back to it. An auto margin centres while there is spare
        room and collapses to zero when there is not, so the content simply
        starts at the left and scrolls.
      */}
      <div className="scroll-x flex">
      <div className="mx-auto flex max-w-container items-stretch gap-5 px-4 py-2">
        {regions.map(([region, comps]) => (
          <div key={region} className="flex shrink-0 items-center gap-3">
            <span className="eyebrow hidden shrink-0 sm:block">{region}</span>
            <div className="flex items-center gap-1">
              {comps.map((c) => {
                const active = c.id === activeId;
                return (
                  <Link
                    key={c.id}
                    href={hrefFor(c.id)}
                    aria-current={active ? 'page' : undefined}
                    title={c.name}
                    style={{ ['--comp-active' as string]: `var(--comp-${c.accentKey})` }}
                    className={cn(
                      'group inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2 py-1',
                      'transition-colors duration-fast ease-standard',
                      active
                        ? 'bg-[color-mix(in_oklab,var(--comp-active)_18%,transparent)]'
                        : 'hover:bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'rounded-full transition-all duration-normal ease-spring',
                        active
                          ? 'ring-1 ring-[var(--comp-active)]'
                          : 'opacity-70 group-hover:opacity-100',
                      )}
                    >
                      <Flag kind={FLAG_FOR[c.id] ?? 'UEFA'} size={18} />
                    </span>
                    <span
                      className={cn(
                        'text-2xs font-semibold uppercase tracking-caps',
                        active ? 'text-ink' : 'text-ink-muted group-hover:text-ink-secondary',
                      )}
                    >
                      {c.shortName}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      </div>
    </nav>
  );
}
