import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/server/site';

/**
 * Crawling rules.
 *
 * Nov 2026: crawlers burned ~20 GB of Render bandwidth in two weeks walking
 * every permutation of `?competition=` × `filter=` × Next's `?_rsc=` payloads
 * (45 competitions linked from every page, 20–40 KB a hit). So:
 *
 * - AI-training crawlers are refused outright; they give the site nothing back.
 *   Search crawlers (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot) stay
 *   welcome, so the site can still be found.
 * - Everyone else may crawl the real pages but not the permutations: RSC
 *   payloads, the live filter, sorts, any URL with two or more parameters, the
 *   home page's competition variants, and /ask (an open-ended search box).
 *   Single-parameter pages like /table?competition=epl (the sitemap's URLs)
 *   and /teams/40?competition=epl stay crawlable.
 * - `/api/` is an operational surface, not content.
 */
const TRAINING_BOTS = [
  'GPTBot',
  'ElevenlabsCrawler',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'Bytespider',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'ImagesiftBot',
  'Omgilibot',
  'Timpibot',
];

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: TRAINING_BOTS, disallow: '/' },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/ask', '/*_rsc=', '/*filter=', '/*sort=', '/*&', '/?'],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
