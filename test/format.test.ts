import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateShort,
  isoDate,
  formatMonth,
  monthName,
  padMonth,
  readingMinutes,
} from '../src/lib/format';

describe('date formatting (UTC-stable)', () => {
  it('formats a long date without zero-padding the day', () => {
    expect(formatDate('2026-06-14T09:30:00Z')).toBe('14 June 2026');
    expect(formatDate('2026-01-05T00:00:00Z')).toBe('5 January 2026');
  });

  it('formats a compact date for cards', () => {
    expect(formatDateShort('2026-06-14T09:30:00Z')).toBe('14 Jun 2026');
  });

  it('uses UTC, not the local timezone, at day boundaries', () => {
    // Late-UTC time must still report the UTC calendar day.
    expect(formatDate('2026-06-14T23:30:00Z')).toBe('14 June 2026');
  });

  it('produces a machine-readable ISO date for <time>', () => {
    expect(isoDate('2026-06-14T09:30:00Z')).toBe('2026-06-14T09:30:00.000Z');
  });

  it('formats month + year and month names', () => {
    expect(formatMonth(2026, 6)).toBe('June 2026');
    expect(monthName(1)).toBe('January');
    expect(monthName(12)).toBe('December');
  });

  it('zero-pads months for URLs', () => {
    expect(padMonth(6)).toBe('06');
    expect(padMonth(12)).toBe('12');
  });
});

describe('readingMinutes', () => {
  it('prefers a positive precomputed value', () => {
    expect(readingMinutes('anything at all here', 7)).toBe(7);
  });

  it('falls back to a ~200wpm estimate when not precomputed', () => {
    const words = Array(400).fill('word').join(' '); // 400 words → ~2 min
    expect(readingMinutes(words)).toBe(2);
  });

  it('ignores non-positive precomputed values and never returns less than 1', () => {
    expect(readingMinutes('short body', 0)).toBe(1);
    expect(readingMinutes('one two three', null)).toBe(1);
  });
});
