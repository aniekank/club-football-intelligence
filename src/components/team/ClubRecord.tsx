import { Figure } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ClubTrophy, CoachSpell, ClubVenue } from '@/domain/types';

/**
 * Honours, and the ledger of who was in charge.
 *
 * Both are records rather than analysis — the club's own history stated back to
 * it — and both are easy to render dishonestly, so:
 *
 * TROPHIES carry the runner-up count beside the wins. A club with ten titles
 * and seven second places has a different history from one with ten titles and
 * no near misses, and showing only the wins flatters every club equally.
 *
 * COACHES are shown per SEASON, because that is the grain FotMob supplies: a
 * manager who stayed four years appears four times. Summing those into a single
 * "tenure" would need appointment and departure dates the feed does not give,
 * and inventing a date range from season labels would be a guess presented as a
 * record. Points per game is the comparable number across spells of different
 * lengths, so that is what the bar encodes.
 */

export function Honours({ trophies }: { trophies: ClubTrophy[] }) {
  if (!trophies.length) {
    return <p className="text-sm text-ink-muted">No honours recorded for this club.</p>;
  }
  const most = Math.max(...trophies.map((t) => t.won), 1);

  return (
    <ul className="space-y-2">
      {trophies.map((t) => (
        <li key={`${t.competitionName}-${t.country ?? ''}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm">
              {t.competitionName}
              {t.country ? (
                <span className="ml-2 text-2xs uppercase tracking-caps text-ink-muted">
                  {t.country}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-2xs text-ink-muted">
              <Figure className="text-sm font-semibold text-ink">{t.won}</Figure>
              {t.runnerUp > 0 ? (
                <>
                  {' '}· <Figure>{t.runnerUp}</Figure> runner-up
                </>
              ) : null}
            </span>
          </div>
          <div className="mt-1 h-[0.25rem] w-full overflow-hidden rounded-pill bg-surface-inset">
            <span
              className="block h-full rounded-pill"
              style={{ width: `${(t.won / most) * 100}%`, background: 'var(--brand)' }}
            />
          </div>
          {t.seasons.length ? (
            <p className="mt-1 truncate text-2xs text-ink-muted" title={t.seasons.join(', ')}>
              {t.seasons.slice(0, 6).join(' · ')}
              {t.seasons.length > 6 ? ` · +${t.seasons.length - 6} more` : ''}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function CoachLedger({ coaches }: { coaches: CoachSpell[] }) {
  if (!coaches.length) {
    return <p className="text-sm text-ink-muted">No managerial record available.</p>;
  }
  const best = Math.max(...coaches.map((c) => c.pointsPerGame ?? 0), 1);

  return (
    <div>
      <div className="scroll-x">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <caption className="sr-only">Manager by season, with points per game</caption>
          <thead>
            <tr className="border-b border-border text-2xs uppercase tracking-caps text-ink-muted">
              <th scope="col" className="px-2 py-2 text-left font-semibold">Season</th>
              <th scope="col" className="px-2 py-2 text-left font-semibold">Manager</th>
              <th scope="col" className="px-2 py-2 text-center font-semibold">W–D–L</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Pts / game</th>
            </tr>
          </thead>
          <tbody>
            {coaches.map((c, i) => (
              <tr
                key={`${c.managerId}-${c.season}-${i}`}
                className="border-b border-border-subtle/60 transition-colors duration-fast ease-standard hover:bg-surface-2"
              >
                <td className="px-2 py-2">
                  <Figure tone="secondary" className="text-xs">{c.season}</Figure>
                </td>
                <td className="min-w-0 px-2 py-2">
                  <span className="block truncate">{c.name}</span>
                  {c.competitionName ? (
                    <span className="block truncate text-2xs text-ink-muted">
                      {c.competitionName}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-center">
                  <Figure tone="secondary" className="text-xs">
                    {c.won}–{c.drawn}–{c.lost}
                  </Figure>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden h-[0.25rem] w-[4rem] overflow-hidden rounded-pill bg-surface-inset sm:block">
                      <span
                        className="block h-full rounded-pill"
                        style={{
                          width: `${((c.pointsPerGame ?? 0) / best) * 100}%`,
                          background: 'var(--series-1)',
                        }}
                      />
                    </span>
                    <Figure className={cn('text-sm', c.pointsPerGame === best && 'font-semibold')}>
                      {c.pointsPerGame === null ? '—' : c.pointsPerGame.toFixed(2)}
                    </Figure>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-2xs text-ink-muted">
        One row per season, which is the grain the source supplies — a manager
        who stayed four years appears four times. Points per game is what makes
        spells of different lengths comparable.
      </p>
    </div>
  );
}

export function VenueFacts({ venue }: { venue: ClubVenue }) {
  const facts = [
    venue.city ? { label: 'City', value: venue.city } : null,
    venue.capacity ? { label: 'Capacity', value: venue.capacity.toLocaleString() } : null,
    venue.opened ? { label: 'Opened', value: String(venue.opened) } : null,
    venue.surface ? { label: 'Surface', value: venue.surface } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  if (!facts.length) return null;

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {facts.map((f) => (
        <span key={f.label} className="inline-flex items-baseline gap-[0.375rem]">
          <span className="eyebrow">{f.label}</span>
          <Figure className="text-sm font-semibold">{f.value}</Figure>
        </span>
      ))}
    </div>
  );
}
