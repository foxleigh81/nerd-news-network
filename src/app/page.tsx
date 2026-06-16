import { currentMonth, getArticlesForMonth } from '@/lib/db';
import { formatMonth } from '@/lib/format';
import { FeedView } from '@/components/FeedView';
import { PER_PAGE } from '@/lib/site';

export default function HomePage() {
  const { year, month } = currentMonth();
  // withLead: page 1 carries a featured lead on top of a full 12-card grid.
  const { items, total, page, totalPages } = getArticlesForMonth(year, month, 1, PER_PAGE, true);

  return (
    <FeedView
      kicker={`${formatMonth(year, month)} Edition`}
      title="Today’s Top Stories"
      description="The day’s most important stories in technology, gaming, science, space, AI and culture — summarised and sourced."
      articles={items}
      page={page}
      total={total}
      totalPages={totalPages}
      showLead
      hrefFor={(p) => (p === 1 ? '/' : `/page/${p}`)}
      paginationLabel="Front page pagination"
    />
  );
}
