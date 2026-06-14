import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { getYoutubeChannels } from '@/lib/db';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import styles from './about.module.css';

export const metadata: Metadata = {
  title: 'About',
  description: `About ${SITE.name} — what we do, how we source stories, and how to reach us.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  const channels = getYoutubeChannels();
  // Group by category, preserving query order (category id, then name).
  const byCategory = new Map<string, typeof channels>();
  for (const ch of channels) {
    const key = ch.category_name ?? 'Other';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(ch);
  }

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

        <h2 id="channels">Channels we follow</h2>
        <p>
          For our video coverage we track a hand-picked set of YouTube channels across our sections.
          When one publishes something noteworthy, we write up the key points and embed the video so
          you can watch it in full.
        </p>
      </div>

      <div className={styles.channels}>
        {[...byCategory.entries()].map(([category, list]) => (
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
