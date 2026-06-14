import type { MetadataRoute } from 'next';
import {
  getAllSlugs,
  getArchiveMonths,
  getArticleBySlug,
  getArticlesForMonth,
  getCategories,
} from '@/lib/db';
import { padMonth } from '@/lib/format';
import { SITE } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/archive`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/about`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Articles
  for (const slug of getAllSlugs()) {
    const a = getArticleBySlug(slug);
    if (!a) continue;
    entries.push({
      url: `${base}/article/${slug}`,
      lastModified: new Date(a.published_at),
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  // Categories (single page each)
  for (const c of getCategories()) {
    entries.push({ url: `${base}/category/${c.slug}`, changeFrequency: 'daily', priority: 0.6 });
  }

  // Archive months (+ their pagination)
  for (const m of getArchiveMonths()) {
    const mm = padMonth(m.month);
    const { totalPages } = getArticlesForMonth(m.year, m.month, 1);
    entries.push({ url: `${base}/archive/${m.year}/${mm}`, changeFrequency: 'monthly', priority: 0.5 });
    for (let p = 2; p <= totalPages; p++) {
      entries.push({ url: `${base}/archive/${m.year}/${mm}/page/${p}`, changeFrequency: 'monthly', priority: 0.3 });
    }
  }

  return entries;
}
