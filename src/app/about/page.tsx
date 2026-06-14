import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import styles from './about.module.css';

export const metadata: Metadata = {
  title: 'About',
  description: `About ${SITE.name} — what we do, how we source stories, and how to reach us.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
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
          important stories across technology, gaming, science, space, AI and culture, summarise the
          essentials, and point you straight to the original reporting.
        </p>

        <h2>How we source stories</h2>
        <p>
          Every article on {SITE.name} is a summary of work published elsewhere. We always credit
          and link to the original source — both in the byline and at the foot of each article — so
          you can read the full piece and support the publishers who do the primary reporting. Rights
          to original material remain with their respective owners.
        </p>

        <h2 id="privacy">Privacy &amp; advertising</h2>
        <p>
          We keep things lightweight. {SITE.name} is a statically generated site with no user
          accounts and no comment system. We display advertising to support our work; our advertising
          partners (including Google AdSense) may use cookies to serve relevant ads. You can manage ad
          personalisation through your Google account settings and your browser’s cookie controls.
        </p>

        <h2 id="contact">Contact</h2>
        <p>
          Spotted an error, or want to suggest a story? We’d love to hear from you. Reach the team at{' '}
          <a href="mailto:hello@nerdnews.network">hello@nerdnews.network</a>.
        </p>
      </div>
    </div>
  );
}
