'use client';

import Link from 'next/link';
import { useCompetitionHref } from './useCompetitionHref';
import { cn } from '@/lib/cn';
import type { Competition } from '@/domain/types';

/**
 * The tiers within the country you are currently in.
 *
 * Second half of the rail's two-step: the rail picks a country, this picks the
 * division. It renders ONLY when the country has more than one tier, so twenty
 * of the twenty-two countries never see it — a control that appears where it
 * means something rather than sitting inert on every page.
 *
 * Ordering is the registry's, which lists each country's tiers top-down. That
 * is deliberate: "1st, 2nd, 3rd" is the one ordering of English football nobody
 * has to be taught, and alphabetising it (Championship, League One, League Two,
 * Premier League) would actively fight it.
 */
export function DivisionStrip({
  divisions, activeId,
}: {
  divisions: Competition[];
  activeId: string | null;
}) {
  const hrefFor = useCompetitionHref();
  if (divisions.length < 2) return null;

  const country = divisions[0]!.country;

  return (
    <nav
      aria-label={`${country} divisions`}
      className="border-b border-border-subtle bg-surface-1/25"
    >
      <div className="scroll-x mx-auto flex max-w-container items-center gap-2 px-4 py-1.5">
        <span className="eyebrow shrink-0">{country}</span>
        {divisions.map((d) => {
          const active = d.id === activeId;
          return (
            <Link
              key={d.id}
              href={hrefFor(d.id)}
              aria-current={active ? 'page' : undefined}
              style={{ ['--comp-active' as string]: `var(--comp-${d.accentKey})` }}
              className={cn(
                'shrink-0 rounded-sm px-2 py-1 text-2xs font-semibold uppercase tracking-caps',
                'transition-colors duration-fast ease-standard',
                active
                  ? 'bg-[color-mix(in_oklab,var(--comp-active)_20%,transparent)] text-ink'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink-secondary',
              )}
            >
              {d.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
