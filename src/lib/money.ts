/**
 * Money formatting.
 *
 * `null` is never rendered as €0. A loan, a free and an undisclosed deal all
 * lack a fee for different reasons, and a zero would put money in a spending
 * total that never moved.
 */
export function eur(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}m`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}k`;
  return `€${Math.round(v)}`;
}
