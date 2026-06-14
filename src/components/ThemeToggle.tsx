'use client';

import { useEffect, useState } from 'react';
import { IconSun, IconMoon } from './icons';
import styles from './ThemeToggle.module.css';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // The inline boot script (in the layout) sets the real theme before paint;
  // sync to it after mount to avoid a hydration mismatch.
  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem('nnn-theme', next);
    } catch {
      /* storage unavailable */
    }
  }

  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={mounted ? isDark : undefined}
    >
      <span className={styles.icon} suppressHydrationWarning>
        {mounted && isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
      </span>
    </button>
  );
}
