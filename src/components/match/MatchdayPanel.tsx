import Link from 'next/link';
import { Card, CardHeader, Figure, Crest, LiveDot, EmptyState } from '@/components/ui';
import { Disclosure } from '@/components/ui/Disclosure';
import { LocalTime } from '@/components/ui/LocalTime';
import { cn } from '@/lib/cn';
import type { Matchday, DayMatch } from '@/server/matchday';

/**
 * A day of football, everywhere.
 *
 * ── The layout follows the density, because the density will not sit still ──
 * Across the competitions loaded here a median day carries 9 matches, the
 * ninetieth percentile 104, and Saturday 134 — against 2 on the Thursday
 * before it. No single treatment survives that range: a full list is right at
 * 2 and unreadable at 134, a summary is right at 134 and insulting at 2.
 *
 * So the panel picks. Under a dozen matches it shows all of them. Above that it
 * leads with the shape of the day and the five worth watching, and everything
 * else waits behind a disclosure grouped by competition.
 *
 * ── The pulse is the striking part, and it is not decoration ───────────────
 * Football is not spread evenly through a day; it arrives in waves set by
 * kickoff conventions and time zones. Bucketing kickoffs by hour draws that
 * directly: an English Saturday is a 15:00 spike, a global Saturday is three
 * separate humps as Europe, then the Americas, come on. It answers "when is
 * there football on" faster than any list, and a list cannot answer it at all.
 */
export function MatchdayPanel({ day, suffix }: { day: Matchday; suffix: string }) {
  const dense = day.matches.length > 12;

  if (!day.matches.length) {
    return (
      <Card>
        <CardHeader eyebrow="Today" title="No football" />
        <EmptyState
          title="Nothing scheduled"
          description="No fixtures in any loaded competition on this date."
        />
      </Card>
    );
  }

  return (
    <Card className="lit-edge">
      <CardHeader
        eyebrow={<DayLabel day={day} />}
        title={
          dense
            ? `${day.matches.length} matches across ${day.competitions} competitions`
            : `${day.matches.length} ${day.matches.length === 1 ? 'match' : 'matches'}`
        }
        description={
          dense
            ? 'Ranked by the strength of the clubs involved, on the shared cross-league scale.'
            : undefined
        }
      />

      <div className="space-y-5 p-4">
        {dense ? <Pulse day={day} /> : null}

        {(dense ? day.headline : day.matches).map((d, i) => (
          <div
            key={d.match.id}
            style={{ ['--reveal-i' as string]: Math.min(i, 8) }}
            className="animate-fade-up stagger"
          >
            <Row d={d} suffix={suffix} featured={dense && i === 0} />
          </div>
        ))}

        {dense ? (
          <Disclosure
            title="Everything else"
            hint={`${day.matches.length - day.headline.length} more`}
          >
            <ByCompetition day={day} suffix={suffix} />
          </Disclosure>
        ) : null}
      </div>
    </Card>
  );
}

function DayLabel({ day }: { day: Matchday }) {
  return (
    <span className="flex items-center gap-2">
      <span>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'short',
      })}</span>
      {day.live > 0 ? (
        <span className="inline-flex items-center gap-[0.375rem] text-brand">
          <LiveDot />
          <Figure>{day.live}</Figure> live
        </span>
      ) : null}
    </span>
  );
}

/**
 * When the football actually is.
 *
 * Bars are the count of kickoffs in each UTC hour. Only hours with football are
 * drawn — an empty 04:00 tells the reader nothing and stretching the axis to
 * hold it flattens everything that matters.
 */
