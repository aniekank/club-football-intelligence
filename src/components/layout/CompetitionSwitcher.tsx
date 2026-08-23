'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { Competition } from '@/domain/types';

/**
 * The competition rail.
 *
 * The tournament product had a switcher between editions of ONE competition;
 * here several competitions run at once, so this is a primary navigation
 * control rather than an occasional one. It stays visible on every page and
 * preserves the current route when switching, because "the same view, different
 * competition" is the overwhelmingly common intent.
 *
 * Selecting a competition rebinds `--comp-active` at the layout level, which is
 * how each competition gets its own accent without any component knowing which
 * competition it is rendering.
 */
export function CompetitionSwitcher({
  competitions, activeId,
}: {
  competitions: Competition[];
  activeId: string | null;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(id: string): string {
    const next = new URLSearchParams(params.toString());
    next.set('competition', id);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div
      className="scroll-x -mx-4 flex gap-px px-4"
      role="tablist"
      aria-label="Competition"
    >
      {competitions.map((c) => {
        const active = c.id === activeId;
        return (
          <Link
            key={c.id}
            href={hrefFor(c.id)}
            role="tab"
            aria-selected={active}
            // The accent is set inline from the competition's own token, so the
            // rail is themed per competition without a class per competition.
            style={{ ['--comp-active' as string]: `var(--comp-${c.accentKey})` }}
            className={cn(
              'group relative shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors duration-fast ease-standard',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary',
            )}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'h-2 w-2 rounded-full transition-transform duration-fast ease-spring',
                  active ? 'scale-100' : 'scale-75 opacity-40 group-hover:opacity-70',
                )}
                style={{ background: 'var(--comp-active)' }}
              />
              {c.shortName}
              <span className="sr-only">{c.name}</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-2 bottom-0 h-px origin-center transition-transform duration-normal ease-standard',
                active ? 'scale-x-100' : 'scale-x-0',
              )}
              style={{ background: 'var(--comp-active)' }}
            />
          </Link>
        );
      })}
    </div>
  );
}
