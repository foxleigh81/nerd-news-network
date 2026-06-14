import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getArchiveMonths, getArticlesForMonth } from '@/lib/db';
import { formatMonth, padMonth } from '@/lib/format';
import { FeedView } from '@/components/FeedView';
import { PER_PAGE } from '@/lib/site';

interface Params {
  params: Promise<{ year: string; month: string; page: string }>;
}

export function generateStaticParams() {
  const out: { year: string; month: string; page: string }[] = [];
  for (const m of getArchiveMonths()) {
    const { totalPages } = getArticlesForMonth(m.year, m.month, 1);
    for (let p = 2; p <= totalPages; p++) {
      out.push({ year: String(m.year), month: padMonth(m.month), page: String(p) });
    }
  }
  return out;
}

function parse(year: string, month: string, page: string) {
  const y = Number(year);
  const m = Number(month);
  const p = Number(page);
  if (![y, m, p].every(Number.isInteger) || m < 1 || m > 12 || p < 2) return null;
  return { y, m, p };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { year, month, page } = await params;
  const parsed = parse(year, month, page);
  if (!parsed) return {};
  const label = formatMonth(parsed.y, parsed.m);
  return {
    title: `${label} — Archive (Page ${page})`,
    alternates: { canonical: `/archive/${year}/${month}/page/${page}` },
  };
}

export default async function ArchiveMonthPaginated({ params }: Params) {
  const { year, month, page } = await params;
  const parsed = parse(year, month, page);
  if (!parsed) notFound();

  const { items, total, totalPages } = getArticlesForMonth(parsed.y, parsed.m, parsed.p, PER_PAGE);
  if (parsed.p > totalPages || total === 0) notFound();

  const mm = padMonth(parsed.m);
  const label = formatMonth(parsed.y, parsed.m);

  return (
    <FeedView
      kicker="Archive"
      title={label}
      articles={items}
      page={parsed.p}
      total={total}
      totalPages={totalPages}
      hrefFor={(pg) => (pg === 1 ? `/archive/${year}/${mm}` : `/archive/${year}/${mm}/page/${pg}`)}
      crumbs={[
        { label: 'Home', href: '/' },
        { label: 'Archive', href: '/archive' },
        { label: label, href: `/archive/${year}/${mm}` },
        { label: `Page ${parsed.p}` },
      ]}
      paginationLabel={`${label} pagination`}
    />
  );
}
