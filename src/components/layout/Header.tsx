import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';
import { ThemeToggle } from './ThemeToggle';
import { CompetitionSwitcher } from './CompetitionSwitcher';
import { LiveDot } from '@/components/ui';
import type { Competition } from '@/domain/types';

/**
 * The application shell's top bar.
 *
 * Sticky, one row on mobile and two on desktop, with the competition switcher
 * given its own rail — a club product is navigated BY competition far more
 * often than by section, so that control earns permanent space rather than
 * living in a menu.
 */
export function Header({
  competitions, activeId, liveCount,
}: {
  competitions: Competition[];
  activeId: string | null;
  liveCount: number;
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

        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink href="/">Today</NavLink>
          <NavLink href="/table">Table</NavLink>
          <NavLink href="/fixtures">Fixtures</NavLink>
          <NavLink href="/edge">Betting Edge</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {liveCount > 0 ? (
            <Link
              href="/?filter=live"
              className="hidden items-center gap-2 rounded-pill bg-brand-faint px-3 py-1 text-2xs font-semibold uppercase tracking-caps text-brand sm:inline-flex"
            >
              <LiveDot />
              <span className="figure">{liveCount}</span> live
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </div>

      <div className="border-t border-border-subtle/60">
        <div className="mx-auto max-w-container px-4">
          <CompetitionSwitcher competitions={competitions} activeId={activeId} />
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm px-3 py-2 text-sm font-medium text-ink-secondary transition-colors duration-fast ease-standard hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </Link>
  );
}
