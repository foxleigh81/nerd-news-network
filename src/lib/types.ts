/** Shared data types, mirroring the SQLite schema (see scripts/seed.mjs). */

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  keywords: string | null; // comma-separated topic terms (drives the daily task's topic match)
}

export interface Article {
  id: number;
  slug: string;
  headline: string;
  blurb: string;
  body: string; // Markdown
  hero_image: string | null;
  hero_image_alt: string | null;
  hero_credit: string | null;
  thumbnail_image: string | null;
  thumbnail_alt: string | null;
  category_id: number | null;
  author: string;
  source_name: string | null;
  source_url: string | null;
  video_youtube_id: string | null;
  reading_minutes: number | null;
  featured: number;
  category_featured: number;
  published_at: string; // ISO 8601 UTC
  // Joined fields:
  category_slug: string | null;
  category_name: string | null;
}

export interface YoutubeChannel {
  id: number;
  name: string;
  handle: string | null;
  channel_id: string | null;
  url: string;
  category_id: number | null;
  weight: number;
  active: number;
  // Joined:
  category_slug: string | null;
  category_name: string | null;
}

export interface Source {
  id: number;
  name: string;
  feed_url: string;
  site_url: string | null;
  category_id: number | null;
  weight: number;
  active: number;
  // Joined:
  category_slug: string | null;
  category_name: string | null;
}

export interface ArchiveMonth {
  year: number;
  month: number; // 1-12
  count: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
