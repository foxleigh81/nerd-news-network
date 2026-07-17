#!/usr/bin/env node
import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArticleRows } from './validate-articles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DB_PATH = join(ROOT, 'data', 'nnn.db');
const CANDIDATE_BATCH_SIZE = Number(process.env.NNN_CANDIDATE_BATCH_SIZE || 60);
const MIN_SUCCESS_ARTICLES = Number(process.env.NNN_MIN_SUCCESS_ARTICLES || 16); // "greater than 15" gate.
const MAX_PUBLISHED_ARTICLES = Number(process.env.NNN_MAX_PUBLISHED_ARTICLES || 25);
const BUILD_DATE = process.env.NNN_BUILD_DATE ? new Date(process.env.NNN_BUILD_DATE) : new Date();
const BUILD_DATE_KEY = BUILD_DATE.toISOString().slice(0, 10);
const WINDOW_DAYS = Number(process.env.NNN_RECENCY_DAYS || 7);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TRACKING = new Set(['fbclid','gclid','dclid','mc_cid','mc_eid','igshid','ref','ref_src']);

function decode(s='') { return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d,10))); }
function stripHtml(s='') { return decode(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function textBetween(xml, tag) { const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i')); return m ? decode(m[1]).trim() : ''; }
function attr(tag, name) { const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; }
function slugify(s) { return s.toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80); }
function canonicalize(raw) { try { const u = new URL(decode(raw)); u.hash = ''; u.hostname = u.hostname.toLowerCase(); for (const k of [...u.searchParams.keys()]) if (k.toLowerCase().startsWith('utm_') || TRACKING.has(k.toLowerCase())) u.searchParams.delete(k); return u.toString(); } catch { return null; } }
function iso(d) { const x = new Date(d); return Number.isFinite(x.getTime()) ? x.toISOString().replace(/\.\d{3}Z$/,'Z') : null; }
function buildCreatedAt() {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
  return `${BUILD_DATE_KEY}${now.slice(10)}`;
}
function ageDays(date) { return (BUILD_DATE.getTime() - new Date(date).getTime()) / 86400000; }
function hasKeyword(text, keywords) { const low = text.toLowerCase(); return keywords.filter(k => k && low.includes(k.toLowerCase())).length; }
function splitSentences(text) { return stripHtml(text).replace(/\s+/g,' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map(s => s.trim()).filter(s => s.length > 35 && s.length < 260); }
function sentenceEnd(s) { return /[.!?…]["')\]]?$/.test(s) ? s : `${s}.`; }
function cleanSentence(s) { return sentenceEnd(s.replace(/\b(click here|read more|continue reading)\b.*$/i,'').trim()); }
async function fetchText(url, ms=20000) { const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), ms); try { const r = await fetch(url, { signal: ctrl.signal, redirect:'follow', headers:{'User-Agent':UA, Accept:'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/xml,*/*'}}); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); } finally { clearTimeout(t); } }
function extractOgImage(html, baseUrl) { const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]); const find = (...keys) => { for (const key of keys) for (const tag of metas) { const prop = attr(tag,'property') || attr(tag,'name'); if (prop && prop.toLowerCase() === key) { const c = attr(tag,'content'); if (c) return c; } } return null; }; const src = find('og:image:secure_url','og:image:url','og:image','twitter:image','twitter:image:src'); if (!src) return null; try { return { url: new URL(src, baseUrl).toString(), alt: find('og:image:alt','twitter:image:alt') || null }; } catch { return null; } }
function isPublisherBoilerplate(text) {
  return /cookies|privacy policy|sign up|newsletter|advertisement|subscribe|all rights reserved|StrictlyVC|Founder Summit|ticket savings|all-day bootcamp|TechCrunch Mobility|best of TechCrunch|coverage delivered weekly|movers and shakers|purchase through links|earn a small commission/i.test(text);
}
function extractArticleText(html) { const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>stripHtml(m[1])).filter(p => p.length > 60 && p.length < 500 && !isPublisherBoilerplate(p)); return paras.slice(0,8).join(' '); }
function parseFeed(xml, source) { const items = [];
  if (/<urlset[\s>]/i.test(xml)) { for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) { const block=m[1]; const loc=textBetween(block,'loc'); if (!loc || !/\/blog\//i.test(loc)) continue; items.push({ title: loc.split('/').filter(Boolean).pop().replace(/[-_]/g,' '), link: loc, published: textBetween(block,'lastmod'), summary:'' }); } return items; }
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) { const b=m[1]; items.push({ title: stripHtml(textBetween(b,'title')), link: textBetween(b,'link') || textBetween(b,'guid'), published: textBetween(b,'pubDate') || textBetween(b,'dc:date') || textBetween(b,'published') || textBetween(b,'updated'), summary: stripHtml(textBetween(b,'description') || textBetween(b,'content:encoded')) }); }
  for (const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) { const b=m[1]; const linkTag = (b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i)||b.match(/<link\b[^>]*>/i)||[''])[0]; const thumbTag = (b.match(/<media:thumbnail\b[^>]*>/i)||[''])[0]; items.push({ title: stripHtml(textBetween(b,'title') || textBetween(b,'media:title')), link: attr(linkTag,'href') || textBetween(b,'link') || textBetween(b,'id'), published: textBetween(b,'published') || textBetween(b,'updated'), summary: stripHtml(textBetween(b,'summary') || textBetween(b,'content') || textBetween(b,'media:description')), videoId: textBetween(b,'yt:videoId') || null, image: attr(thumbTag,'url') || null }); }
  return items;
}
function youtubeFeedUrl(channel) { return channel.channel_id ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.channel_id)}` : null; }
function youtubeVideoId(url) { try { return new URL(url).searchParams.get('v'); } catch { return null; } }
function youtubeThumbnail(videoId, fallback) { return videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : fallback; }
function makeBody({title, sourceName, summary, pageText}) {
  const sentences = [...splitSentences(summary), ...splitSentences(pageText)];
  const unique=[];
  for (const s of sentences) {
    const c=cleanSentence(s);
    if (!unique.some(u => u.toLowerCase() === c.toLowerCase())) unique.push(c);
    if (unique.length >= 8) break;
  }

  const titleStem = title.toLowerCase().replace(/[.!?]$/,'');
  const fallback = [
    `${sourceName} says ${titleStem} is the central development readers should understand.`,
    `The update adds fresh detail around ${titleStem} rather than relying on a generic announcement.`,
    `For NNN readers, the useful bit is how ${titleStem} changes the immediate story in this beat.`,
  ];
  const next = (fallbackIndex = 0) => unique.shift() || fallback[fallbackIndex % fallback.length];

  const intro = next(0);
  const bullets = [next(1), next(2), next(0)];
  const happened = [next(1), next(2)].map(cleanSentence).join(' ');
  const why = cleanSentence(next(0));

  return `${intro}\n\n## The short version\n\n${bullets.map(b=>`- ${b}`).join('\n')}\n\n## What happened\n\n${happened}\n\n## Why it matters\n\n${why}\n\n> Summary by Nerd News Network. Read the full article at **${sourceName}** via the links above and below.\n`;
}
function cleanVideoSummary(summary='') { const kept=[]; for (const raw of String(summary).split(/\n+/)) { const line = raw.trim(); if (!line) continue; if (/^(#|---|my links:?|gear \+ stuff|support the channel|disclaimer:?)/i.test(line)) break; if (/\b(discord|patreon|affiliate links|use code|t-?shirt|credits depending on the tier)\b/i.test(line)) continue; kept.push(line.replace(/https?:\/\/\S+/g,'').trim()); } return kept.join(' '); }
function makeVideoBody({title, sourceName, summary}) {
  const unique=[];
  for (const s of splitSentences(cleanVideoSummary(summary))) {
    const c=cleanSentence(s.replace(/#\S+/g,'').trim());
    if (c.length > 45 && !/\b(linked below|description|affiliate|discord|patreon|support me)\b/i.test(c) && !unique.some(u => u.toLowerCase() === c.toLowerCase())) unique.push(c);
    if (unique.length >= 6) break;
  }

  const titleStem = title.toLowerCase().replace(/[.!?]$/,'');
  const fallback = [
    `${sourceName} has published a new video about ${titleStem}.`,
    `The episode focuses on the practical details behind ${titleStem}.`,
    `The useful watch is the hands-on framing rather than a generic product announcement.`,
    `Viewers should look for the specific examples and trade-offs shown in the footage.`,
    `For NNN readers, the value is seeing how ${titleStem} plays out in a real creator workflow.`,
    `The clip is worth checking against the original source before making any buying or setup decisions.`,
  ];
  const next = (fallbackIndex = 0) => unique.shift() || fallback[fallbackIndex % fallback.length];

  const intro = next(0);
  const bullets = [next(1), next(2), next(3)];
  const watch = next(4);
  const context = next(5);
  return `${intro}\n\n## The short version\n\n${bullets.map(b=>`- ${b}`).join('\n')}\n\n## What to watch for\n\n${watch}\n\n## Why it matters\n\n${context}\n\n> Summary by Nerd News Network. Watch the full video at **${sourceName}** via the links above and below.\n`;
}
function makeBlurb(title, summary, pageText) { const s = splitSentences(summary)[0] || splitSentences(pageText)[0] || `${title} is a notable update worth catching up on.`; return cleanSentence(s).slice(0, 260).replace(/[,;:]?\s*$/,'') + (/[.!?…]$/.test(s.slice(0,260)) ? '' : '.'); }

const db = new Database(DB_PATH); db.pragma('foreign_keys = ON');
const categories = db.prepare('SELECT * FROM categories ORDER BY id').all();
const sources = db.prepare('SELECT s.*, c.slug AS category_slug, c.keywords FROM sources s JOIN categories c ON c.id=s.category_id WHERE s.active=1 ORDER BY s.weight DESC, c.id, s.name').all();
const youtubeChannels = db.prepare('SELECT ch.*, c.slug AS category_slug, c.keywords FROM youtube_channels ch JOIN categories c ON c.id=ch.category_id WHERE ch.active=1 ORDER BY ch.weight DESC, c.id, ch.name').all();
const existingUrls = new Set(db.prepare('SELECT source_url FROM articles WHERE source_url IS NOT NULL').all().map(r=>r.source_url));
const existingVideoIds = new Set(db.prepare('SELECT video_youtube_id FROM articles WHERE video_youtube_id IS NOT NULL').all().map(r=>r.video_youtube_id));
const startMaxId = db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM articles').get().id;

const todaysExisting = db.prepare('SELECT COUNT(*) AS n FROM articles WHERE date(created_at)=?').get(BUILD_DATE_KEY).n;
const inserted = [];
const processed = [];
const diagnostics = [];

function keywordsFor(categoryId) {
  const cat = categories.find(c => c.id === categoryId);
  return String(cat?.keywords || '').split(',').map(s=>s.trim()).filter(Boolean);
}

async function collectCandidates() {
  const candidates = [];
  for (const source of sources) {
    try {
      const xml = await fetchText(source.feed_url);
      for (const item of parseFeed(xml, source)) {
        const url = canonicalize(item.link); if (!url || existingUrls.has(url)) continue;
        const published = iso(item.published || BUILD_DATE); if (!published) continue;
        const age = ageDays(published); if (age < -1 || age > WINDOW_DAYS) continue;
        const hay = `${item.title} ${item.summary}`;
        const recency = Math.max(0, 10 - Math.floor(Math.max(0, age)) * 2);
        const topic = hasKeyword(hay, keywordsFor(source.category_id));
        candidates.push({ kind:'article', source, categoryId: source.category_id, category: source.category_slug, title:item.title, url, published, summary:item.summary, score: recency + source.weight + topic });
      }
    } catch (e) { diagnostics.push(`${source.category_slug}/${source.name}: feed ${e.message}`); }
  }

  for (const channel of youtubeChannels) {
    const feedUrl = youtubeFeedUrl(channel);
    if (!feedUrl) { diagnostics.push(`${channel.category_slug}/${channel.name}: skipped no channel_id`); continue; }
    try {
      const xml = await fetchText(feedUrl);
      for (const item of parseFeed(xml, channel)) {
        const videoId = item.videoId || youtubeVideoId(item.link);
        const url = canonicalize(item.link);
        if (!videoId || !url || existingVideoIds.has(videoId) || existingUrls.has(url)) continue;
        const published = iso(item.published || BUILD_DATE); if (!published) continue;
        const age = ageDays(published); if (age < -1 || age > WINDOW_DAYS) continue;
        const hay = `${item.title} ${item.summary}`;
        const recency = Math.max(0, 10 - Math.floor(Math.max(0, age)) * 2);
        const topic = hasKeyword(hay, keywordsFor(channel.category_id));
        candidates.push({ kind:'youtube', source: channel, categoryId: channel.category_id, category: channel.category_slug, title:item.title, url, published, summary:item.summary, score: recency + channel.weight + topic + 2, videoId, image:youtubeThumbnail(videoId, item.image) });
      }
    } catch (e) { diagnostics.push(`${channel.category_slug}/${channel.name}: youtube feed ${e.message}`); }
  }

  candidates.sort((a,b)=>
    b.score-a.score ||
    (b.source.weight || 0)-(a.source.weight || 0) ||
    new Date(b.published)-new Date(a.published) ||
    a.category.localeCompare(b.category) ||
    a.url.localeCompare(b.url)
  );
  return candidates;
}

async function processCandidate(cand) {
  try {
    let img = null;
    let pageText = '';
    if (cand.kind === 'youtube') {
      img = cand.image ? { url: cand.image, alt: `Thumbnail for “${cand.title}”.` } : null;
    } else {
      const html = await fetchText(cand.url);
      img = extractOgImage(html, cand.url);
      pageText = extractArticleText(html);
      const htmlTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      if (!cand.title || cand.title.length <= 8) cand.title = htmlTitle ? stripHtml(htmlTitle) : cand.title;
    }
    if (!img?.url) return { ok:false, reason:'rejected no hero image' };
    const title = cand.title && cand.title.length > 8 ? cand.title : null;
    if (!title) return { ok:false, reason:'rejected missing title' };
    if ((cand.summary + pageText).length < 160) return { ok:false, reason:'rejected insufficient text' };
    let slug = slugify(title); let base = slug; let n=2; while (db.prepare('SELECT 1 FROM articles WHERE slug=?').get(slug)) slug = `${base}-${n++}`;
    const row = { slug, headline: title.slice(0,180), blurb: makeBlurb(title,cand.summary,pageText), body: cand.kind === 'youtube' ? makeVideoBody({title,sourceName:cand.source.name,summary:cand.summary}) : makeBody({title,sourceName:cand.source.name,summary:cand.summary,pageText}), hero_image: img.url, hero_image_alt: (img.alt || `Lead image for “${title}”.`).slice(0,280), hero_credit: `Image: ${cand.source.name}`, thumbnail_image: img.url, thumbnail_alt: (img.alt || `Thumbnail image for “${title}”.`).slice(0,280), category_id: cand.categoryId, author:'NNN Staff', source_name:cand.source.name, source_url:cand.url, video_youtube_id: cand.videoId || null, published_at:cand.published, created_at: buildCreatedAt() };
    const validationRow = { ...row };
    const peerRows = db.prepare('SELECT slug, headline, blurb, body, source_name, created_at FROM articles WHERE date(created_at)=? AND source_name=?').all(BUILD_DATE_KEY, row.source_name);
    const fails = validateArticleRows([...peerRows, validationRow]);
    if (fails.length) return { ok:false, reason:`validation ${fails.map(f=>f.reason).join('; ')}` };
    const info = db.prepare(`INSERT INTO articles (slug, headline, blurb, body, hero_image, hero_image_alt, hero_credit, thumbnail_image, thumbnail_alt, category_id, author, source_name, source_url, video_youtube_id, published_at, created_at) VALUES (@slug,@headline,@blurb,@body,@hero_image,@hero_image_alt,@hero_credit,@thumbnail_image,@thumbnail_alt,@category_id,@author,@source_name,@source_url,@video_youtube_id,@published_at,@created_at)`).run(row);
    existingUrls.add(cand.url); if (row.video_youtube_id) existingVideoIds.add(row.video_youtube_id);
    return { ok:true, article:{ id: info.lastInsertRowid, category: cand.category, source: cand.source.name, title } };
  } catch (e) {
    return { ok:false, reason:`article ${e.message}` };
  }
}

const candidates = await collectCandidates();
let cursor = 0;
while (todaysExisting + inserted.length < MAX_PUBLISHED_ARTICLES && cursor < candidates.length) {
  const batch = candidates.slice(cursor, cursor + CANDIDATE_BATCH_SIZE);
  cursor += CANDIDATE_BATCH_SIZE;
  for (const cand of batch) {
    if (todaysExisting + inserted.length >= MAX_PUBLISHED_ARTICLES) break;
    const result = await processCandidate(cand);
    processed.push({ category: cand.category, source: cand.source.name, title: cand.title, score: cand.score, ok: result.ok, reason: result.reason });
    if (result.ok) inserted.push(result.article);
  }
  if (todaysExisting + inserted.length >= MIN_SUCCESS_ARTICLES) break;
}

if (todaysExisting + inserted.length < MIN_SUCCESS_ARTICLES) {
  diagnostics.push(`success gate failed: ${todaysExisting + inserted.length}/${MIN_SUCCESS_ARTICLES} publishable articles after processing ${processed.length}/${candidates.length} candidates`);
  process.exitCode = 1;
}
if (todaysExisting + inserted.length >= MAX_PUBLISHED_ARTICLES && cursor < candidates.length) {
  diagnostics.push(`publish cap reached: kept ${MAX_PUBLISHED_ARTICLES}, discarded remaining ranked candidates`);
}

function editorialLeads() {
  db.exec('UPDATE articles SET featured=0, category_featured=0');
  const smart = db.prepare("SELECT id FROM categories WHERE slug='smart-homes'").get();
  const localDate = BUILD_DATE_KEY;
  const foxy = db.prepare("SELECT a.* FROM articles a WHERE a.source_name = 'Foxy''s Lab' AND date(a.published_at)=? ORDER BY a.published_at DESC, a.id DESC LIMIT 1").get(localDate);
  const scoreExpr = `(CASE WHEN image_quality_status IN ('front-page','usable','unscored') THEN 20 ELSE 0 END) + (CASE WHEN source_name LIKE '%Ars%' OR source_name LIKE '%MIT%' OR source_name LIKE '%Quanta%' OR source_name LIKE '%Foxy%' THEN 5 ELSE 0 END)`;
  const front = foxy || db.prepare(`SELECT * FROM articles WHERE published_at >= datetime('now','-14 days') ORDER BY ${scoreExpr} DESC, published_at DESC, id DESC LIMIT 1`).get() || db.prepare('SELECT * FROM articles ORDER BY published_at DESC LIMIT 1').get();
  if (front) db.prepare('UPDATE articles SET featured=1 WHERE id=?').run(front.id);
  for (const cat of categories) {
    let lead = null;
    if (foxy && smart && cat.id === smart.id) lead = foxy;
    else lead = db.prepare(`SELECT * FROM articles WHERE category_id=? ORDER BY ${scoreExpr} DESC, published_at DESC, id DESC LIMIT 1`).get(cat.id);
    if (lead) db.prepare('UPDATE articles SET category_featured=1 WHERE id=?').run(lead.id);
  }
}
editorialLeads();
console.log(JSON.stringify({ inserted, insertedCount: inserted.length, todaysExisting, publishedToday: todaysExisting + inserted.length, successGate: { minimum: MIN_SUCCESS_ARTICLES, passed: todaysExisting + inserted.length >= MIN_SUCCESS_ARTICLES }, candidateBatchSize: CANDIDATE_BATCH_SIZE, processedCount: processed.length, candidateCount: candidates.length, diagnostics: diagnostics.slice(-120), rejectedSample: processed.filter(p=>!p.ok).slice(-25) }, null, 2));
db.close();
