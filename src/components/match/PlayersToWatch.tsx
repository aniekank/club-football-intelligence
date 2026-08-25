import Link from 'next/link';
import { Figure } from '@/components/ui';
import { cn } from '@/lib/cn';
import { playerHref } from '@/lib/entityLink';
import { playersToWatch, regularFloor } from '@/server/watch';
import type { DatasetSnapshot, Team } from '@/domain/types';

/**
 * The players most likely to decide this fixture.
 *
 * ── Ranked on production per 90, above a floor that scales with the pool ───
 * Totals reward whoever has played most; per-90 alone rewards whoever has
 * played least. The floor is 45% of the most-used player's minutes in the
 * competition, which means "a regular" whether the snapshot covers three
 * matches or thirty-eight, and needs no knowledge of the season's length.
 *
 * This is the same rule the league briefing uses, for the same reason: the
 * first version of that list was led by a player with no goals and one assist
 * off about fifty minutes.
 *
 * ── Squad, not lineup ──────────────────────────────────────────────────────
 * For an unplayed fixture there is no lineup, so this is drawn from the squad.
 * That is the honest scope: "who could decide this" rather than "who will
 * start", which nobody knows.
 */

export function PlayersToWatch({
  snapshot, home, away, suffix,
}: {
  snapshot: DatasetSnapshot;
  home: Team;
  away: Team;
  suffix: string;
}) {
  // The same ranking the globe's tour uses, from one module — a fixture named
  // on the home page and the same fixture opened should not disagree about who
  // is worth watching.
  const floor = regularFloor(snapshot);

  const sides = [
    { team: home, players: playersToWatch(snapshot, home.id, floor, 3), tone: 'var(--series-1)' },
    { team: away, players: playersToWatch(snapshot, away.id, floor, 3), tone: 'var(--series-2)' },
  ];

  if (sides.every((s) => !s.players.length)) {
    return (
      <p className="text-sm text-ink-muted">
        This competition has no player data in the current snapshot, so there is
        nobody to name. Better than naming somebody anyway.
      </p>
    );
  }

  const cov = snapshot.meta.playerStatsCoverage;
  const partial = cov && cov.matchesCovered < cov.matchesPlayed;

  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2">
        {sides.map(({ team, players, tone }) => (
          <div key={team.id}>
            <h4 className="mb-2 flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-[0.375rem] w-[0.375rem] rounded-full"
                style={{ background: tone }}
              />
              <span className="eyebrow">{team.shortName}</span>
            </h4>

            {players.length ? (
              <ul className="space-y-1">
                {players.map((p, i) => {
                  const href = playerHref(p.playerId, new Set([p.playerId]), suffix);
                  const body = (
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span className={cn('text-sm', i === 0 && 'font-semibold')}>{p.name}</span>
                        <span className="ml-2 text-2xs uppercase tracking-caps text-ink-muted">
                          {p.position}
                        </span>
                      </span>
                      <span className="shrink-0 text-2xs text-ink-muted">
                        <Figure>{p.goals}</Figure>G{' '}
                        <Figure>{p.assists}</Figure>A{' '}
                        <Figure className="text-ink-secondary">
                          {(Math.round(p.per90 * 100) / 100).toFixed(2)}
                        </Figure>
                        /90
                      </span>
                    </span>
                  );
                  return (
                    <li key={p.playerId}>
                      {href ? (
                        <Link
                          href={href}
                          className="block rounded-sm px-2 py-1 transition-colors duration-fast ease-standard hover:bg-surface-2"
                        >
                          {body}
                        </Link>
                      ) : (
                        <span className="block px-2 py-1">{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2 text-sm text-ink-muted">
                No regular with a goal involvement yet.
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-2xs text-ink-muted">
        Goal involvements per 90, among players with at least 45% of the most-used
        player&rsquo;s minutes.
        {partial
          ? ` Drawn from the last ${cov!.matchesCovered} of ${cov!.matchesPlayed} matches, not the full season.`
          : ''}
      </p>
    </div>
  );
}
