import { currentMonth, getArticlesForMonth } from '@/lib/db';
import { formatMonth } from '@/lib/format';
import { FeedView } from '@/components/FeedView';

export default function HomePage() {
  const { year, month } = currentMonth();
  // Static export currently chokes on the top-level /page/[page] route, so keep
  // the current edition fully reachable from the homepage and leave historical
  // pagination to the archive routes.
  const { items, total, page } = getArticlesForMonth(year, month, 1, 60, true);

  return (
    <FeedView
      kicker={`${formatMonth(year, month)} Edition`}
      title="Today’s Top Stories"
      description="The day’s most important stories in technology, gaming, science, space, AI and culture — summarised and sourced."
      articles={items}
      page={page}
      total={total}
      totalPages={1}
      showLead
      hrefFor={() => '/'}
      paginationLabel="Front page pagination"
    />
  );
}
