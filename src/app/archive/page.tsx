import type { Metadata } from 'next';
import Link from 'next/link';
import { getArchiveMonths } from '@/lib/db';
import { monthName, padMonth } from '@/lib/format';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { IconArrow } from '@/components/icons';
import styles from './archive.module.css';

export const metadata: Metadata = {
  title: 'Archive',
  description: 'Browse the full Nerd News Network archive by month and year.',
  alternates: { canonical: '/archive' },
};

export default function ArchivePage() {
  const months = getArchiveMonths();

  // Group months by year, preserving the newest-first ordering.
  const byYear = new Map<number, typeof months>();
  for (const m of months) {
    if (!byYear.has(m.year)) byYear.set(m.year, []);
    byYear.get(m.year)!.push(m);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const totalArticles = months.reduce((sum, m) => sum + m.count, 0);

  return (
    <div className={`container ${styles.page}`}>
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Archive' }]} />

      <header className={styles.head}>
        <p className="kicker">The Full Record</p>
        <h1 className={styles.title}>Archive</h1>
        <p className={styles.desc}>
          Every story we’ve published, organised by month. {totalArticles} articles and counting.
        </p>
      </header>

      {years.length === 0 ? (
        <p className={styles.empty}>The archive is empty for now. Please check back soon.</p>
      ) : (
        <div className={styles.years}>
          {years.map((year) => (
            <section key={year} className={styles.year} aria-labelledby={`year-${year}`}>
              <h2 id={`year-${year}`} className={styles.yearLabel}>
                {year}
              </h2>
              <ul className={styles.months} role="list">
                {byYear.get(year)!.map((m) => (
                  <li key={`${m.year}-${m.month}`}>
                    <Link
                      href={`/archive/${m.year}/${padMonth(m.month)}`}
                      className={styles.monthLink}
                    >
                      <span className={styles.monthName}>{monthName(m.month)}</span>
                      <span className={styles.monthCount}>
                        {m.count} {m.count === 1 ? 'story' : 'stories'}
                      </span>
                      <IconArrow className={styles.monthArrow} size={18} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
