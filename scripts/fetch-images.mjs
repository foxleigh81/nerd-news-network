// Fetch real lead images for articles from their source pages.
//
// For every article whose image is still a placeholder (or missing), this
// script loads the original article URL, reads its Open Graph / Twitter image,
// downloads it, optimises it into local hero + thumbnail files under
// public/images/, and updates the database with the local paths, a source
// credit and alt text.
//
// It NEVER touches articles that already have a real (non-placeholder) image,
// so it is safe to run alongside the daily AI task (which supplies its own
// artwork). Articles whose source has no usable image keep their placeholder.
//
// Usage:
//   node scripts/fetch-images.mjs           # only placeholder/missing images
//   node scripts/fetch-images.mjs --force   # re-fetch everything

import Database from 'better-sqlite3';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DB_PATH = join(ROOT, 'data', 'nnn.db');
const OUT_DIR = join(ROOT, 'public', 'images');
mkdirSync(OUT_DIR, { recursive: true });

const FORCE = process.argv.includes('--force');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const isPlaceholder = (url) => !url || url.includes('picsum.photos') || url.startsWith('/images/');
const rows = db
  .prepare('SELECT id, slug, headline, source_name, source_url, hero_image FROM articles ORDER BY id')
  .all()
  .filter((r) => r.source_url && (FORCE || isPlaceholder(r.hero_image)));

console.log(`[images] ${rows.length} article(s) to process${FORCE ? ' (force)' : ''}.`);

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Pull the best social-share image (and its alt, if any) from page HTML.
function extractImage(html, baseUrl) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const find = (key) => {
    for (const tag of metas) {
      const prop = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
      if (!prop) continue;
      if (prop[1].toLowerCase() !== key) continue;
      const content = tag.match(/content\s*=\s*["']([^"']*)["']/i);
      if (content && content[1]) return decodeEntities(content[1].trim());
    }
    return null;
  };
  const src =
    find('og:image:secure_url') ||
    find('og:image:url') ||
    find('og:image') ||
    find('twitter:image') ||
    find('twitter:image:src');
  if (!src) return null;
  const alt = find('og:image:alt') || find('twitter:image:alt');
  let abs;
  try {
    abs = new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
  return { url: abs, alt };
}

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

async function processArticle(row) {
  const pageRes = await fetchWithTimeout(row.source_url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!pageRes.ok) throw new Error(`page HTTP ${pageRes.status}`);
  const html = await pageRes.text();

  const img = extractImage(html, row.source_url);
  if (!img) throw new Error('no og:image found');

  const imgRes = await fetchWithTimeout(img.url, {
    headers: { 'User-Agent': UA, Referer: row.source_url, Accept: 'image/*' },
  });
  if (!imgRes.ok) throw new Error(`image HTTP ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());

  // Optimise into a 16:9 hero and thumbnail (WebP for size/perf).
  const heroFile = `${row.slug}-hero.webp`;
  const thumbFile = `${row.slug}-thumb.webp`;
  const base = sharp(buf, { failOn: 'none' }).rotate();
  await base.clone().resize(1280, 720, { fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toFile(join(OUT_DIR, heroFile));
  await base.clone().resize(640, 360, { fit: 'cover', position: 'attention' }).webp({ quality: 78 }).toFile(join(OUT_DIR, thumbFile));

  const alt = (img.alt && img.alt.length > 3 ? img.alt : `Lead image for “${row.headline}”`).slice(0, 280);
  const credit = `Image: ${row.source_name}`;

  db.prepare(
    `UPDATE articles
     SET hero_image = @hero, thumbnail_image = @thumb,
         hero_image_alt = @alt, thumbnail_alt = @alt, hero_credit = @credit,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = @id`
  ).run({
    id: row.id,
    hero: `/images/${heroFile}`,
    thumb: `/images/${thumbFile}`,
    alt,
    credit,
  });

  return img.url;
}

// Limited concurrency.
const CONCURRENCY = 5;
let ok = 0;
let failed = 0;
const queue = [...rows];
async function worker() {
  while (queue.length) {
    const row = queue.shift();
    try {
      const src = await processArticle(row);
      ok++;
      console.log(`  ✓ ${row.slug}  ←  ${src}`);
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${row.slug}  (${e.message}) — keeping placeholder`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`[images] done: ${ok} fetched, ${failed} kept placeholder.`);
db.close();
