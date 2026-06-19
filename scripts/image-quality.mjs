import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

export const IMAGE_QUALITY = {
  FRONT_PAGE_MIN: 80,
  USABLE_MIN: 60,
  WEAK_MIN: 40,
};

const DEFAULT_ROOT = resolve(new URL('..', import.meta.url).pathname);

export function ensureImageQualityColumns(db) {
  const cols = db.prepare('PRAGMA table_info(articles)').all().map((c) => c.name);
  if (!cols.includes('image_quality_score')) {
    db.exec('ALTER TABLE articles ADD COLUMN image_quality_score INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('image_quality_status')) {
    db.exec("ALTER TABLE articles ADD COLUMN image_quality_status TEXT NOT NULL DEFAULT 'unscored'");
  }
  if (!cols.includes('image_quality_reason')) {
    db.exec('ALTER TABLE articles ADD COLUMN image_quality_reason TEXT');
  }
}

export function isRemoteUrl(src) {
  return /^https?:\/\//i.test(String(src || ''));
}

export function isLocalPublicPath(src) {
  return String(src || '').startsWith('/');
}

export function publicPathToFile(src, root = DEFAULT_ROOT) {
  if (!isLocalPublicPath(src)) return null;
  return join(root, 'public', src.replace(/^\/+/, ''));
}

function placeholderPenalty(src) {
  const s = String(src || '').toLowerCase();
  if (!s) return 0;
  if (s.includes('picsum.photos')) return 45;
  if (s.includes('/placeholder') || s.includes('placeholder.')) return 35;
  if (s.includes('default-image') || s.includes('no-image')) return 35;
  return 0;
}

function sourceBonus(src) {
  const s = String(src || '').toLowerCase();
  if (!s) return 0;
  if (s.startsWith('/images/')) return 8;
  if (s.includes('maxresdefault.jpg')) return 4;
  if (s.includes('hqdefault.jpg')) return -8;
  return 0;
}

function aspectScore(width, height) {
  if (!width || !height) return { score: 0, reason: 'unknown aspect ratio' };
  const ratio = width / height;
  const target = 16 / 9;
  const delta = Math.abs(ratio - target) / target;
  if (delta <= 0.08) return { score: 15, reason: null };
  if (delta <= 0.22) return { score: 10, reason: null };
  if (ratio >= 1.2 && ratio <= 2.4) return { score: 5, reason: 'awkward but usable aspect ratio' };
  return { score: 0, reason: 'poor hero-card aspect ratio' };
}

function dimensionScore(width, height, role) {
  const minWidth = role === 'thumb' ? 320 : 800;
  const goodWidth = role === 'thumb' ? 640 : 1280;
  const minHeight = role === 'thumb' ? 180 : 450;
  const goodHeight = role === 'thumb' ? 360 : 720;

  if (!width || !height) return { score: 0, reason: 'missing image dimensions' };
  if (width < 2 || height < 2) return { score: 0, reason: 'tracking-pixel sized image' };
  if (width < minWidth || height < minHeight) return { score: 10, reason: `low resolution (${width}×${height})` };
  if (width >= goodWidth && height >= goodHeight) return { score: 40, reason: null };
  return { score: 28, reason: `acceptable but below ideal resolution (${width}×${height})` };
}

async function edgeScoreForBuffer(buf) {
  try {
    const { data, info } = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || data.length < 4) return { score: 5, reason: 'could not estimate sharpness' };
    let total = 0;
    let count = 0;
    for (let y = 0; y < info.height - 1; y += 1) {
      for (let x = 0; x < info.width - 1; x += 1) {
        const i = y * info.width + x;
        total += Math.abs(data[i] - data[i + 1]) + Math.abs(data[i] - data[i + info.width]);
        count += 2;
      }
    }
    const avg = total / Math.max(1, count);
    if (avg >= 9) return { score: 20, reason: null };
    if (avg >= 5) return { score: 13, reason: 'slightly soft image' };
    if (avg >= 2.5) return { score: 7, reason: 'blurry or visually flat image' };
    return { score: 2, reason: 'very blurry or near-blank image' };
  } catch {
    return { score: 5, reason: 'could not estimate sharpness' };
  }
}

function fileSizeScore(bytes, width, height) {
  if (!bytes) return { score: 0, reason: 'unknown image file size' };
  const pixels = Math.max(1, (width || 1) * (height || 1));
  const bytesPerPixel = bytes / pixels;
  if (bytes < 5000) return { score: 0, reason: 'tiny image file' };
  if (bytesPerPixel < 0.015) return { score: 3, reason: 'likely over-compressed image' };
  if (bytesPerPixel < 0.03) return { score: 6, reason: 'possibly compressed image' };
  return { score: 10, reason: null };
}

