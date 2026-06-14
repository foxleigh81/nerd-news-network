import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCategories, getCategoryBySlug, getArticlesForCategory } from '@/lib/db';
import { FeedView } from '@/components/FeedView';

interface Params {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return {};
  return {
    title: category.name,
    description: category.description ?? `The latest ${category.name} stories from Nerd News Network.`,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  // Section pages list all of a category's stories on a single page (newest
  // first). Sections are typically small, so this avoids fragile pagination
  // routes while still scaling comfortably.
  const { items, total, page, totalPages } = getArticlesForCategory(category.id, 1, 60);

  return (
    <FeedView
      kicker="Section"
      title={category.name}
      description={category.description ?? undefined}
      articles={items}
      page={page}
      total={total}
      totalPages={totalPages}
      showLead
      hrefFor={(p) => (p === 1 ? `/category/${slug}` : `/category/${slug}`)}
      crumbs={[{ label: 'Home', href: '/' }, { label: category.name }]}
      paginationLabel={`${category.name} pagination`}
    />
  );
}
