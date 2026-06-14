import type { Article } from '@/lib/types';
import { ArticleCard } from './ArticleCard';
import styles from './ArticleGrid.module.css';

interface Props {
  articles: Article[];
  /** Offset added to each card's animation index (for staggering after a lead). */
  startIndex?: number;
  headingLevel?: 2 | 3 | 4;
}

export function ArticleGrid({ articles, startIndex = 0, headingLevel = 2 }: Props) {
  return (
    <ul className={styles.grid} role="list">
      {articles.map((article, i) => (
        <li key={article.id} className={styles.cell}>
          <ArticleCard
            article={article}
            variant="standard"
            headingLevel={headingLevel}
            index={startIndex + i}
          />
        </li>
      ))}
    </ul>
  );
}
