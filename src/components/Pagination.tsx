import Link from 'next/link';
import { IconArrow } from './icons';
import styles from './Pagination.module.css';

interface Props {
  page: number;
  totalPages: number;
  /** Builds the href for a given page number. */
  hrefFor: (page: number) => string;
  label?: string;
}

/** Compact, accessible page list with first/last and an ellipsis window. */
function pageWindow(page: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, page, page - 1, page + 1]);
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push('gap');
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pagination({ page, totalPages, hrefFor, label = 'Pagination' }: Props) {
  if (totalPages <= 1) return null;
  const items = pageWindow(page, totalPages);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className={styles.nav} aria-label={label}>
      {hasPrev ? (
        <Link href={hrefFor(page - 1)} className={styles.edge} rel="prev">
          <IconArrow className={styles.arrowPrev} size={18} />
          <span>Newer</span>
        </Link>
      ) : (
        <span className={`${styles.edge} ${styles.disabled}`} aria-disabled="true">
          <IconArrow className={styles.arrowPrev} size={18} />
          <span>Newer</span>
        </span>
      )}

      <ol className={styles.pages}>
        {items.map((it, idx) =>
          it === 'gap' ? (
            <li key={`gap-${idx}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={it}>
              {it === page ? (
                <span className={`${styles.page} ${styles.current}`} aria-current="page">
                  {it}
                </span>
              ) : (
                <Link href={hrefFor(it)} className={styles.page} aria-label={`Page ${it}`}>
                  {it}
                </Link>
              )}
            </li>
          )
        )}
      </ol>

      {hasNext ? (
        <Link href={hrefFor(page + 1)} className={styles.edge} rel="next">
          <span>Older</span>
          <IconArrow size={18} />
        </Link>
      ) : (
        <span className={`${styles.edge} ${styles.disabled}`} aria-disabled="true">
          <span>Older</span>
          <IconArrow size={18} />
        </span>
      )}
    </nav>
  );
}
