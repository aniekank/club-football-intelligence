import type { MetadataRoute } from 'next';

/**
 * Crawling rules.
 *
 * `/api/` is disallowed because the health endpoint is an operational surface,
 * not content — indexing it puts a JSON blob describing internal load state
 * into search results.
 */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3010';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
