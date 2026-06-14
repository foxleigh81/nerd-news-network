/** Shared data types, mirroring the SQLite schema (see scripts/seed.mjs). */

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
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
  reading_minutes: number | null;
  featured: number;
  published_at: string; // ISO 8601 UTC
  // Joined fields:
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