function Pulse({ day }: { day: Matchday }) {
  const max = Math.max(...day.byHour.map((h) => h.count), 1);
  const busiest = day.byHour.reduce((a, b) => (b.count > a.count ? b : a));

  return (
    <figure className="m-0">
      <div
        className="flex items-end gap-1"
        role="img"
        aria-label={`Kickoffs by hour. Busiest is ${String(busiest.hour).padStart(2, '0')}:00 UTC with ${busiest.count} matches.`}
      >
        {day.byHour.map((h) => (
          <div key={h.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <Figure
              tone={h.count === max ? 'default' : 'muted'}
              className={cn('text-2xs', h.count === max && 'font-semibold')}
            >
              {h.count}
            </Figure>
            <span
              title={`${String(h.hour).padStart(2, '0')}:00 UTC — ${h.count} matches`}
              className="w-full rounded-xs transition-colors duration-normal ease-standard"
              style={{
                height: `${Math.max((h.count / max) * 56, 3)}px`,
                background: h.count === max ? 'var(--brand)' : 'var(--series-1)',
              }}
            />
            <span className="figure text-2xs text-ink-muted">
              {String(h.hour).padStart(2, '0')}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-2xs text-ink-muted">
        Kickoffs by hour, UTC. Football arrives in waves set by kickoff
        conventions and time zones — the shape is the day.
      </figcaption>
    </figure>
  );
}

function Row({ d, suffix, featured }: { d: DayMatch; suffix: string; featured?: boolean }) {
  const m = d.match;
  const isLive = m.status === 'LIVE' || m.status === 'HALFTIME';
  const played = m.homeScore !== null && m.awayScore !== null;

  return (
    <Link
      href={`/matches/${m.id}?competition=${d.competitionId}`}
      style={{ ['--comp-active' as string]: `var(--comp-${d.accentKey})` }}
      className={cn(
        'group relative flex items-center gap-3 rounded-md border border-border-subtle bg-surface-1 px-3',
        'transition-[transform,border-color,box-shadow] duration-normal ease-standard',
        'hover:-translate-y-px hover:border-border hover:shadow-md',
        featured ? 'py-4' : 'py-[0.625rem]',
      )}
    >
      {/* The competition's own accent, as a spine. With forty-three of them a
          label alone makes every row look identical. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-2 left-0 w-[2px] rounded-pill bg-[var(--comp-active)]"
      />

      <span className="min-w-0 flex-1">
        <span className="mb-1 flex items-center gap-2">
          <span className="eyebrow truncate">{d.competitionName}</span>
          {isLive ? <LiveDot /> : null}
        </span>
        <span className="flex items-center gap-2">
          <Side team={d.home} featured={featured} />
          <Figure tone="muted" className="shrink-0 text-2xs">v</Figure>
          <Side team={d.away} featured={featured} />
        </span>
      </span>

      <span className="shrink-0 text-right">
        {played ? (
          <Figure className={cn('font-semibold', featured ? 'text-2xl' : 'text-base')}>
            {m.homeScore}–{m.awayScore}
          </Figure>
        ) : (
          <Figure tone="secondary" className={featured ? 'text-xl' : 'text-sm'}>
            <LocalTime iso={m.kickoff} />
          </Figure>
        )}
      </span>
    </Link>
  );
}

function Side({ team, featured }: { team: DayMatch['home']; featured?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Crest
        url={team?.crestUrl ?? null}
        code={team?.code ?? '?'}
        name={team?.name ?? 'Unknown'}
        size={featured ? 22 : 18}
      />
      <span className={cn('truncate', featured ? 'text-base font-medium' : 'text-sm')}>
        {team?.shortName ?? '—'}
      </span>
    </span>
  );
}

function ByCompetition({ day, suffix }: { day: Matchday; suffix: string }) {
  const headline = new Set(day.headline.map((d) => d.match.id));
  const rest = day.matches.filter((d) => !headline.has(d.match.id));

  const groups = new Map<string, DayMatch[]>();
  for (const d of rest) {
    const list = groups.get(d.competitionName) ?? [];
    list.push(d);
    groups.set(d.competitionName, list);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([name, matches]) => (
          <div key={name}>
            <h4 className="eyebrow mb-2">
              {name} <Figure tone="muted">{matches.length}</Figure>
            </h4>
            <div className="grid gap-2 md:grid-cols-2">
              {matches.map((d) => (
                <Row key={d.match.id} d={d} suffix={suffix} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
