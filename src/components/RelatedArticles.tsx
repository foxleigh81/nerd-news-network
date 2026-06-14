import type { Article } from '@/lib/types';
import { ArticleCard } from './ArticleCard';
import styles from './RelatedArticles.module.css';

interface Props {
  articles: Article[];
  title?: string;
}

export function RelatedArticles({ articles, title = 'Related Reading' }: Props) {
  if (!articles.length) return null;
  return (
    <section className={styles.related} aria-labelledby="related-heading">
      <h2 id="related-heading" className="rubric">
        {title}
      </h2>
      <ul className={styles.list} role="list">
        {articles.map((a) => (
          <li key={a.id}>
            <ArticleCard article={a} variant="compact" headingLevel={3} />
          </li>
        ))}
      </ul>
    </section>
  );
}
