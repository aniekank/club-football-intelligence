import { Suspense } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { CountryRail } from '@/components/nav/CountryRail';
import { InternationalBar } from '@/components/nav/InternationalBar';
import { DivisionStrip } from '@/components/nav/DivisionStrip';
import { liveAcrossCompetitions } from '@/server/active';
import type { Competition } from '@/domain/types';
import type { Edition } from '@/data/editions';

/**
 * The page frame. Binds `--comp-active` on the wrapper so every descendant can
 * reach the active competition's accent through one token, with no component
 * needing to know which competition it is inside.
 */
export function AppShell({
  competitions, activeId, accentKey, editions, activeEditionKey, children,
}: {
  competitions: Competition[];
  activeId: string;
  accentKey?: string;
  editions?: Edition[];
  activeEditionKey?: string;
  children: React.ReactNode;
}) {
  const active = competitions.find((c) => c.id === activeId);
  const key = accentKey ?? active?.accentKey ?? 'default';
  const liveCount = liveAcrossCompetitions().length;

  /**
   * The split is `tier`, which the registry already carried — a domestic league
   * has a country and belongs in the flag rail; a continental competition does
   * not and belongs in the centred bar. Deriving it means adding a competition
   * is a registry edit and nothing else.
   */
  const domestic = competitions.filter((c) => c.tier === 'domestic-league');
  const international = competitions.filter((c) => c.tier !== 'domestic-league');

  // The tiers of whichever country you are in — empty for a continental
  // competition, and a single entry for a country with only a top flight, in
  // which case the strip does not render at all.
  const divisions = active?.tier === 'domestic-league'
    ? domestic.filter((c) => c.country === active.country)
    : [];

  return (
    <div
      className="flex min-h-screen flex-col bg-canvas"
      style={{ ['--comp-active' as string]: `var(--comp-${key})` }}
    >
      {/* useSearchParams in the switcher requires a Suspense boundary. */}
      <Suspense fallback={<div className="h-header border-b border-border-subtle" />}>
        <Header
          activeId={activeId}
          liveCount={liveCount}
          editions={editions}
          activeEditionKey={activeEditionKey}
        />
      </Suspense>

      {/*
        Rail and content sit side by side from `lg`. Below that the rail
        collapses to a horizontal scroller above the content, because a phone
        has no left margin to spend on permanent navigation.
      */}
      <div className="flex flex-1 flex-col lg:flex-row lg:items-start">
        <Suspense fallback={<div className="border-b border-border-subtle lg:w-[6rem] lg:border-b-0 lg:border-r" />}>
          <div className="lg:w-[6rem] lg:shrink-0">
            <CountryRail competitions={domestic} activeId={activeId} />
          </div>
        </Suspense>

        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="h-10 border-b border-border-subtle" />}>
            <InternationalBar competitions={international} activeId={activeId} />
          </Suspense>
          <Suspense fallback={null}>
            <DivisionStrip divisions={divisions} activeId={activeId} />
          </Suspense>
          <main id="main">{children}</main>
        </div>
      </div>

      <Footer competitions={competitions} />
    </div>
  );
}
