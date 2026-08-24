import { Figure } from '@/components/ui';
import { cn } from '@/lib/cn';
import { styleContrasts, styleHeadline, type TeamStyle } from '@/analytics/style';
import type { Team } from '@/domain/types';

/**
 * How the two sides play, contrasted measure by measure.
 *
 * ── A shared bar, not two numbers ──────────────────────────────────────────
 * Each row is one bar split between the sides in proportion to their values, so
 * the SHAPE of the fixture is legible before any figure is read: a lopsided
 * possession bar over an even press bar is a different game from the reverse.
 * Two separate gauges would make the reader do that comparison themselves,
 * which is the work the chart is supposed to do.
 *
 * ── The formation is stated, not interpreted ───────────────────────────────
 * A formation is a starting shape. Two sides in 4-2-3-1 can play completely
 * different football, and the measures below are what actually separate them,
 * so the shape is shown as a label and never used to characterise anyone.
 *
 * ── Coverage is on the face of it ──────────────────────────────────────────
 * Detail is fetched for a rolling window, so a profile may rest on three
 * matches or thirty. A tactical read from two games is a curiosity, and
 * presenting it as confidently as one from twenty is the same failure as
 * showing a partial total as a season total. The count is in the caption.
 */
export function Tactics({
  home, away, homeStyle, awayStyle, formations,
}: {
  home: Team;
  away: Team;
  homeStyle: TeamStyle;
  awayStyle: TeamStyle;
  formations?: { home: string | null; away: string | null };
}) {
  const rows = styleContrasts(homeStyle, awayStyle);
  const sample = Math.min(homeStyle.matches, awayStyle.matches);
  /**
   * The headline is SUPPRESSED on a thin sample.
   *
   * "Man City will have the ball" off one match each is a coin-flip dressed as
   * a read, and it sat directly above a caption admitting the sample was too
   * small to lean on — the page hedging and asserting in the same breath. The
   * bars stay, because a number with its sample size stated is honest; a
   * sentence is not, because a sentence carries no error bars.
   */
  const headline = sample >= 3
    ? styleHeadline(homeStyle, awayStyle, home.shortName, away.shortName)
    : null;

  if (!rows.length || sample === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No match detail has been ingested for these sides yet, so there is
        nothing to compare. This is not a claim that they play alike.
      </p>
    );
  }

  return (
    <div>
      {headline ? (
        <p className="mb-4 max-w-prose font-display text-lg leading-snug">{headline}</p>
      ) : sample < 3 ? (
        <p className="mb-4 max-w-prose text-sm text-ink-secondary">
          Too early to characterise either side — these are the numbers so far,
          not a read on how they play.
        </p>
      ) : (
        <p className="mb-4 max-w-prose text-sm text-ink-secondary">
          Nothing in the numbers separates these two by much — which is itself
          worth knowing, and more common than most previews admit.
        </p>
      )}

      {formations?.home || formations?.away ? (
        <div className="mb-4 flex items-center justify-between gap-4 text-2xs">
          <span className="flex items-center gap-2">
            <span className="eyebrow">{home.shortName}</span>
            <Figure className="text-sm">{formations.home ?? '—'}</Figure>
          </span>
          <span className="eyebrow">Starting shape</span>
          <span className="flex items-center gap-2">
            <Figure className="text-sm">{formations.away ?? '—'}</Figure>
            <span className="eyebrow">{away.shortName}</span>
          </span>
        </div>
      ) : null}

      <div className="space-y-3">
        {rows.map((r) => {
          const h = r.home;
          const a = r.away;
          // Share of the bar. With one side missing the other takes it all,
          // which reads honestly as "only one of these is known".
          const total = (h ?? 0) + (a ?? 0);
          const hShare = total > 0 ? ((h ?? 0) / total) * 100 : 50;

          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-2xs">
                <Figure className={cn('text-sm', h === null && 'text-ink-muted')}>
                  {h === null ? '—' : r.format(h)}
                </Figure>
                <span className="eyebrow truncate" title={`Higher ${r.highMeans}`}>
                  {r.label}
                </span>
                <Figure className={cn('text-sm', a === null && 'text-ink-muted')}>
                  {a === null ? '—' : r.format(a)}
                </Figure>
              </div>
              <div className="mt-1 flex h-[0.375rem] w-full overflow-hidden rounded-pill bg-surface-inset">
                <span
                  className="h-full rounded-pill"
                  style={{ width: `${hShare}%`, background: 'var(--series-1)' }}
                />
                <span aria-hidden="true" className="h-full w-[2px] shrink-0 bg-surface-1" />
                <span
                  className="h-full flex-1 rounded-pill"
                  style={{ background: 'var(--series-2)' }}
                />
              </div>
              {r.lowerIsMore ? (
                <p className="mt-1 text-2xs text-ink-muted">
                  Passes allowed per defensive action — a LOWER number is the
                  more aggressive press, so the longer bar is the side that sits off.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-2xs text-ink-muted">
        Averages over the matches this snapshot has detail for —{' '}
        <span className="figure">{homeStyle.matches}</span> for {home.shortName},{' '}
        <span className="figure">{awayStyle.matches}</span> for {away.shortName}.
        {sample < 4 ? ' Too few to lean on heavily.' : ''}
      </p>
    </div>
  );
}
