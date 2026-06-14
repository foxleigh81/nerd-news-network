import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { currentMonth, getArticlesForMonth } from '@/lib/db';
import { formatMonth } from '@/lib/format';
import { FeedView } from '@/components/FeedView';
import { PER_PAGE } from '@/lib/site';

interface Params {
  params: Promise<{ page: string }>;
}

export function generateStaticParams() {
  const { year, month } = currentMonth();
  const { totalPages } = getArticlesForMonth(year, month, 1);
  // Page 1 is served at "/", so generate 2..N here.
  const pages: { page: string }[] = [];
  for (let p = 2; p <= totalPages; p++) pages.push({ page: String(p) });
  return pages;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { page } = await params;
  return {
    title: `Latest Stories — Page ${page}`,
    alternates: { canonical: `/page/${page}` },
  };
}

export default async function FrontPagePaginated({ params }: Params) {
  const { page: pageParam } = await params;
  const page = Number(pageParam);
  if (!Number.isInteger(page) || page < 2) notFound();

  const { year, month } = currentMonth();
  const { items, total, totalPages } = getArticlesForMonth(year, month, page, PER_PAGE);
  if (page > totalPages) notFound();

  return (
    <FeedView
      kicker={`${formatMonth(year, month)} Edition`}
      title="Latest Stories"
      articles={items}
      page={page}
      total={total}
      totalPages={totalPages}
      hrefFor={(p) => (p === 1 ? '/' : `/page/${p}`)}
      crumbs={[{ label: 'Home', href: '/' }, { label: `Page ${page}` }]}
      paginationLabel="Front page pagination"
    />
  );
}
