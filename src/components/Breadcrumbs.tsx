import Link from 'next/link';
import styles from './Breadcrumbs.module.css';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.wrap}>
      <ol className={styles.list}>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className={styles.item}>
              {c.href && !last ? (
                <Link href={c.href} className={styles.link}>
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={styles.current}>
                  {c.label}
                </span>
              )}
              {!last ? (
                <span className={styles.sep} aria-hidden="true">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
