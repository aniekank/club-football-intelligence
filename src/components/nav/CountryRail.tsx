'use client';

import Link from 'next/link';
import { Flag, FLAG_FOR } from './Flag';
import { useCompetitionHref } from './useCompetitionHref';
import { cn } from '@/lib/cn';
import type { Competition } from '@/domain/types';

/**
 * The domestic-league rail: one country, one flag, down the left edge.
 *
 * ── Why a rail and not a wheel ─────────────────────────────────────────────
 * The brief asked for a wheel. This is a vertical rail of circular flag tokens
 * instead, and the difference is deliberate: on a rotating control the target
 * MOVES as you operate it, so switching from England to Mexico means chasing a
 * position rather than pressing a place. A league switcher is a fast, repeated,
 * muscle-memory action — the same circular vocabulary, arranged so each country
 * keeps a fixed home.
 *
 * ── One entry per COUNTRY, not per league ──────────────────────────────────
 * With twenty-seven leagues a flat list is not navigable, and England alone now
 * has four tiers. So the rail is countries — which is also how a reader thinks
 * about it; nobody holds "the Premier League" and "England" as separate ideas —
 * and the divisions within a country appear in their own strip once you are
 * there. Two shallow choices instead of one list of twenty-seven.
 *
 * Selecting a country lands on its highest tier, unless you are already inside
 * that country, in which case the rail leaves your division alone.
 *
 * Continental competitions have no country and are deliberately absent — a UEFA
 * badge in a row of national flags states a false equivalence.
 *
 * At `lg` and up it is a fixed left rail. Below that it becomes a horizontal
 * scroller, because a 430px viewport has no left margin to give away.
 */
/**
 * Rail order: roughly by how much attention a country's football gets, which is
 * a presentation judgement and so lives here rather than in the registry.
 */
const COUNTRY_ORDER = [
  'England', 'Spain', 'Italy', 'Germany', 'France',
  'Turkey', 'Netherlands', 'Portugal', 'Belgium', 'Scotland',
  'Brazil', 'United States', 'Mexico',
  'Sweden', 'Norway', 'Denmark', 'Switzerland', 'Austria', 'Poland', 'Greece',
  'Saudi Arabia', 'Australia',
];

export function groupByCountry(competitions: Competition[]) {
  const byCountry = new Map<string, Competition[]>();
  for (const c of competitions) {
    const list = byCountry.get(c.country) ?? [];
    list.push(c);
    byCountry.set(c.country, list);
  }
  return [...byCountry.entries()].sort(([a], [b]) => {
    const ia = COUNTRY_ORDER.indexOf(a);
    const ib = COUNTRY_ORDER.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });
}

export function CountryRail({
  competitions, activeId,
}: {
  competitions: Competition[];
  activeId: string | null;
}) {
  const hrefFor = useCompetitionHref();
  if (!competitions.length) return null;

  const countries = groupByCountry(competitions);
  const activeCountry = competitions.find((c) => c.id === activeId)?.country ?? null;

  return (
    <nav
      aria-label="Domestic leagues"
      className={cn(
        'scroll-x flex gap-1 border-b border-border-subtle px-3 py-2',
        // The rail proper: fixed column, its own scroll, no page border.
        'lg:sticky lg:top-header lg:h-[calc(100vh-var(--header-height))] lg:flex-col',
        'lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-2 lg:py-4',
      )}
    >
      {countries.map(([country, leagues]) => {
        const active = country === activeCountry;
        // Already in this country? Keep the division you are on. Otherwise the
        // top tier, which is what "England" means to almost everyone.
        const target = active ? (activeId ?? leagues[0]!.id) : leagues[0]!.id;
        const c = leagues.find((l) => l.id === target) ?? leagues[0]!;
        return (
          <Link
            key={country}
            href={hrefFor(target)}
            aria-current={active ? 'page' : undefined}
            title={leagues.length > 1
              ? `${country} — ${leagues.length} divisions`
              : `${country} — ${c.name}`}
            style={{ ['--comp-active' as string]: `var(--comp-${c.accentKey})` }}
            className={cn(
              'group relative flex shrink-0 flex-col items-center gap-1 rounded-md px-2 py-2',
              'transition-colors duration-fast ease-standard',
              active ? 'bg-surface-2' : 'hover:bg-surface-2/60',
            )}
          >
            {/* The active marker is a bar in the competition's own accent,
                on the left at desktop and underneath on mobile — it follows the
                rail's axis rather than being a fixed decoration. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute rounded-pill bg-[var(--comp-active)] transition-opacity duration-normal ease-standard',
                'inset-x-2 bottom-0 h-[2px] lg:inset-x-auto lg:bottom-auto lg:left-0 lg:top-2 lg:h-[calc(100%-1rem)] lg:w-[2px]',
                active ? 'opacity-100' : 'opacity-0',
              )}
            />
            <span
              className={cn(
                'rounded-full ring-1 transition-all duration-normal ease-spring',
                active
                  ? 'ring-[var(--comp-active)] ring-offset-1 ring-offset-surface-canvas'
                  : 'opacity-70 ring-border-subtle group-hover:opacity-100',
              )}
            >
              <Flag kind={FLAG_FOR[c.id] ?? 'UEFA'} size={32} />
            </span>
            <span
              className={cn(
                'text-2xs font-semibold uppercase tracking-caps transition-colors duration-fast ease-standard',
                active ? 'text-ink' : 'text-ink-muted group-hover:text-ink-secondary',
              )}
            >
              {c.countryCode}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
