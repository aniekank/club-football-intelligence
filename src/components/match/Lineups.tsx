import Link from 'next/link';
import { Figure, Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { LineupSlot, Team } from '@/domain/types';

/**
 * Starting elevens and substitutes.
 *
 * A list rather than a pitch diagram, deliberately. A formation graphic needs
 * per-player coordinates to be honest, and the ones available here describe the
 * nominal shape rather than where anyone actually played — a back three that
 * defended as a five would be drawn wrong, confidently. The formation STRING is
 * shown instead, which is exactly as precise as the underlying data.
 *
 * Ratings drive a subtle background tint, but the number is always present, so
 * the tint is reinforcement rather than the carrier.
 */
export function Lineups({
  home, away, lineups, formations, competitionId,
}: {
  home: Team | undefined;
  away: Team | undefined;
  lineups: Record<string, LineupSlot[]>;
  formations?: { home: string | null; away: string | null };
  competitionId: string;
}) {
  const sides = [
    { team: home, slots: home ? lineups[home.id] : undefined, formation: formations?.home },
    { team: away, slots: away ? lineups[away.id] : undefined, formation: formations?.away },
  ].filter((s) => s.slots?.length);

  if (!sides.length) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {sides.map(({ team, slots, formation }) => (
        <section key={team?.id}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {team?.shortName ?? 'Team'}
            {formation ? <Badge tone="neutral">{formation}</Badge> : null}
          </h3>
          <ul className="space-y-px">
            {(slots ?? [])
              .filter((s) => s.isStarter)
              .map((s) => (
                <PlayerRow key={s.playerId} slot={s} competitionId={competitionId} />
              ))}
          </ul>
          {(slots ?? []).some((s) => !s.isStarter) ? (
            <>
              <p className="eyebrow mb-1 mt-3">Substitutes</p>
              <ul className="space-y-px">
                {(slots ?? [])
                  .filter((s) => !s.isStarter)
                  .map((s) => (
                    <PlayerRow key={s.playerId} slot={s} competitionId={competitionId} muted />
                  ))}
              </ul>
            </>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function PlayerRow({
  slot, competitionId, muted,
}: { slot: LineupSlot; competitionId: string; muted?: boolean }) {
  const r = slot.rating;
  return (
    <li>
      <Link
        href={`/players/${slot.playerId}?competition=${competitionId}`}
        className={cn(
          'grid grid-cols-[1.75rem_2rem_1fr_auto] items-center gap-2 rounded-sm px-1 py-1',
          'transition-colors duration-fast ease-standard hover:bg-surface-2',
          muted && 'opacity-75',
        )}
      >
        <Figure tone="muted" className="text-2xs">
          {slot.shirtNumber ?? '—'}
        </Figure>
        <span className="text-2xs uppercase tracking-caps text-ink-muted">{slot.position}</span>
        <span className="truncate text-sm">{slot.name}</span>
        {r !== null ? (
          <span
            className="rounded-xs px-1.5 py-px"
            style={{
              // Ratings live in a narrow band; anchoring the tint at 6.0-8.5
              // makes the difference between a 6.4 and an 8.1 visible instead
              // of compressing everything into the same shade.
              background: `color-mix(in oklab, var(--seq-500) ${Math.round(Math.max(0, Math.min(1, (r - 6) / 2.5)) * 70)}%, transparent)`,
            }}
          >
            <Figure className="text-2xs font-semibold">{r.toFixed(1)}</Figure>
          </span>
        ) : (
          <span className="text-2xs text-ink-muted">—</span>
        )}
      </Link>
    </li>
  );
}
