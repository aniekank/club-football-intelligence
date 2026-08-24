import Link from 'next/link';
import type { Competition } from '@/domain/types';

/**
 * The site footer.
 *
 * Two jobs, and neither is decoration.
 *
 * First, provenance. Every number on this site is derived, and a reader who
 * cannot tell whether an xG figure came from a shot model or a season table
 * cannot judge it. Naming the sources — and being explicit that xG is the
 * provider's model, not ours — is the difference between a data product and a
 * confident-looking one.
 *
 * Second, it ends the page. Every page previously stopped dead at its last card
 * with several hundred pixels of empty canvas beneath, which reads as a page
 * that failed to finish loading rather than one that finished.
 *
 * What it deliberately does NOT carry is the responsible-gambling statement.
 * That lives above the odds on the Betting Edge page, on purpose: a disclaimer
 * under four hundred rows of prices is decoration, one the reader passes
 * through on the way in is a message. Repeating it down here would quietly
 * undo that decision. It links there instead.
 */
export function Footer({ competitions }: { competitions: Competition[] }) {
  return (
    <footer className="mt-12 border-t border-border-subtle bg-surface-1">
      <div className="mx-auto max-w-container px-4 py-10">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">
              Club Football <span className="text-brand">Intelligence</span>
            </p>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-secondary">
              Ratings, projections and market comparison across Europe&rsquo;s major
              leagues, the Champions League, MLS and Liga MX. Every figure is
              computed from match data — none of it is editorial.
            </p>
          </div>

          <nav aria-labelledby="footer-comps">
            <h2 id="footer-comps" className="eyebrow">Competitions</h2>
            <ul className="mt-3 space-y-1.5">
              {competitions.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/table?competition=${c.id}`}
                    className="group inline-flex items-center gap-2 text-sm text-ink-secondary transition-colors duration-fast ease-standard hover:text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full opacity-70 transition-opacity duration-fast ease-standard group-hover:opacity-100"
                      style={{ background: `var(--comp-${c.accentKey})` }}
                    />
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="eyebrow">Method &amp; sources</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-secondary">
              <li>Live match &amp; player data: FotMob</li>
              <li>Historical seasons: StatsBomb open data</li>
              <li>Market prices: The Odds API</li>
              <li>Projections: bivariate-Poisson, 8,000 simulated seasons</li>
            </ul>
            <p className="mt-3 text-2xs leading-relaxed text-ink-muted">
              Expected goals are the provider&rsquo;s model, not ours. Where a
              competition supplies none, the site says so rather than showing a
              zero.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border-subtle pt-5 text-2xs text-ink-muted">
          <p>
            Projections are estimates, not forecasts of any single result.{' '}
            <Link
              href="/edge"
              className="underline decoration-border-strong underline-offset-2 transition-colors duration-fast ease-standard hover:text-ink-secondary"
            >
              How we frame betting value
            </Link>
          </p>
          <p>Not affiliated with any club, league or betting operator.</p>
        </div>
      </div>
    </footer>
  );
}
