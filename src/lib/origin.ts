/**
 * Public origin for a Host header. Pure, so the middleware (no headers()) and
 * the server pages share one rule: the onrender.com address maps to the custom
 * domain, local hosts stay http, everything else is https on its own name
 * (club. and afcon. are both real front doors).
 */
export function originForHost(raw: string): string {
  const host = (raw.split(',')[0] ?? '').trim().toLowerCase();
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://club.taskintel.app';
  if (host.endsWith('.onrender.com')) return 'https://club.taskintel.app';
  if (/^(localhost|127\.|\[::1\])|\.localhost(:|$)/.test(host)) return `http://${host}`;
  return `https://${host}`;
}

/**
 * The canonical URL for a request: same origin rules, the path, and only the
 * parameters that pick genuinely different content. Everything else (RSC
 * payload keys, filters, sorts, theme/intro toggles) is the same page.
 */
export function canonicalUrl(host: string, pathname: string, params: URLSearchParams, keep: readonly string[]): string {
  const kept = new URLSearchParams();
  for (const k of keep) {
    const v = params.get(k);
    if (v) kept.set(k, v);
  }
  const qs = kept.toString();
  return `${originForHost(host)}${pathname}${qs ? `?${qs}` : ''}`;
}
