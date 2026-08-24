import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';
import { ThemeToggle } from './ThemeToggle';
import { SeasonPicker } from './SeasonPicker';
import { LiveDot } from '@/components/ui';
import type { Edition } from '@/data/editions';

/**
 * The application shell's top bar.
 *
 * Sticky. Sections, search and theme only — competition selection moved OUT of
 * here, into a country rail down the left edge and a centred international bar,
 * because a club product is navigated by competition far more often than by
 * section and a single horizontal strip could not carry fourteen of them.
 */
export function Header({
  activeId, liveCount, editions, activeEditionKey,
}: {
  activeId: string | null;
  liveCount: number;
  editions?: Edition[];
  activeEditionKey?: string;
}) {
  return (
    <header className="sticky top-0 z-header border-b border-border-subtle bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-header max-w-container items-center gap-4 px-4">
        <Link
          href="/"
          className="shrink-0 rounded-sm transition-opacity duration-fast ease-standard hover:opacity-80"
        >
          <Wordmark />
        </Link>

        {/*
          The nav is the FLEXIBLE item and scrolls when the bar is tight; the
          controls beside it are `shrink-0` and never give way. Getting this
          backwards is what let the theme swatches slide off the right edge —
          a section link that needs a nudge to reach is a minor cost, a control
          you cannot see at all is not. */}
        <nav className="scroll-x ml-2 hidden min-w-0 flex-1 items-center gap-1 md:flex" aria-label="Main">
          <NavLink href="/">Today</NavLink>
          <NavLink href="/table">Table</NavLink>
          <NavLink href="/fixtures">Fixtures</NavLink>
          <NavLink href="/players">Players</NavLink>
          <NavLink href="/explore">Explore</NavLink>
          <NavLink href="/transfers">Transfers</NavLink>
          <NavLink href="/edge">Betting Edge</NavLink>
          <NavLink href="/ask">Ask</NavLink>
        </nav>

        {/*
          What yields, in order, as the bar narrows: search first (it has its
          own page), then the live badge (the count is on the home page too).
          The theme control never yields — it is a CONTROL, and a clipped
          control is a broken one, where a missing badge is only a missing badge.
        */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* A GET form, so search works without JavaScript and a result page
              is a shareable URL. */}
          {/*
            The search box is the first thing to go when the bar gets tight.
            At md the eight section links plus the live badge plus the theme
            swatches already fill the width, and search has its own page — a
            clipped nav item does not. */}
          <form action="/search" method="get" className="hidden lg:block">
            {activeId ? <input type="hidden" name="competition" value={activeId} /> : null}
            <input
              type="search"
              name="q"
              placeholder="Search"
              aria-label="Search clubs and players"
              className="h-8 w-32 rounded-sm border border-border-subtle bg-surface-1 px-2 text-xs placeholder:text-ink-muted focus-visible:shadow-focus lg:w-44"
            />
          </form>
          {liveCount > 0 ? (
            <Link
              href="/?filter=live"
              className="hidden items-center gap-2 rounded-pill bg-brand-faint px-3 py-1 text-2xs font-semibold uppercase tracking-caps text-brand lg:inline-flex"
            >
              <LiveDot />
              <span className="figure">{liveCount}</span> live
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </div>

      {editions && editions.length > 1 ? (
        <div className="border-t border-border-subtle/60">
          <div className="mx-auto flex max-w-container items-center justify-end gap-4 px-4 py-1">
            <SeasonPicker editions={editions} activeKey={activeEditionKey} />
          </div>
        </div>
      ) : null}
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      // `whitespace-nowrap`: without it a two-word item breaks mid-label when
      // the bar gets tight, and "Betting / Edge" over two lines reads as two
      // links rather than one.
      className="whitespace-nowrap rounded-sm px-2 py-2 text-sm lg:px-3 font-medium text-ink-secondary transition-colors duration-fast ease-standard hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </Link>
  );
}
