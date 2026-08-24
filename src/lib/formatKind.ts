/**
 * Serialisable number formats.
 *
 * A metric definition crosses the server/client boundary — the scatter and the
 * sortable headers are client components fed by server pages — and React cannot
 * serialise a function. Carrying a format as a KIND rather than a closure keeps
 * the whole metric registry serialisable, which is what lets a server component
 * hand a metric straight to a chart.
 *
 * Discovered the hard way: passing `format: (v) => v.toFixed(2)` through a
 * server component threw "Functions cannot be passed directly to Client
 * Components" at request time, not at build time.
 */
export type FormatKind =
  | 'int'
  | 'one'
  | 'two'
  | 'signed'
  | 'signedOne'
  | 'pct1'
  | 'pct0';

export function formatValue(kind: FormatKind, v: number): string {
  switch (kind) {
    case 'int': return String(Math.round(v));
    case 'one': return v.toFixed(1);
    case 'two': return v.toFixed(2);
    case 'signed': return `${v > 0 ? '+' : ''}${Math.round(v)}`;
    case 'signedOne': return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
    case 'pct1': return `${(v * 100).toFixed(1)}%`;
    case 'pct0': return `${Math.round(v * 100)}%`;
  }
}
