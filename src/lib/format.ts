/** Deterministic, timezone-stable formatting helpers (UTC) for static builds. */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "14 June 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "14 Jun 2026" — compact form for cards. */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Machine-readable date for <time dateTime>. */
export function isoDate(iso: string): string {
  return new Date(iso).toISOString();
}

/** "June 2026" */
export function formatMonth(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function monthName(month: number): string {
  return MONTHS[month - 1];
}

/** Zero-padded month for URLs: 6 -> "06". */
export function padMonth(month: number): string {
  return month.toString().padStart(2, '0');
}

/** Rough reading time fallback when not precomputed (~200 wpm). */
export function readingMinutes(markdown: string, precomputed?: number | null): number {
  if (precomputed && precomputed > 0) return precomputed;
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
