import Link from 'next/link';
import Image from 'next/image';
import { getCategories, buildNow } from '@/lib/db';
import { SITE } from '@/lib/site';
import { IconYouTube, IconRss } from './icons';
import logo from '../../public/logo/logo.png';
import styles from './Footer.module.css';

const FOXYS_LAB_YOUTUBE = 'https://www.youtube.com/channel/UC_blM3yCdvOSzxakaj3178w';
const FOXYS_LAB_SITE = 'https://www.foxyslab.com';

export function Footer() {
  const categories = getCategories();
  const year = buildNow().getUTCFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>
          <Link href="/" aria-label={`${SITE.name} — home`} className={styles.logoPlate}>
            <Image src={logo} alt={SITE.name} className={styles.logo} sizes="240px" />
          </Link>
          <p className={styles.mission}>{SITE.description}</p>
          <p className={styles.owner}>
            Owned &amp; operated by{' '}
            <a href={FOXYS_LAB_SITE} target="_blank" rel="noopener noreferrer">
              Foxy’s Lab
            </a>
            .
          </p>
          <ul className={styles.social} aria-label={`Follow ${SITE.name}`}>
            <li>
              <a
                href={FOXYS_LAB_YOUTUBE}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Foxy’s Lab on YouTube"
                className={styles.socialLink}
              >
                <IconYouTube />
              </a>
            </li>
            <li>
              <a href="/rss.xml" aria-label="RSS feed" className={styles.socialLink}>
                <IconRss />
              </a>
            </li>
          </ul>
        </div>

        <nav className={styles.col} aria-label="Sections">
          <h2 className={styles.colTitle}>Sections</h2>
          <ul>
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/category/${c.slug}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className={styles.col} aria-label="Browse">
          <h2 className={styles.colTitle}>Browse</h2>
          <ul>
            <li>
              <Link href="/">Latest</Link>
            </li>
            <li>
              <Link href="/archive">Archive</Link>
            </li>
            <li>
              <Link href="/about">About</Link>
            </li>
          </ul>
        </nav>

        <nav className={styles.col} aria-label="Legal">
          <h2 className={styles.colTitle}>Company</h2>
          <ul>
            <li>
              <Link href="/about">About us</Link>
            </li>
            <li>
              <Link href="/about#privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/about#contact">Contact</Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className={styles.legal}>
        <div className="container">
          <p>
            © {year} {SITE.name}. Owned and operated by Foxy’s Lab. {SITE.name} is a
            news-aggregation service. All articles summarise and link to original reporting;
            rights remain with the respective publishers.
          </p>
          <p>
            Articles are pulled from a curated list of sources, but the summaries are
            AI-generated and may contain inaccuracies or hallucinations. Always check the
            original source — linked in every article — for the definitive account.
          </p>
        </div>
      </div>
    </footer>
  );
}
