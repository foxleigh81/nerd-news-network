import 'server-only';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { PER_PAGE, RELATED_LIMIT, RELATED_WINDOW_MONTHS } from './site';
import type { Article, ArchiveMonth, Category, Paged } from './types';

// ---------------------------------------------------------------------------
// Connection (read-only, opened once and reused across the build).
// ---------------------------------------------------------------------------
const DB_PATH = join(process.cwd(), 'data', 'nnn.db');

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

// Common SELECT with the category joined in.
const ARTICLE_COLUMNS = `
  a.id, a.slug, a.headline, a.blurb, a.body, a.hero_image, a.hero_image_alt,
  a.hero_credit, a.thumbnail_image, a.thumbnail_alt, a.category_id, a.author,
  a.source_name, a.source_url, a.video_youtube_id, a.reading_minutes, a.featured,
  a.published_at, c.slug AS category_slug, c.name AS category_name
`;
const FROM_ARTICLES = `FROM articles a LEFT JOIN categories c ON c.id = a.category_id`;

// ---------------------------------------------------------------------------
// Build-time "now". A static build represents a single calendar moment; allow
// an override so the daily task (or tests) can pin the reference date.
// ---------------------------------------------------------------------------
export function buildNow(): Date {
  const override = process.env.NNN_BUILD_DATE;
  return override ? new Date(override) : new Date();
}

export function currentMonth(): { year: number; month: number } {
  const d = buildNow();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function paginate<T>(items: T[], total: number, page: number, perPage: number): Paged<T> {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return { items, total, page, perPage, totalPages };
}

// `month` is 1-12. Bounds expressed as ISO strings for index-friendly range scans.
function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01T00:00:00Z`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextYear.toString().padStart(4, '0')}-${nextMonth.toString().padStart(2, '0')}-01T00:00:00Z`;
  return { start, end };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** All article slugs (for generateStaticParams). */
export function getAllSlugs(): string[] {
  return db().prepare('SELECT slug FROM articles ORDER BY published_at DESC').all().map((r: any) => r.slug);
}

export function getArticleBySlug(slug: string): Article | null {
  const row = db()
    .prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM_ARTICLES} WHERE a.slug = ?`)
    .get(slug) as Article | undefined;
  return row ?? null;
}

/**
 * Articles published within a given calendar month, newest first, paginated.
 *
 * `perPage` is the size of the article *grid*. When `withLead` is set, page 1
 * additionally carries one featured lead on top of a full grid (so it holds
 * `perPage + 1` articles and the grid still shows `perPage` cells); later pages
 * are offset by that extra item. With `withLead` off the maths are unchanged.
 */
export function getArticlesForMonth(
  year: number,
  month: number,
  page = 1,
  perPage = PER_PAGE,
  withLead = false
): Paged<Article> {
  const { start, end } = monthBounds(year, month);
  const total = (
    db()
      .prepare('SELECT COUNT(*) AS n FROM articles WHERE published_at >= ? AND published_at < ?')
      .get(start, end) as { n: number }
  ).n;

  const firstPageCount = withLead ? perPage + 1 : perPage;
  const limit = page === 1 ? firstPageCount : perPage;
  const offset = page === 1 ? 0 : firstPageCount + (page - 2) * perPage;

  const items = db()
    .prepare(
      `SELECT ${ARTICLE_COLUMNS} ${FROM_ARTICLES}
       WHERE a.published_at >= ? AND a.published_at < ?
       ORDER BY a.featured DESC, a.published_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(start, end, limit, offset) as Article[];

  const totalPages =
    total <= firstPageCount ? 1 : 1 + Math.ceil((total - firstPageCount) / perPage);

  return { items, total, page, perPage, totalPages };
}

/** Distinct months that contain at least one article, newest first. */
export function getArchiveMonths(): ArchiveMonth[] {
  const rows = db()
    .prepare(
      `SELECT CAST(strftime('%Y', published_at) AS INTEGER) AS year,
              CAST(strftime('%m', published_at) AS INTEGER) AS month,
              COUNT(*) AS count
       FROM articles
       GROUP BY year, month
       ORDER BY year DESC, month DESC`
    )
    .all() as ArchiveMonth[];
  return rows;
}

