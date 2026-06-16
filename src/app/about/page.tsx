import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { getYoutubeChannels, getSources } from '@/lib/db';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import styles from './about.module.css';

/** Group rows that carry a joined `category_name` into per-category buckets,
 *  preserving the query order the DB returned them in. */
function groupByCategory<T extends { category_name: string | null }>(rows: T[]): [string, T[]][] {
  const byCategory = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.category_name ?? 'Other';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(row);
  }
  return [...byCategory.entries()];
}

export const metadata: Metadata = {
  title: 'About',
  description: `About ${SITE.name} — what we do, how we source stories, and how to reach us.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  const sourcesByCategory = groupByCategory(getSources());
  const channelsByCategory = groupByCategory(getYoutubeChannels());

  return (
    <div className={`container ${styles.page}`}>
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />

      <header className={styles.head}>
        <p className="kicker">Who We Are</p>
        <h1 className={styles.title}>About {SITE.name}</h1>
      </header>

      <div className={`prose ${styles.body}`}>
        <p>
          {SITE.name} is a news-aggregation service for curious minds. Each day we gather the most
          important stories across AI, networking, smart homes, gaming, science and technology,
          summarise the essentials, and point you straight to the original.
        </p>

        <h2>How we source stories</h2>
        <p>
          Every article on {SITE.name} is a summary of work published elsewhere — whether a written
          report or a YouTube video. We always credit and link to the original source — in the byline
          and at the foot of each article — so you can read or watch the full thing and support the
          people who do the primary work. Rights to original material remain with their respective
          owners.
        </p>

        <h2 id="sources">Sources we read</h2>
        <p>
          For written coverage we monitor a fixed, hand-picked list of publications across our
          sections rather than trawling the open web. Each day we pull the latest stories from these
          feeds, rank them by recency and relevance, and write up the ones most likely to matter to
          you — always linking back to the original.
        </p>
      </div>

      <div className={styles.channels}>
        {sourcesByCategory.map(([category, list]) => (
          <section key={category} className={styles.channelGroup} aria-label={`${category} sources`}>
            <h3 className={styles.channelHeading}>{category}</h3>
            <ul className={styles.channelList}>
              {list.map((s) => (
                <li key={s.id}>
                  {s.site_url ? (
                    <a href={s.site_url} target="_blank" rel="noopener noreferrer">
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className={`prose ${styles.body}`}>
        <h2 id="channels">Channels we follow</h2>
        <p>
          For our video coverage we track a hand-picked set of YouTube channels across our sections.
          When one publishes something noteworthy, we write up the key points and embed the video so
          you can watch it in full.
        </p>
      </div>

      <div className={styles.channels}>
        {channelsByCategory.map(([category, list]) => (
          <section key={category} className={styles.channelGroup} aria-label={`${category} channels`}>
            <h3 className={styles.channelHeading}>{category}</h3>
            <ul className={styles.channelList}>
              {list.map((ch) => (
                <li key={ch.id}>
                  <a href={ch.url} target="_blank" rel="noopener noreferrer">
                    {ch.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className={`prose ${styles.body}`}>
        <h2 id="privacy">Privacy &amp; advertising</h2>
        <p>
          We keep things lightweight. {SITE.name} is a statically generated site with no user
          accounts and no comment system. We display advertising to support our work; our advertising
          partners (including Google AdSense) may use cookies to serve relevant ads. You can manage ad
          personalisation through your Google account settings and your browser’s cookie controls.
        </p>

        <h2 id="contact">Contact</h2>
        <p>
          Spotted an error, or want to suggest a story or channel? We’d love to hear from you. Reach
          the team at <a href="mailto:hello@nerdnews.network">hello@nerdnews.network</a>.
        </p>
      </div>
    </div>
  );
}
