import Link from 'next/link';
import Image from 'next/image';
import { getCategories } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { buildNow } from '@/lib/db';
import { SITE } from '@/lib/site';
import { PrimaryNav, type NavItem } from './PrimaryNav';
import logo from '../../public/logo/logo.png';
import styles from './Header.module.css';

export function Header() {
  const categories = getCategories();
  // The primary nav is the section list only — Archive lives in the utility bar
  // and footer, not among the categories.
  const navItems: NavItem[] = categories.map((c) => ({ href: `/category/${c.slug}`, label: c.name }));
  const today = formatDate(buildNow().toISOString());

  return (
    <header className={styles.header}>
      {/* Utility strip */}
      <div className={styles.topbar}>
        <div className={styles.topbarInner}>
          <time className={styles.date} dateTime={buildNow().toISOString().slice(0, 10)}>
            {today}
          </time>
          <p className={styles.edition}>{SITE.tagline}</p>
          <ul className={styles.utility}>
            <li>
              <Link href="/archive">Archive</Link>
            </li>
            <li>
              <Link href="/about">About</Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Masthead */}
      <div className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <Link href="/" className={styles.logo} aria-label={`${SITE.name} — home`}>
            <Image
              src={logo}
              alt={SITE.name}
              priority
              sizes="(max-width: 600px) 200px, 260px"
              className={styles.logoImg}
            />
          </Link>
        </div>
        <div className={styles.mastheadRule} aria-hidden="true" />
      </div>

      <PrimaryNav items={navItems} />
    </header>
  );
}
