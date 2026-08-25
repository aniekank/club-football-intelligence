import Link from 'next/link';
import { Card, Figure, Crest, Badge } from '@/components/ui';
import { MatchCard } from './MatchCard';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Round, RoundHighlight, RoundMover } from '@/analytics/rounds';
import type { ID, Team } from '@/domain/types';

/**
 * The pieces a round is made of.
 *
 * ── One kind label, one accent ─────────────────────────────────────────────
 * There are four kinds of highlight and they are NOT four colours. The
 * validated palette clears its all-pairs colour-vision gate at three hues, so a
 * four-hue scheme here would be illegible to some readers for no gain: each
 * highlight already carries a word — "upset", "comeback" — and a word is a
 * better label than a hue nobody has learned. They share one accent.
 */

const KIND_LABEL: Record<RoundHighlight['kind'], string> = {
  upset: 'Upset',
  comeback: 'Turnaround',
  rout: 'Rout',
  thriller: 'Thriller',
};

export function RoundHighlights({
  highlights, teamById, suffix,
}: {
  highlights: RoundHighlight[];
  teamById: Map<ID, Team>;
  suffix: string;
}) {
  if (!highlights.length) return null;

  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {highlights.map((h, i) => {
        const home = teamById.get(h.match.homeTeamId);
        const away = teamById.get(h.match.awayTeamId);
        return (
          <li
            key={h.match.id}
            style={{ ['--reveal-i' as string]: i }}
            className="animate-fade-up stagger"
          >
            <Card
              as="article"
              interactive
              className="relative h-full overflow-hidden"
            >
              <Link
                href={`/matches/${h.match.id}${suffix}`}
                className="block p-4 focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-0 w-[2px] rounded-pill bg-[var(--series-1)]"
                />
                <p className="eyebrow">{KIND_LABEL[h.kind]}</p>
                <p className="mt-2 flex items-center gap-2">
                  <Crest url={home?.crestUrl ?? null} code={home?.code ?? '?'} name={home?.name ?? ''} size={18} />
                  <Figure className="text-lg font-semibold">
                    {h.match.homeScore}–{h.match.awayScore}
                  </Figure>
                  <Crest url={away?.crestUrl ?? null} code={away?.code ?? '?'} name={away?.name ?? ''} size={18} />
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                  {h.detail}
                </p>
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** Every match in one round, at full size. This is the round in focus. */
export function RoundGrid({
  round, teamById, suffix,
}: {
  round: Round;
  teamById: Map<ID, Team>;
  suffix: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {round.matches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          home={teamById.get(m.homeTeamId)}
          away={teamById.get(m.awayTeamId)}
          href={`/matches/${m.id}${suffix}`}
        />
      ))}
    </div>
  );
}

/**
 * What the round did to the table.
 *
 * A results page that does not say this is asking the reader to hold two
 * tables in their head and subtract. The arrow is drawn from the position
 * before the round to the position after it, because the pair is the fact —
 * "up three" without a destination is a number, not a position.
 */
export function RoundMovers({
  movers, suffix,
}: {
  movers: RoundMover[];
  suffix: string;
}) {
  if (!movers.length) {
    return (
      <p className="text-sm text-ink-muted">
        No club changed position in this round — which happens more often than
        the league table&rsquo;s reputation for drama suggests.
      </p>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {movers.map((m) => (
        <li key={m.team.id}>
          <Link
            href={`/teams/${m.team.id}${suffix}`}
            className={cn(
              'flex items-center gap-3 rounded-md border border-border-subtle bg-surface-1 px-3 py-2',
              'transition-colors duration-fast ease-standard hover:bg-surface-2',
            )}
          >
            <Crest url={m.team.crestUrl} code={m.team.code} name={m.team.name} size={20} />
            <span className="min-w-0 flex-1 truncate text-sm">{m.team.shortName}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <Figure tone="muted" className="text-xs">{m.from}</Figure>
              <span aria-hidden="true" className="text-2xs text-ink-muted">→</span>
              <Figure className="text-sm font-semibold">{m.to}</Figure>
              <Figure
                className={cn(
                  'w-8 text-right text-xs',
                  m.places > 0 && 'text-status-good',
                  m.places < 0 && 'text-status-critical',
                )}
              >
                {m.places > 0 ? `+${m.places}` : m.places}
              </Figure>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * A round reduced to one line, for the ones the reader is not looking at.
 *
 * The hint has to be enough to decide whether to open it. A round summarised
 * as "Matchweek 19" is a locked door with a label on it; one summarised as
 * "31 goals · Bahia beat Flamengo by 4" is an invitation or a pass, and either
 * answer saves a click.
 */
export function roundHint(round: Round): string {
  const from = formatDate(round.from);
  const to = formatDate(round.to);
  const dates = from === to ? from : `${from} – ${to}`;

  // Nothing played yet: the only useful thing to say is when. "0/10 played" is
  // a progress bar for a race that has not started.
  if (round.played === 0) {
    return `${round.matches.length} ${round.matches.length === 1 ? 'fixture' : 'fixtures'} · ${dates}`;
  }

  const parts: string[] = [];
  if (round.goals !== null) parts.push(`${round.goals} goals`);
  if (!round.complete) parts.push(`${round.played}/${round.matches.length} played`);
  const lead = round.highlights[0];
  if (lead) parts.push(lead.detail);
  if (!parts.length) parts.push(dates);
  return parts.join(' · ');
}

export function RoundDates({ round }: { round: Round }) {
  const from = formatDate(round.from);
  const to = formatDate(round.to);
  return <>{from === to ? from : `${from} – ${to}`}</>;
}

/** The split of results in a round, as a single bar. */
export function ResultSplit({ round }: { round: Round }) {
  const total = round.homeWins + round.draws + round.awayWins;
  if (!total) return null;

  const parts = [
    { key: 'home', label: 'Home wins', n: round.homeWins, colour: 'var(--series-1)' },
    { key: 'draw', label: 'Draws', n: round.draws, colour: 'var(--border-strong)' },
    { key: 'away', label: 'Away wins', n: round.awayWins, colour: 'var(--series-2)' },
  ];

  return (
    <figure className="m-0">
      <span
        className="flex h-[0.375rem] w-full overflow-hidden rounded-pill bg-surface-inset"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}
      >
        {parts.map((p) =>
          p.n === 0 ? null : (
            <span
              key={p.key}
              title={`${p.label}: ${p.n}`}
              style={{ width: `${(p.n / total) * 100}%`, background: p.colour }}
            />
          ))}
      </span>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-[0.375rem]">
            <span
              aria-hidden="true"
              className="h-[0.375rem] w-[0.375rem] rounded-full"
              style={{ background: p.colour }}
            />
            {p.label} <Figure>{p.n}</Figure>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function RoundBadge({ round }: { round: Round }) {
  if (round.complete) return null;
  return (
    <Badge tone="neutral">
      {round.played === 0 ? 'To come' : `${round.played}/${round.matches.length} played`}
    </Badge>
  );
}

/**
 * A round the reader has opened but is not studying — scores, one line each.
 *
 * The full card is right for the round in focus and wrong for the twenty-three
 * behind it: `<details>` keeps its contents in the DOM whether open or shut, so
 * a season of full grids is several hundred cards rendered to be looked at
 * once. This is the same information at the weight it deserves.
 */
export function RoundLines({
  round, teamById, suffix,
}: {
  round: Round;
  teamById: Map<ID, Team>;
  suffix: string;
}) {
  return (
    <ul className="grid gap-x-6 md:grid-cols-2">
      {round.matches.map((m) => {
        const home = teamById.get(m.homeTeamId);
        const away = teamById.get(m.awayTeamId);
        const played = m.homeScore !== null && m.awayScore !== null;
        const homeWon = played && (m.homeScore as number) > (m.awayScore as number);
        const awayWon = played && (m.awayScore as number) > (m.homeScore as number);
        return (
          <li key={m.id}>
            <Link
              href={`/matches/${m.id}${suffix}`}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-[0.375rem] text-sm',
                'transition-colors duration-fast ease-standard hover:bg-surface-2',
              )}
            >
              <span className={cn('flex min-w-0 flex-1 items-center justify-end gap-2 text-right', !homeWon && played && 'text-ink-muted')}>
                <span className="truncate">{home?.shortName ?? '—'}</span>
                <Crest url={home?.crestUrl ?? null} code={home?.code ?? '?'} name={home?.name ?? ''} size={16} />
              </span>
              <Figure tone={played ? 'default' : 'muted'} className="w-[3.5rem] shrink-0 text-center text-xs">
                {played ? `${m.homeScore}–${m.awayScore}` : formatDate(m.kickoff)}
              </Figure>
              <span className={cn('flex min-w-0 flex-1 items-center gap-2', !awayWon && played && 'text-ink-muted')}>
                <Crest url={away?.crestUrl ?? null} code={away?.code ?? '?'} name={away?.name ?? ''} size={16} />
                <span className="truncate">{away?.shortName ?? '—'}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