function statusForScore(score, exists) {
  if (!exists) return 'missing';
  if (score >= IMAGE_QUALITY.FRONT_PAGE_MIN) return 'front-page';
  if (score >= IMAGE_QUALITY.USABLE_MIN) return 'usable';
  if (score >= IMAGE_QUALITY.WEAK_MIN) return 'weak';
  return 'reject';
}

function uniqReasons(reasons) {
  return [...new Set(reasons.filter(Boolean))].join('; ');
}

export async function scoreImageBuffer(buf, src, { role = 'hero', byteLength = null } = {}) {
  const reasons = [];
  let meta;
  try {
    meta = await sharp(buf, { failOn: 'none' }).rotate().metadata();
  } catch (err) {
    return { exists: true, score: 0, status: 'reject', reason: `unreadable image: ${err.message}`, width: null, height: null };
  }

  const width = meta.width || null;
  const height = meta.height || null;
  let score = 10; // exists and decodes

  const dim = dimensionScore(width, height, role);
  score += dim.score;
  reasons.push(dim.reason);

  const aspect = aspectScore(width, height);
  score += aspect.score;
  reasons.push(aspect.reason);

  const bytes = byteLength ?? buf.byteLength;
  const fileSize = fileSizeScore(bytes, width, height);
  score += fileSize.score;
  reasons.push(fileSize.reason);

  const edge = await edgeScoreForBuffer(buf);
  score += edge.score;
  reasons.push(edge.reason);

  score += sourceBonus(src);
  const placeholder = placeholderPenalty(src);
  if (placeholder) {
    score -= placeholder;
    reasons.push('placeholder or stock fallback source');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    exists: true,
    score,
    status: statusForScore(score, true),
    reason: uniqReasons(reasons) || 'good image quality',
    width,
    height,
    bytes,
  };
}

export async function scoreLocalImage(src, { root = DEFAULT_ROOT, role = 'hero' } = {}) {
  const file = publicPathToFile(src, root);
  if (!src) return { exists: false, score: 0, status: 'missing', reason: 'no image URL/path', width: null, height: null, bytes: 0 };
  if (!file) return { exists: false, score: 0, status: 'missing', reason: 'not a local public image path', width: null, height: null, bytes: 0 };
  if (!existsSync(file)) return { exists: false, score: 0, status: 'missing', reason: `local image file missing: ${src}`, width: null, height: null, bytes: 0 };
  const bytes = statSync(file).size;
  const buf = await sharp(file, { failOn: 'none' }).toBuffer();
  return scoreImageBuffer(buf, src, { role, byteLength: bytes });
}

export async function scoreRemoteImage(src, { referer, role = 'hero', timeoutMs = 15000, userAgent } = {}) {
  if (!src) return { exists: false, score: 0, status: 'missing', reason: 'no image URL/path', width: null, height: null, bytes: 0 };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(src, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'image/*',
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok) return { exists: false, score: 0, status: 'missing', reason: `image HTTP ${res.status}`, width: null, height: null, bytes: 0 };
    const contentType = res.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().includes('image')) {
      return { exists: false, score: 0, status: 'missing', reason: `URL did not return an image (${contentType})`, width: null, height: null, bytes: 0 };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return scoreImageBuffer(buf, src, { role, byteLength: buf.byteLength });
  } catch (err) {
    return { exists: false, score: 0, status: 'missing', reason: `image fetch failed: ${err.message}`, width: null, height: null, bytes: 0 };
  } finally {
    clearTimeout(t);
  }
}

export async function scoreArticleImage(row, { root = DEFAULT_ROOT, allowRemote = true, role = 'hero' } = {}) {
  const src = row?.hero_image || row?.thumbnail_image;
  if (!src) return { exists: false, score: 0, status: 'missing', reason: 'article has no hero or thumbnail image', width: null, height: null, bytes: 0 };
  if (isLocalPublicPath(src)) return scoreLocalImage(src, { root, role });
  if (isRemoteUrl(src) && allowRemote) return scoreRemoteImage(src, { referer: row?.source_url, role });
  if (isRemoteUrl(src)) {
    return { exists: true, score: 35, status: 'weak', reason: 'remote image not locally validated in this run', width: null, height: null, bytes: 0 };
  }
  return { exists: false, score: 0, status: 'missing', reason: `unsupported image path: ${src}`, width: null, height: null, bytes: 0 };
}

export function updateArticleImageQuality(db, id, result) {
  db.prepare(
    `UPDATE articles
     SET image_quality_score = @score,
         image_quality_status = @status,
         image_quality_reason = @reason,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = @id`
  ).run({
    id,
    score: result.score ?? 0,
    status: result.status || 'unscored',
    reason: result.reason || null,
  });
}
