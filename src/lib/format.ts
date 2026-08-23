/**
 * Formatting helpers.
 *
 * The rule running through all of these: `null` means "we do not have this" and
 * must render as an em dash, never as 0. A fabricated zero is indistinguishable
 * from a real one and is how a page quietly lies about its data.
 */

export const EM_DASH = '—';

/** A probability as a percentage. Sub-1% collapses to "<1%" rather than "0%",
 *  because "0%" asserts impossibility and 0.4% is not impossible. */
export function pct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  const p = value * 100;
  if (p > 0 && p < 1) return '<1%';
  if (p < 100 && p > 99 && digits === 0) return '>99%';
  return `${p.toFixed(digits)}%`;
}

/** A raw number to fixed decimals, or an em dash. */
export function num(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  return value.toFixed(digits);
}

/** An integer, or an em dash. */
export function int(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  return String(Math.round(value));
}

/** A signed value, for goal difference and deltas. Zero shows unsigned. */
export function signed(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  if (value === 0) return '0';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

/** A scoreline, or a dash pair for an unplayed fixture. */
export function score(home: number | null, away: number | null): string {
  if (home === null || away === null) return `${EM_DASH} ${EM_DASH}`;
  return `${home} ${away}`;
}

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short',
});
const FULL_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export const formatTime = (iso: string) => TIME_FMT.format(new Date(iso));
export const formatDate = (iso: string) => DATE_FMT.format(new Date(iso));
export const formatFullDate = (iso: string) => FULL_FMT.format(new Date(iso));

/** Day key for grouping fixtures, in UTC so server and client agree. */
export const dayKey = (iso: string) => iso.slice(0, 10);

/** "3 days ago" / "in 2 hours", for freshness stamps. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return diff < 0 ? `${mins}m ago` : `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return diff < 0 ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return diff < 0 ? `${days}d ago` : `in ${days}d`;
}

/** Ordinal rank: 1st, 2nd, 3rd. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th');
}
