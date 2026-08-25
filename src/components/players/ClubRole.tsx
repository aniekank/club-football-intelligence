import Link from 'next/link';
import { Figure } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { SquadMember, SquadView } from '@/server/squad';
import type { Team } from '@/domain/types';

/**
 * What this player is TO their club.
 *
 * The player page already answered "is this a good midfielder" — percentile
 * ranks against every midfielder in the division. It could not answer the
 * question a reader actually arrives with when they click a name on a club
 * page: how much of this team is him?
 *
 * ── Share, and the rank behind it ──────────────────────────────────────────
 * Each row is a share of the squad's output with the player's position in the
 * squad beside it. "38% of the goals" is the observation; "1st of 24" is what
 * stops a reader over-reading a share taken from a small pool.
 *
 * ── The denominators are the squad's own ───────────────────────────────────
 * Every total here is summed from the same player rows over the same matches,
 * never from the league table — whose season is longer than the window player
 * data covers. Mixing them produces a share that is silently, confidently
 * wrong, which the product has done once already and now guards against
 * everywhere it takes a ratio.
 */
export function ClubRole({
  team, squad, me, rankByMinutes, suffix,
}: {
  team: Team | undefined;
  squad: SquadView;
  me: SquadMember;
  rankByMinutes: number | null;
  suffix: string;
}) {
  const size = squad.members.length;

  const rankOf = (
    value: number | null,
    pick: (m: SquadMember) => number | null,
  ): number | null => {
    if (value === null) return null;
    const ordered = squad.members
      .map(pick)
      .filter((v): v is number => v !== null)
      .sort((a, b) => b - a);
    const i = ordered.indexOf(value);
    return i >= 0 ? i + 1 : null;
  };

  const rows = [
    {
      label: 'Minutes',
      share: me.minutesShare,
      rank: rankByMinutes,
      detail: `${me.stats.minutes} of a possible ${Math.round(squad.totals.minutes / 11)}`,
    },
    {
      label: 'Goals',
      share: me.goalShare,
      rank: rankOf(me.goalShare, (m) => m.goalShare),
      detail: `${me.stats.goals} of the squad's ${squad.totals.goals}`,
    },
    {
      label: 'Assists',
      share: me.assistShare,
      rank: rankOf(me.assistShare, (m) => m.assistShare),
      detail: `${me.stats.assists} of the squad's ${squad.totals.assists}`,
    },
    {
      label: 'Expected goals',
      share: me.xGShare,
      rank: rankOf(me.xGShare, (m) => m.xGShare),
      detail: squad.totals.xG !== null
        ? `${me.stats.xG.toFixed(1)} of the squad's ${squad.totals.xG.toFixed(1)}`
        : null,
    },
  ].filter((r) => r.share !== null && r.detail !== null);

  if (!rows.length) return null;

  return (
    <div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow">{r.label}</span>
              <span className="flex items-baseline gap-2">
                <Figure className={cn('text-lg', (r.share as number) >= 0.25 && 'font-semibold')}>
                  {Math.round((r.share as number) * 100)}%
                </Figure>
                {r.rank ? (
                  <span className="text-2xs text-ink-muted">
                    <Figure>{r.rank}</Figure> of <Figure>{size}</Figure>
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-[0.375rem] w-full overflow-hidden rounded-pill bg-surface-inset">
              <span
                className="block h-full rounded-pill"
                style={{
                  width: `${Math.min((r.share as number) * 100, 100)}%`,
                  background: r.rank === 1 ? 'var(--brand)' : 'var(--series-1)',
                }}
              />
            </div>
            <p className="mt-1 text-2xs text-ink-muted">{r.detail}</p>
          </div>
        ))}
      </div>

      {me.goalsMinusXG !== null && Math.abs(me.goalsMinusXG) >= 1 ? (
        <p className="mt-4 max-w-prose text-sm text-ink-secondary">
          {me.goalsMinusXG > 0 ? 'Ahead of' : 'Behind'} the chances taken by{' '}
          <Figure className="font-semibold">{Math.abs(me.goalsMinusXG).toFixed(1)}</Figure>{' '}
          goals. Finishing runs like this regress more often than they continue —
          it says as much about the last few months as about the player.
        </p>
      ) : null}

      {team ? (
        <p className="mt-4 text-2xs text-ink-muted">
          Measured against the{' '}
          <Link href={`/teams/${team.id}${suffix}`} className="underline underline-offset-2 hover:text-ink-secondary">
            {team.shortName}
          </Link>{' '}
          squad over the same matches, never against the league table — its
          season is longer than the window player data covers.
        </p>
      ) : null}
    </div>
  );
}
