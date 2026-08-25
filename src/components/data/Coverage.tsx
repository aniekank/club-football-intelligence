import { Figure } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { DatasetMeta } from '@/domain/types';

/**
 * What this competition actually carries.
 *
 * The product spans thirty-six competitions whose feeds differ enormously: the
 * Premier League has expected goals, shot coordinates, lineups and player
 * aggregates; Liga Nacional has a table and fixtures. The capability flags have
 * described that difference accurately since the first commit and were read in
 * exactly three places — so the UI degraded correctly and never told the reader
 * WHY a section they saw on one league was missing on another.
 *
 * That silence is the problem this fixes. A missing xG column looks like a bug
 * until something says the competition publishes none, at which point it looks
 * like honesty. Same pixels, opposite impression.
 *
 * The modelled metrics are listed separately and deliberately: `fieldTilt` and
 * `isBigChance` are OURS, derived from what the feed gives, and a reader
 * comparing competitions deserves to know which numbers are measured and which
 * are computed.
 */

const FLAGS: { key: keyof DatasetMeta['capabilities']; label: string; note: string }[] = [
  { key: 'hasXG', label: 'Expected goals', note: 'Chance quality, from the provider’s model' },
  { key: 'hasShotLocations', label: 'Shot locations', note: 'Where each attempt was taken' },
  { key: 'hasPlayerStats', label: 'Player statistics', note: 'Per-player aggregates' },
  { key: 'hasLineups', label: 'Line-ups', note: 'Who started, who came on' },
  { key: 'hasFormations', label: 'Formations', note: 'Starting shape' },
  { key: 'hasMomentum', label: 'Momentum', note: 'Pressure through the match' },
  { key: 'hasManagers', label: 'Managers', note: 'Who is in charge' },
  { key: 'hasMarketValues', label: 'Market values', note: 'Squad valuation' },
  { key: 'hasOdds', label: 'Market prices', note: 'Bookmaker odds for comparison' },
];

export function Coverage({ meta }: { meta: DatasetMeta }) {
  const caps = meta.capabilities;
  const have = FLAGS.filter((f) => caps[f.key] === true);
  const missing = FLAGS.filter((f) => caps[f.key] !== true);
  const cov = meta.playerStatsCoverage;

  return (
    <div>
      {/*
        The baseline is stated FIRST, because the count below can read as an
        indictment otherwise. Honduras publishes none of the nine and shows
        "0 of 9" — which looks like a broken competition rather than what it is:
        a full table, a full fixture list, and a feed that does not carry
        expected goals. The table and the fixtures are never in question.
      */}
      <p className="mb-4 max-w-prose text-sm text-ink-secondary">
        Every competition here carries a table, fixtures, results and the model
        built on them. The nine below are the extras that feeds differ on — and
        where a section is missing that you saw on another league, this is
        usually why.
      </p>

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Group title="Carried" items={have} present />
        <Group title="Not published" items={missing} present={false} />
      </div>

      {cov ? (
        <p className="mt-4 max-w-prose text-2xs leading-relaxed text-ink-muted">
          Player numbers are drawn from{' '}
          <Figure className="text-ink-secondary">{cov.matchesCovered}</Figure> of{' '}
          <Figure className="text-ink-secondary">{cov.matchesPlayed}</Figure> matches
          played — detail is fetched for a recent window rather than the whole
          season, so those totals are partial and every surface that shows them
          says so.
        </p>
      ) : null}

      {caps.modeledMetrics.length ? (
        <p className="mt-2 max-w-prose text-2xs leading-relaxed text-ink-muted">
          Computed here rather than measured:{' '}
          <span className="figure text-ink-secondary">
            {caps.modeledMetrics.join(', ')}
          </span>
          . These are derived from what the feed supplies and are marked as
          estimates wherever they appear.
        </p>
      ) : null}

      <p className="mt-2 max-w-prose text-2xs leading-relaxed text-ink-muted">
        Source: {meta.sourceLabel}.
        {meta.degradedKind === 'stale-cache'
          ? ' Currently serving a cached snapshot — the last refresh did not succeed.'
          : ''}
        {meta.degradedKind === 'partial-detail'
          ? ' Some match detail could not be fetched; those fixtures have results but no shot data.'
          : ''}
      </p>
    </div>
  );
}

function Group({
  title, items, present,
}: {
  title: string;
  items: { label: string; note: string }[];
  present: boolean;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="eyebrow mb-2">{title}</h4>
      <ul className="space-y-[0.375rem]">
        {items.map((f) => (
          <li key={f.label} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'mt-[0.35rem] h-[0.375rem] w-[0.375rem] shrink-0 rounded-full',
                present ? 'bg-status-good' : 'bg-border-strong',
              )}
            />
            <span className="min-w-0">
              <span className={cn('block text-sm', !present && 'text-ink-muted')}>
                {f.label}
              </span>
              <span className="block text-2xs text-ink-muted">{f.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
