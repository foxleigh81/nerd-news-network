import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getArchiveMonths, getArticlesForMonth } from '@/lib/db';
import { formatMonth, padMonth } from '@/lib/format';
import { FeedView } from '@/components/FeedView';

interface Params {
  params: Promise<{ year: string; month: string }>;
}

export function generateStaticParams() {
  return getArchiveMonths().map((m) => ({
    year: String(m.year),
    month: padMonth(m.month),
  }));
}

function parse(year: string, month: string): { y: number; m: number } | null {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return { y, m };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { year, month } = await params;
  const p = parse(year, month);
  if (!p) return {};
  const label = formatMonth(p.y, p.m);
  return {
    title: `${label} — Archive`,
    description: `All Nerd News Network articles published in ${label}.`,
    alternates: { canonical: `/archive/${year}/${month}` },
  };
}

export default async function ArchiveMonthPage({ params }: Params) {
  const { year, month } = await params;
  const p = parse(year, month);
  if (!p) notFound();

  const { items, total, page, totalPages } = getArticlesForMonth(p.y, p.m, 1);
  if (total === 0) notFound();

  const mm = padMonth(p.m);
  const label = formatMonth(p.y, p.m);

  return (
    <FeedView
      kicker="Archive"
      title={label}
      description={`Everything we published in ${label}.`}
      articles={items}
      page={page}
      total={total}
      totalPages={totalPages}
      hrefFor={(pg) => (pg === 1 ? `/archive/${year}/${mm}` : `/archive/${year}/${mm}/page/${pg}`)}
      crumbs={[
        { label: 'Home', href: '/' },
        { label: 'Archive', href: '/archive' },
        { label: label },
      ]}
      paginationLabel={`${label} pagination`}
    />
  );
}
