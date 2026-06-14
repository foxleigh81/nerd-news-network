'use client';

import { useEffect, useRef } from 'react';
import styles from './AdSlot.module.css';

type Format = 'leaderboard' | 'rectangle' | 'inline';

interface Props {
  format?: Format;
  /** AdSense ad-unit slot id. */
  slot?: string;
  className?: string;
}

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

/**
 * Advertising placement. Reserves fixed space (no layout shift) and is labelled
 * for transparency. When NEXT_PUBLIC_ADSENSE_CLIENT (and a slot id) are present
 * it renders a real AdSense unit; otherwise it shows a clearly marked
 * placeholder so the layout is visible during development.
 */
export function AdSlot({ format = 'leaderboard', slot, className }: Props) {
  const pushed = useRef(false);
  const live = Boolean(ADSENSE_CLIENT && slot);

  useEffect(() => {
    if (!live || pushed.current) return;
    try {
      // @ts-expect-error injected by the AdSense script
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      /* AdSense not ready / blocked — leave the reserved space empty. */
    }
  }, [live]);

  return (
    <aside
      className={`${styles.wrap} ${className ?? ''}`}
      data-format={format}
      aria-label="Advertisement"
    >
      <span className={styles.label} aria-hidden="true">
        Advertisement
      </span>
      {live ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format={format === 'inline' ? 'fluid' : 'auto'}
          data-full-width-responsive="true"
        />
      ) : (
        <div className={styles.placeholder} aria-hidden="true">
          <span>Ad space</span>
        </div>
      )}
    </aside>
  );
}
