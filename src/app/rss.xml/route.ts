import { getRecentArticles } from '@/lib/db';
import { isoDate } from '@/lib/format';
import { SITE } from '@/lib/site';

export const dynamic = 'force-static';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function GET() {
  const articles = getRecentArticles({ limit: 30 });
  const items = articles
    .map((a) => {
      const url = `${SITE.url}/article/${a.slug}`;
      return `    <item>
      <title>${esc(a.headline)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(isoDate(a.published_at)).toUTCString()}</pubDate>
      ${a.category_name ? `<category>${esc(a.category_name)}</category>` : ''}
      <description>${esc(a.blurb)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE.name)}</title>
    <link>${SITE.url}</link>
    <atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${esc(SITE.description)}</description>
    <language>en-gb</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
