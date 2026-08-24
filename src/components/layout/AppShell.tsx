import { Suspense } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
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

  return (
    <div
      className="flex min-h-screen flex-col bg-canvas"
      style={{ ['--comp-active' as string]: `var(--comp-${key})` }}
    >
      {/* useSearchParams in the switcher requires a Suspense boundary. */}
      <Suspense fallback={<div className="h-header border-b border-border-subtle" />}>
        <Header
          competitions={competitions}
          activeId={activeId}
          liveCount={liveCount}
          editions={editions}
          activeEditionKey={activeEditionKey}
        />
      </Suspense>
      <main id="main" className="flex-1">{children}</main>
      <Footer competitions={competitions} />
    </div>
  );
}
