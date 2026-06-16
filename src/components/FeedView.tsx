import type { Article } from '@/lib/types';
import { ArticleCard } from './ArticleCard';
import { ArticleGrid } from './ArticleGrid';
import { Pagination } from './Pagination';
import { AdSlot } from './AdSlot';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { ADS_ENABLED, AD_SLOTS, FEED_AD_POSITION } from '@/lib/site';
import styles from './FeedView.module.css';

interface Props {
  kicker: string;
  title: string;
  description?: string;
  articles: Article[];
  page: number;
  totalPages: number;
  total: number;
  hrefFor: (page: number) => string;
  /** Render the first article as a large lead (typically only on page 1). */
  showLead?: boolean;
  crumbs?: Crumb[];
  paginationLabel?: string;
}

export function FeedView({
  kicker,
  title,
  description,
  articles,
  page,
  totalPages,
  total,
  hrefFor,
  showLead = false,
  crumbs,
  paginationLabel,
}: Props) {
  const useLead = showLead && articles.length > 0;
  const lead = useLead ? articles[0] : null;
  const rest = useLead ? articles.slice(1) : articles;

  // When ads are on, one grid card is replaced by an in-feed ad. Only do so when
  // the grid is long enough that the ad doesn't crowd out the content.
  const feedAdIndex =
    ADS_ENABLED && rest.length > FEED_AD_POSITION ? FEED_AD_POSITION : undefined;

  return (
    <div className={`container ${styles.page}`}>
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}

      <header className={styles.head}>
        <p className="kicker">{kicker}</p>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.desc}>{description}</p> : null}
      </header>

      <AdSlot format="leaderboard" slot={AD_SLOTS.leader} className={styles.adTop} />

      {articles.length === 0 ? (
        <p className={styles.empty}>No articles to show here yet. Please check back soon.</p>
      ) : (
        <>
          {lead ? (
            <section className={styles.leadWrap} aria-label="Lead story">
              <ArticleCard article={lead} variant="lead" headingLevel={2} index={0} />
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section aria-label="Articles">
              {useLead ? <h2 className="rubric">More Stories</h2> : null}
              <ArticleGrid
                articles={rest}
                startIndex={useLead ? 1 : 0}
                headingLevel={2}
                adIndex={feedAdIndex}
                adSlot={AD_SLOTS.infeed}
              />
            </section>
          ) : null}

          <Pagination
            page={page}
            totalPages={totalPages}
            hrefFor={hrefFor}
            label={paginationLabel}
          />
        </>
      )}

      <p className={styles.count}>
        {total} {total === 1 ? 'article' : 'articles'} · page {page} of {totalPages}
      </p>
    </div>
  );
}
