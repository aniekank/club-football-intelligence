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
 *
 * ── Why the competitions are grouped ───────────────────────────────────────
 * This shipped as a single column when the product carried nine competitions.
 * At thirty-six that column was a wall, and worse, it was ambiguous: Honduras
 * and Guatemala both run a "Liga Nacional", Argentina and El Salvador both a
 * "Primera División", so the list contained repeated identical links going to
 * different places. Names are now disambiguated by country ONLY where they
 * collide — every league carrying its country would be noise for the thirty-two
 * that do not need it.
 */

/** Coarse regions, in the order a reader is likely to want them. */
const REGIONS: { title: string; countries: string[] }[] = [
  {
    title: 'Europe',
    countries: [
      'England', 'Spain', 'Italy', 'Germany', 'France', 'Turkey', 'Netherlands',
      'Portugal', 'Belgium', 'Scotland', 'Sweden', 'Norway', 'Denmark',
      'Switzerland', 'Austria', 'Poland', 'Greece',
    ],
  },
  {
    title: 'Americas',
    countries: [
      'Brazil', 'Argentina', 'United States', 'Mexico', 'Canada', 'Costa Rica',
      'Honduras', 'Guatemala', 'El Salvador', 'Panama',
    ],
  },
  { title: 'Rest of world', countries: ['Saudi Arabia', 'Australia'] },
];

export function Footer({ competitions }: { competitions: Competition[] }) {
  const domestic = competitions.filter((c) => c.tier === 'domestic-league');
  const international = competitions.filter((c) => c.tier !== 'domestic-league');

  // Only collisions get a country suffix.
  const nameCount = new Map<string, number>();
  for (const c of competitions) nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1);
  const labelFor = (c: Competition) =>
    (nameCount.get(c.name) ?? 0) > 1 ? `${c.name} (${c.country})` : c.name;

  const regions = REGIONS.map((r) => ({
    title: r.title,
    items: r.countries.flatMap((country) => domestic.filter((c) => c.country === country)),
  }))
    // A region with nothing loaded is not rendered at all.
    .filter((r) => r.items.length > 0);

  // Anything whose country is not in the map above still belongs somewhere.
  const placed = new Set(regions.flatMap((r) => r.items.map((c) => c.id)));
  const rest = domestic.filter((c) => !placed.has(c.id));
  if (rest.length) regions.push({ title: 'Elsewhere', items: rest });

  return (
    <footer className="mt-[3rem] border-t border-border-subtle bg-surface-1">
      <div className="mx-auto max-w-container px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_2.4fr]">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">
              Club Football <span className="text-brand">Intelligence</span>
            </p>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-secondary">
              Ratings, projections and market comparison across{' '}
              <span className="figure">{competitions.length}</span> competitions in{' '}
              <span className="figure">{new Set(domestic.map((c) => c.country)).size}</span>{' '}
              countries, from the Premier League to the Copa Libertadores. Every
              figure is computed from match data — none of it is editorial.
            </p>

            <h2 className="eyebrow mt-6">Method &amp; sources</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink-secondary">
              <li>Live match &amp; player data: FotMob</li>
              <li>Historical seasons: StatsBomb open data</li>
              <li>Market prices: The Odds API</li>
              <li>Projections: bivariate-Poisson, 8,000 simulated seasons</li>
            </ul>
            <p className="mt-2 max-w-prose text-2xs leading-relaxed text-ink-muted">
              Expected goals are the provider&rsquo;s model, not ours, and several
              competitions here publish none. Where a number is missing the site
              says so rather than showing a zero.
            </p>
          </div>

          <nav aria-label="All competitions" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FooterGroup title="International" items={international} labelFor={labelFor} />
            {regions.map((r) => (
              <FooterGroup key={r.title} title={r.title} items={r.items} labelFor={labelFor} />
            ))}
          </nav>
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
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Not affiliated with any club, league or betting operator.</span>
            <span className="text-ink-secondary">
              A <span className="font-semibold text-ink">Task Enterprises</span> product
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({
  title, items, labelFor,
}: {
  title: string;
  items: Competition[];
  labelFor: (c: Competition) => string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h2 className="eyebrow">{title}</h2>
      <ul className="mt-2 space-y-1">
        {items.map((c) => (
          <li key={c.id}>
            <Link
              href={`/table?competition=${c.id}`}
              className="group inline-flex items-center gap-2 text-sm text-ink-secondary transition-colors duration-fast ease-standard hover:text-ink"
            >
              <span
                aria-hidden="true"
                className="h-[0.375rem] w-[0.375rem] shrink-0 rounded-full opacity-70 transition-opacity duration-fast ease-standard group-hover:opacity-100"
                style={{ background: `var(--comp-${c.accentKey})` }}
              />
              {labelFor(c)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
