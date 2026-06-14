import Link from 'next/link';
import { IconArrow } from '@/components/icons';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={`container ${styles.wrap}`}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.text}>
        The story you’re looking for may have been moved, archived, or never existed. Let’s get you
        back to the headlines.
      </p>
      <div className={styles.actions}>
        <Link href="/" className={styles.primary}>
          Back to the front page
          <IconArrow size={18} />
        </Link>
        <Link href="/archive" className={styles.secondary}>
          Browse the archive
        </Link>
      </div>
    </div>
  );
}
