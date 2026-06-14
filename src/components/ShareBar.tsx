'use client';

import { useState } from 'react';
import { IconX, IconFacebook, IconLinkedIn, IconReddit, IconEmail, IconLink, IconCheck } from './icons';
import styles from './ShareBar.module.css';

interface Props {
  url: string;
  title: string;
}

export function ShareBar({ url, title }: Props) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  const links = [
    { label: 'Share on X', href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`, Icon: IconX },
    { label: 'Share on Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, Icon: IconFacebook },
    { label: 'Share on LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, Icon: IconLinkedIn },
    { label: 'Share on Reddit', href: `https://www.reddit.com/submit?url=${u}&title=${t}`, Icon: IconReddit },
    { label: 'Share by email', href: `mailto:?subject=${t}&body=${u}`, Icon: IconEmail },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Share</span>
      <ul className={styles.list}>
        {links.map(({ label, href, Icon }) => (
          <li key={label}>
            <a
              className={styles.btn}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
            >
              <Icon size={18} />
            </a>
          </li>
        ))}
        <li>
          <button type="button" className={styles.btn} onClick={copy} aria-label={copied ? 'Link copied' : 'Copy link'}>
            {copied ? <IconCheck size={18} /> : <IconLink size={18} />}
          </button>
          <span aria-live="polite" className="visually-hidden">
            {copied ? 'Link copied to clipboard' : ''}
          </span>
        </li>
      </ul>
    </div>
  );
}
