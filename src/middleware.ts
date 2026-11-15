import { NextResponse, type NextRequest } from 'next/server';
import { canonicalUrl } from '@/lib/origin';

/**
 * Canonical URL on every page, as an HTTP Link header (Google and Bing honour
 * it). Crawlers that land on `/?_rsc=…&competition=…&filter=live` are told the
 * real page is `/?competition=…`, so the permutations fold into one entry
 * instead of each being re-fetched as new. See robots.ts for the crawl rules.
 */
const KEEP = ['competition', 'season'] as const;

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  const url = canonicalUrl(host, req.nextUrl.pathname, req.nextUrl.searchParams, KEEP);
  res.headers.set('Link', `<${url}>; rel="canonical"`);
  return res;
}

export const config = {
  // Pages only: not the API, Next's assets, or files with an extension.
  matcher: ['/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
