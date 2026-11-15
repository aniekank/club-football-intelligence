import type { MetadataRoute } from 'next';
import { COMPETITIONS } from '@/domain/competitions';
import { siteOrigin } from '@/server/site';

export const dynamic = 'force-dynamic';

/**
 * The sitemap, generated from the registry.
 *
 * Only stable, meaningful URLs: the sections, and one table per competition.
 * Deliberately NOT every club and match — those run to tens of thousands, they
 * change every week, and a sitemap that large is mostly a way of telling a
 * crawler to spend its budget on pages that will be stale before it arrives.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteOrigin();
  const now = new Date();

  const sections = ['', '/table', '/fixtures', '/players', '/explore', '/transfers', '/rankings', '/edge'];

  return [
    ...sections.map((path) => ({
      url: `${site}${path}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: path === '' ? 1 : 0.8,
    })),
    ...COMPETITIONS.map((c) => ({
      url: `${site}/table?competition=${c.id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
  ];
}
