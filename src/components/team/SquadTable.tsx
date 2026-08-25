import Link from 'next/link';
import { Figure, Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { byPosition, nationalities, type SquadView } from '@/server/squad';
import { playerHref } from '@/lib/entityLink';

/**
 * The squad, ordered by who actually plays.
 *
 * ── Minutes, not shirt numbers ─────────────────────────────────────────────
 * A squad list sorted by shirt number is a document; sorted by minutes it is
 * an observation — it shows you the team as the manager has actually picked it,
 * with the first-choice eleven at the top of each group and the fringe below.
 * The bar makes that legible without reading a single figure.
 *
 * ── Share of the club's output, not raw totals ─────────────────────────────
 * Twelve goals is a number. Twelve goals that are 38% of everything the club
 * scored is an observation about the club. The share is what connects a player
 * to their team, which is the thing this product was missing entirely.
 *
 * ── Loans are marked ───────────────────────────────────────────────────────
 * `Player.affiliations` has been an interval list since the first commit,
 * precisely so "is this player ours" has an answer, and nothing read it. A
 * loanee who is 30% of your goals is a different fact from an academy graduate
 * who is.
 */
export function SquadTable({ squad, suffix }: { squad: SquadView; suffix: string }) {
  if (!squad.members.length) {
    return (
      <p className="text-sm text-ink-muted">
        No player data for this club in the current snapshot.
      </p>
    );
  }

  const groups = byPosition(squad.members);
  const known = new Set(squad.members.map((m) => m.player.id));
  const nats = nationalities(squad.members);

  return (
    <div>
      {nats.length ? (
        <div className="mb-4">
          <p className="mb-2 text-sm text-ink-secondary">
            <span className="figure font-semibold text-ink">{squad.members.length}</span>{' '}
            players from{' '}
            <span className="figure font-semibold text-ink">{nats.length}</span>{' '}
            {nats.length === 1 ? 'country' : 'countries'}.
          </p>
          {/* By MINUTES, not headcount: a squad with twelve nationalities on the
              bench and an all-domestic eleven is a different club from one that
              rotates them. */}
          <div className="flex h-[0.375rem] w-full overflow-hidden rounded-pill bg-surface-inset">
            {nats.slice(0, 8).map((n, i) => (
              <span
                key={n.nationality}
                title={`${n.nationality}: ${n.players} ${n.players === 1 ? 'player' : 'players'}, ${Math.round(n.minutesShare * 100)}% of minutes`}
                className="h-full"
                style={{
                  width: `${n.minutesShare * 100}%`,
                  background: `var(--series-${(i % 8) + 1})`,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {nats.slice(0, 5).map((n, i) => (
              <span key={n.nationality} className="inline-flex items-center gap-[0.375rem] text-2xs">
                <span
                  aria-hidden="true"
                  className="h-[0.375rem] w-[0.375rem] rounded-full"
                  style={{ background: `var(--series-${(i % 8) + 1})` }}
                />
                {n.nationality}
                <Figure tone="muted">{n.players}</Figure>
              </span>
            ))}
            {nats.length > 5 ? (
              <span className="text-2xs text-ink-muted">+{nats.length - 5} more</span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="scroll-x">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">
            Squad by position, ordered by minutes played
          </caption>
          <thead>
            <tr className="border-b border-border text-2xs uppercase tracking-caps text-ink-muted">
              <th scope="col" className="px-2 py-2 text-left font-semibold">Player</th>
              <th scope="col" className="hidden w-[8rem] px-2 py-2 text-left font-semibold sm:table-cell">
                Nationality
              </th>
              <th scope="col" className="w-[7rem] px-2 py-2 text-left font-semibold">Minutes</th>
              <th scope="col" className="w-[3rem] px-2 py-2 text-right font-semibold">G</th>
              <th scope="col" className="w-[3rem] px-2 py-2 text-right font-semibold">A</th>
              <th scope="col" className="w-[6rem] px-2 py-2 text-right font-semibold">
                Share of goals
              </th>
            </tr>
          </thead>

          {groups.map((group) => (
            <tbody key={group.position}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={6}
                  className="border-b border-border-subtle bg-surface-2/40 px-2 py-1 text-left"
                >
                  <span className="eyebrow">{group.position}</span>
                </th>
              </tr>

              {group.players.map((m) => {
                const href = playerHref(m.player.id, known, suffix);
                return (
                  <tr
                    key={m.player.id}
                    className="border-b border-border-subtle/60 transition-colors duration-fast ease-standard hover:bg-surface-2"
                  >
                    <td className="min-w-0 px-2 py-2">
                      <span className="flex items-center gap-2">
                        <Figure tone="muted" className="w-[1.5rem] shrink-0 text-2xs">
                          {m.player.shirtNumber ?? '—'}
                        </Figure>
                        {href ? (
                          <Link href={href} className="min-w-0 truncate underline-offset-2 hover:underline">
                            {m.player.name}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate">{m.player.name}</span>
                        )}
                        {m.onLoan ? <Badge tone="info">Loan</Badge> : null}
                      </span>
                    </td>

                    <td className="hidden min-w-0 px-2 py-2 sm:table-cell">
                      <span className="block truncate text-2xs text-ink-secondary">
                        {m.player.nationality ?? '—'}
                      </span>
                    </td>

                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-[0.25rem] w-full min-w-[2rem] overflow-hidden rounded-pill bg-surface-inset">
                          <span
                            className="block h-full rounded-pill"
                            style={{
                              width: `${m.minutesShare * 100}%`,
                              background: 'var(--series-1)',
                            }}
                          />
                        </span>
                        <Figure tone="secondary" className="shrink-0 text-2xs">
                          {m.stats.minutes}
                        </Figure>
                      </span>
                    </td>

                    <td className="px-2 py-2 text-right">
                      <Figure className={cn(m.stats.goals > 0 && 'font-semibold')}>
                        {m.stats.goals}
                      </Figure>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Figure tone={m.stats.assists > 0 ? 'default' : 'muted'}>
                        {m.stats.assists}
                      </Figure>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {m.goalShare === null || m.stats.goals === 0 ? (
                        <Figure tone="muted">—</Figure>
                      ) : (
                        <Figure className={cn(m.goalShare >= 0.2 && 'font-semibold text-ink')}>
                          {Math.round(m.goalShare * 100)}%
                        </Figure>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <p className="mt-3 text-2xs leading-relaxed text-ink-muted">
        Ordered by minutes within each position, so the first-choice side sits at
        the top. Share of goals is measured against this squad&rsquo;s{' '}
        <span className="figure">{squad.totals.goals}</span> in the same matches
        these minutes come from — never against the league table, whose season is
        longer than the window player data covers.
        {squad.coverage && squad.coverage.covered < squad.coverage.played
          ? ` That window is ${squad.coverage.covered} of ${squad.coverage.played} matches.`
          : ''}
      </p>
    </div>
  );
}
