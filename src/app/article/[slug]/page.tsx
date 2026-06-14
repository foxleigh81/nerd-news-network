import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getAllSlugs,
  getArticleBySlug,
  getRelatedArticles,
} from '@/lib/db';
import { renderMarkdown } from '@/lib/markdown';
import { formatDate, isoDate, readingMinutes } from '@/lib/format';
import { SITE } from '@/lib/site';
import { SmartImage } from '@/components/SmartImage';
import { ShareBar } from '@/components/ShareBar';
import { RelatedArticles } from '@/components/RelatedArticles';
import { AdSlot } from '@/components/AdSlot';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { IconArrow } from '@/components/icons';
import styles from './article.module.css';

interface Params {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};
  const image = article.hero_image || '/logo/og-default.png';
  return {
    title: article.headline,
    description: article.blurb,
    alternates: { canonical: `/article/${article.slug}` },
    openGraph: {
      type: 'article',
      title: article.headline,
      description: article.blurb,
      publishedTime: isoDate(article.published_at),
      authors: [article.author],
      section: article.category_name ?? undefined,
      images: [{ url: image, alt: article.hero_image_alt ?? article.headline }],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.headline,
      description: article.blurb,
      images: [image],
    },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const related = getRelatedArticles(article);
  const html = renderMarkdown(article.body);
  const minutes = readingMinutes(article.body, article.reading_minutes);
  const canonical = `${SITE.url}/article/${article.slug}`;

  const hasSource = Boolean(article.source_url && article.source_name);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.headline,
    description: article.blurb,
    image: article.hero_image ? [article.hero_image] : undefined,
    datePublished: isoDate(article.published_at),
    author: [{ '@type': 'Person', name: article.author }],
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: `${SITE.url}/logo/og-default.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    ...(hasSource
      ? { isBasedOn: article.source_url, citation: article.source_name }
      : {}),
  };

  return (
    <article className={`container ${styles.page}`}>
      <script
        type="application/ld+json"
        // JSON.stringify + escaping `<` prevents any `</script>` breakout from
        // string fields. The body HTML below is sanitised in renderMarkdown().
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          ...(article.category_name
            ? [{ label: article.category_name, href: `/category/${article.category_slug}` }]
            : []),
          { label: article.headline },
        ]}
      />

      {/* Headline block (full width, at the top) */}
      <header className={styles.header}>
        {article.category_name ? (
          <Link href={`/category/${article.category_slug}`} className={`kicker ${styles.kicker}`}>
            {article.category_name}
          </Link>
        ) : null}
        <h1 className={styles.headline}>{article.headline}</h1>
        <p className={styles.dek}>{article.blurb}</p>
      </header>

      {/* Hero (full width, at the top) */}
      {article.hero_image ? (
        <figure className={styles.hero}>
          <SmartImage
            src={article.hero_image}
            alt={article.hero_image_alt ?? article.headline}
            width={1280}
            height={720}
            priority
            sizes="(max-width: 1240px) 100vw, 1240px"
            className={styles.heroImg}
          />
          {article.hero_credit ? (
            <figcaption className={styles.heroCredit}>{article.hero_credit}</figcaption>
          ) : null}
        </figure>
      ) : null}

      {/* 60 / 40 two-column layout */}
      <div className={styles.grid}>
        <div className={styles.main}>
          {/* Byline */}
          <div className={styles.byline}>
            <p className={styles.bylineMeta}>
              <span className={styles.author}>By {article.author}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={isoDate(article.published_at)}>{formatDate(article.published_at)}</time>
              <span aria-hidden="true">·</span>
              <span>{minutes} min read</span>
            </p>
            {hasSource ? (
              <p className={styles.sourceLine}>
                Originally reported by{' '}
                <a href={article.source_url!} target="_blank" rel="noopener noreferrer nofollow">
                  {article.source_name}
                </a>
              </p>
            ) : null}
          </div>

          <div className={styles.shareTop}>
            <ShareBar url={canonical} title={article.headline} />
          </div>

          {/* Article contents */}
          <div
            className={`prose ${styles.body}`}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* Bottom source credit */}
          {hasSource ? (
            <aside className={styles.sourceCta}>
              <p className={styles.sourceCtaLabel}>Read the full story</p>
              <p className={styles.sourceCtaText}>
                This article summarises original reporting. Continue to the source for the complete
                piece.
              </p>
              <a
                className={styles.sourceCtaLink}
                href={article.source_url!}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Read at {article.source_name}
                <IconArrow size={18} />
              </a>
            </aside>
          ) : null}

          <div className={styles.shareBottom}>
            <ShareBar url={canonical} title={article.headline} />
          </div>
        </div>

        {/* Right column — related + ad */}
        <aside className={styles.side} aria-label="Related content">
          <AdSlot
            format="rectangle"
            slot={process.env.NEXT_PUBLIC_AD_SLOT_SIDEBAR}
            className={styles.sideAd}
          />
          <RelatedArticles articles={related} />
        </aside>
      </div>
    </article>
  );
}
