import Link from 'next/link';
import type { Article } from '@/lib/types';
import { formatDateShort, isoDate, readingMinutes } from '@/lib/format';
import { SmartImage } from './SmartImage';
import styles from './ArticleCard.module.css';

type Variant = 'lead' | 'standard' | 'compact';

interface Props {
  article: Article;
  variant?: Variant;
  /** Heading level for the headline, for correct document outline. */
  headingLevel?: 2 | 3 | 4;
  /** Index used to stagger the entrance animation. */
  index?: number;
}

export function ArticleCard({ article, variant = 'standard', headingLevel = 2, index = 0 }: Props) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const href = `/article/${article.slug}`;
  const thumb = article.thumbnail_image || article.hero_image;
  const alt = article.thumbnail_alt || article.hero_image_alt || article.headline;
  const isLead = variant === 'lead';
  const isCompact = variant === 'compact';

  return (
    <article
      className={styles.card}
      data-variant={variant}
      style={{ '--i': index } as React.CSSProperties}
    >
      <Link href={href} className={styles.media} tabIndex={-1} aria-hidden="true">
        <SmartImage
          src={thumb}
          alt={alt}
          width={isLead ? 1280 : 640}
          height={isLead ? 720 : 360}
          className={styles.img}
          priority={isLead}
          sizes={
            isLead
              ? '(max-width: 820px) 100vw, 760px'
              : isCompact
                ? '120px'
                : '(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 380px'
          }
        />
      </Link>

      <div className={styles.body}>
        {article.category_name && !isCompact ? (
          <Link
            href={`/category/${article.category_slug}`}
            className={`kicker ${styles.kicker}`}
          >
            {article.category_name}
          </Link>
        ) : null}

        <Heading className={styles.headline}>
          <Link href={href} className={styles.titleLink}>
            {article.headline}
          </Link>
        </Heading>

        {!isCompact ? <p className={styles.blurb}>{article.blurb}</p> : null}

        <div className={styles.meta}>
          <time dateTime={isoDate(article.published_at)}>
            {formatDateShort(article.published_at)}
          </time>
          {!isCompact ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{readingMinutes(article.body, article.reading_minutes)} min read</span>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