export function getCategories(): Category[] {
  // Ordered by insertion (see scripts/seed.mjs CATEGORIES) so the nav reflects
  // the intended section order rather than alphabetical.
  return db().prepare('SELECT id, slug, name, description, keywords FROM categories ORDER BY id ASC').all() as Category[];
}

/** Active monitored YouTube channels, grouped by category (insertion order). */
export function getYoutubeChannels(): import('./types').YoutubeChannel[] {
  return db()
    .prepare(
      `SELECT ch.id, ch.name, ch.handle, ch.channel_id, ch.url, ch.category_id, ch.weight, ch.active,
              c.slug AS category_slug, c.name AS category_name
       FROM youtube_channels ch
       LEFT JOIN categories c ON c.id = ch.category_id
       WHERE ch.active = 1
       ORDER BY ch.category_id ASC, ch.weight DESC, ch.name ASC`
    )
    .all() as import('./types').YoutubeChannel[];
}

/** Active monitored news sources, grouped by category then editorial weight. */
export function getSources(): import('./types').Source[] {
  return db()
    .prepare(
      `SELECT s.id, s.name, s.feed_url, s.site_url, s.category_id, s.weight, s.active,
              c.slug AS category_slug, c.name AS category_name
       FROM sources s
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE s.active = 1
       ORDER BY s.category_id ASC, s.weight DESC, s.name ASC`
    )
    .all() as import('./types').Source[];
}

export function getCategoryBySlug(slug: string): Category | null {
  return (
    (db().prepare('SELECT id, slug, name, description, keywords FROM categories WHERE slug = ?').get(slug) as Category) ?? null
  );
}

export function getArticlesForCategory(
  categoryId: number,
  page = 1,
  perPage = PER_PAGE
): Paged<Article> {
  const total = (
    db().prepare('SELECT COUNT(*) AS n FROM articles WHERE category_id = ?').get(categoryId) as { n: number }
  ).n;
  const offset = (page - 1) * perPage;
  const items = db()
    .prepare(
      `SELECT ${ARTICLE_COLUMNS} ${FROM_ARTICLES}
       WHERE a.category_id = ?
       ORDER BY a.published_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(categoryId, perPage, offset) as Article[];
  return paginate(items, total, page, perPage);
}

/** Most recent articles, optionally excluding one and/or limited to a window. */
export function getRecentArticles(opts: { limit?: number; excludeId?: number; withinMonths?: number } = {}): Article[] {
  const { limit = RELATED_LIMIT, excludeId, withinMonths } = opts;
  const clauses: string[] = [];
  const params: any[] = [];
  if (excludeId != null) {
    clauses.push('a.id != ?');
    params.push(excludeId);
  }
  if (withinMonths != null) {
    const d = buildNow();
    const cutoff = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - withinMonths, d.getUTCDate()));
    clauses.push('a.published_at >= ?');
    params.push(cutoff.toISOString());
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);
  return db()
    .prepare(`SELECT ${ARTICLE_COLUMNS} ${FROM_ARTICLES} ${where} ORDER BY a.published_at DESC LIMIT ?`)
    .all(...params) as Article[];
}

/**
 * Related articles for the sidebar. Priority:
 *   1. Curated entries from `related_articles` (populated by the daily AI task).
 *   2. Recent articles within the last RELATED_WINDOW_MONTHS months.
 *   3. Recent articles overall.
 * The result is de-duplicated and never includes the article itself.
 */
export function getRelatedArticles(article: Article, limit = RELATED_LIMIT): Article[] {
  const seen = new Set<number>([article.id]);
  const out: Article[] = [];

  const curated = db()
    .prepare(
      `SELECT ${ARTICLE_COLUMNS} ${FROM_ARTICLES}
       JOIN related_articles r ON r.related_article_id = a.id
       WHERE r.article_id = ?
       ORDER BY r.position ASC, a.published_at DESC`
    )
    .all(article.id) as Article[];

  for (const a of curated) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
    if (out.length >= limit) return out;
  }

  // Fallback: recent within window, then recent overall.
  const fillers = [
    ...getRecentArticles({ limit: limit * 3, excludeId: article.id, withinMonths: RELATED_WINDOW_MONTHS }),
    ...getRecentArticles({ limit: limit * 3, excludeId: article.id }),
  ];
  for (const a of fillers) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
    if (out.length >= limit) break;
  }
  return out;
}
