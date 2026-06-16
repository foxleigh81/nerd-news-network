import type { Article } from '@/lib/types';
import { ArticleCard } from './ArticleCard';
import { AdSlot } from './AdSlot';
import styles from './ArticleGrid.module.css';

interface Props {
  articles: Article[];
  /** Offset added to each card's animation index (for staggering after a lead). */
  startIndex?: number;
  headingLevel?: 2 | 3 | 4;
  /** If set (and valid), the card at this index is replaced by an ad cell. */
  adIndex?: number;
  /** AdSense slot id for the in-grid ad. */
  adSlot?: string;
}

export function ArticleGrid({ articles, startIndex = 0, headingLevel = 2, adIndex, adSlot }: Props) {
  const showAd = adIndex != null && adIndex >= 0 && adIndex < articles.length;

  return (
    <ul className={styles.grid} role="list">
      {articles.map((article, i) =>
        showAd && i === adIndex ? (
          <li key="in-grid-ad" className={`${styles.cell} ${styles.adCell}`}>
            <AdSlot format="inline" slot={adSlot} labelBelow />
          </li>
        ) : (
          <li key={article.id} className={styles.cell}>
            <ArticleCard
              article={article}
              variant="standard"
              headingLevel={headingLevel}
              index={startIndex + i}
            />
          </li>
        )
      )}
    </ul>
  );
}
