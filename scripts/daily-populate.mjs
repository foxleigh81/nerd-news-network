#!/usr/bin/env node
import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArticleRows } from './validate-articles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DB_PATH = join(ROOT, 'data', 'nnn.db');
const DAILY_PER_CATEGORY = Number(process.env.DAILY_PER_CATEGORY || 4);
const BUILD_DATE = process.env.NNN_BUILD_DATE ? new Date(process.env.NNN_BUILD_DATE) : new Date();
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
function ageDays(date) { return (BUILD_DATE.getTime() - new Date(date).getTime()) / 86400000; }
function hasKeyword(text, keywords) { const low = text.toLowerCase(); return keywords.filter(k => k && low.includes(k.toLowerCase())).length; }
function splitSentences(text) { return stripHtml(text).replace(/\s+/g,' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map(s => s.trim()).filter(s => s.length > 35 && s.length < 260); }
function sentenceEnd(s) { return /[.!?…]["')\]]?$/.test(s) ? s : `${s}.`; }
function cleanSentence(s) { return sentenceEnd(s.replace(/\b(click here|read more|continue reading)\b.*$/i,'').trim()); }
async function fetchText(url, ms=20000) { const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), ms); try { const r = await fetch(url, { signal: ctrl.signal, redirect:'follow', headers:{'User-Agent':UA, Accept:'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/xml,*/*'}}); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); } finally { clearTimeout(t); } }
function extractOgImage(html, baseUrl) { const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]); const find = (...keys) => { for (const key of keys) for (const tag of metas) { const prop = attr(tag,'property') || attr(tag,'name'); if (prop && prop.toLowerCase() === key) { const c = attr(tag,'content'); if (c) return c; } } return null; }; const src = find('og:image:secure_url','og:image:url','og:image','twitter:image','twitter:image:src'); if (!src) return null; try { return { url: new URL(src, baseUrl).toString(), alt: find('og:image:alt','twitter:image:alt') || null }; } catch { return null; } }
function extractArticleText(html) { const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>stripHtml(m[1])).filter(p => p.length > 60 && p.length < 500 && !/cookies|privacy policy|sign up|newsletter|advertisement|subscribe|all rights reserved/i.test(p)); return paras.slice(0,8).join(' '); }
function parseFeed(xml, source) { const items = [];
  if (/<urlset[\s>]/i.test(xml)) { for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) { const block=m[1]; const loc=textBetween(block,'loc'); if (!loc || !/\/blog\//i.test(loc)) continue; items.push({ title: loc.split('/').filter(Boolean).pop().replace(/[-_]/g,' '), link: loc, published: textBetween(block,'lastmod'), summary:'' }); } return items; }
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) { const b=m[1]; items.push({ title: stripHtml(textBetween(b,'title')), link: textBetween(b,'link') || textBetween(b,'guid'), published: textBetween(b,'pubDate') || textBetween(b,'dc:date') || textBetween(b,'published') || textBetween(b,'updated'), summary: stripHtml(textBetween(b,'description') || textBetween(b,'content:encoded')) }); }
  for (const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) { const b=m[1]; const linkTag = (b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i)||b.match(/<link\b[^>]*>/i)||[''])[0]; const thumbTag = (b.match(/<media:thumbnail\b[^>]*>/i)||[''])[0]; items.push({ title: stripHtml(textBetween(b,'title') || textBetween(b,'media:title')), link: attr(linkTag,'href') || textBetween(b,'link') || textBetween(b,'id'), published: textBetween(b,'published') || textBetween(b,'updated'), summary: stripHtml(textBetween(b,'summary') || textBetween(b,'content') || textBetween(b,'media:description')), videoId: textBetween(b,'yt:videoId') || null, image: attr(thumbTag,'url') || null }); }
  return items;
}
function youtubeFeedUrl(channel) { return channel.channel_id ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.channel_id)}` : null; }
function youtubeVideoId(url) { try { return new URL(url).searchParams.get('v'); } catch { return null; } }
function youtubeThumbnail(videoId, fallback) { return videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : fallback; }
function makeBody({title, sourceName, summary, pageText}) { const sentences = [...splitSentences(summary), ...splitSentences(pageText)]; const unique=[]; for (const s of sentences) { const c=cleanSentence(s); if (!unique.some(u => u.toLowerCase() === c.toLowerCase())) unique.push(c); if (unique.length >= 7) break; }
  const intro = unique[0] || `${title} is the latest update from ${sourceName}.`;
  const bullets = unique.slice(1,5); while (bullets.length < 3) bullets.push(`${sourceName} frames the update around ${title.toLowerCase().replace(/[.!?]$/,'')}.`);
  const context = unique.slice(5,7);
  const why = context[0] || bullets[0];
  return `${intro}\n\n## The short version\n\n${bullets.map(b=>`- ${b}`).join('\n')}\n\n## What happened\n\n${cleanSentence(unique[1] || intro)} ${cleanSentence(unique[2] || bullets[0])}\n\n## Why it matters\n\n${cleanSentence(why)}\n\n> Summary by Nerd News Network. Read the full article at **${sourceName}** via the links above and below.\n`;
}
function cleanVideoSummary(summary='') { const kept=[]; for (const raw of String(summary).split(/\n+/)) { const line = raw.trim(); if (!line) continue; if (/^(#|---|my links:?|gear \+ stuff|support the channel|disclaimer:?)/i.test(line)) break; if (/\b(discord|patreon|affiliate links|use code|t-?shirt|credits depending on the tier)\b/i.test(line)) continue; kept.push(line.replace(/https?:\/\/\S+/g,'').trim()); } return kept.join(' '); }
function makeVideoBody({title, sourceName, summary}) { const unique=[]; for (const s of splitSentences(cleanVideoSummary(summary))) { const c=cleanSentence(s.replace(/#\S+/g,'').trim()); if (c.length > 45 && !/\b(linked below|description|affiliate|discord|patreon|support me)\b/i.test(c) && !unique.some(u => u.toLowerCase() === c.toLowerCase())) unique.push(c); if (unique.length >= 6) break; }
  const intro = unique[0] || `${sourceName} has published a new video: ${title}.`;
  const bullets = unique.slice(1,4); while (bullets.length < 3) bullets.push(`${sourceName} uses the video to focus on ${title.toLowerCase().replace(/[.!?]$/,'')}.`);
  const watch = unique[4] || `The practical takeaway is to use the video as a buying and setup guide, then compare the recommended devices against your own smart-home needs.`;
  const context = unique[5] || `For NNN readers, the useful bit is the concrete product framing rather than another abstract smart-home standards argument.`;
  return `${intro}\n\n## The short version\n\n${bullets.map(b=>`- ${b}`).join('\n')}\n\n## What to watch for\n\n${watch}\n\n## Why it matters\n\n${context}\n\n> Summary by Nerd News Network. Watch the full video at **${sourceName}** via the links above and below.\n`;
}
function makeBlurb(title, summary, pageText) { const s = splitSentences(summary)[0] || splitSentences(pageText)[0] || `${title} is a notable update worth catching up on.`; return cleanSentence(s).slice(0, 260).replace(/[,;:]?\s*$/,'') + (/[.!?…]$/.test(s.slice(0,260)) ? '' : '.'); }

const db = new Database(DB_PATH); db.pragma('foreign_keys = ON');
const categories = db.prepare('SELECT * FROM categories ORDER BY id').all();
const catById = Object.fromEntries(categories.map(c=>[c.id,c]));
const sources = db.prepare('SELECT s.*, c.slug AS category_slug, c.keywords FROM sources s JOIN categories c ON c.id=s.category_id WHERE s.active=1 ORDER BY c.id, s.weight DESC, s.name').all();
const youtubeChannels = db.prepare('SELECT ch.*, c.slug AS category_slug, c.keywords FROM youtube_channels ch JOIN categories c ON c.id=ch.category_id WHERE ch.active=1 ORDER BY c.id, ch.weight DESC, ch.name').all();
const existingUrls = new Set(db.prepare('SELECT source_url FROM articles WHERE source_url IS NOT NULL').all().map(r=>r.source_url));
const existingVideoIds = new Set(db.prepare('SELECT video_youtube_id FROM articles WHERE video_youtube_id IS NOT NULL').all().map(r=>r.video_youtube_id));
const startMaxId = db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM articles').get().id;
const inserted = [];
const diagnostics = [];

for (const cat of categories) {
  const todaysCount = db.prepare("SELECT COUNT(*) AS n FROM articles WHERE category_id=? AND date(created_at)=date('now')").get(cat.id).n;
  let needed = Math.max(0, DAILY_PER_CATEGORY - todaysCount);
  if (!needed) continue;
  const candidates=[];
  const perSourcePicked = new Map();
  for (const source of sources.filter(s=>s.category_id===cat.id)) {
    try {
      const xml = await fetchText(source.feed_url);
      for (const item of parseFeed(xml, source)) {
        const url = canonicalize(item.link); if (!url || existingUrls.has(url)) continue;
        const published = iso(item.published || BUILD_DATE); if (!published) continue;
        const age = ageDays(published); if (age < -1 || age > WINDOW_DAYS) continue;
        const hay = `${item.title} ${item.summary}`;
        const recency = Math.max(0, 10 - Math.floor(Math.max(0, age)) * 2);
        const topic = hasKeyword(hay, String(cat.keywords||'').split(',').map(s=>s.trim()));
        candidates.push({ kind:'article', source, title:item.title, url, published, summary:item.summary, score: recency + source.weight + topic });
      }
    } catch (e) { diagnostics.push(`${cat.slug}/${source.name}: feed ${e.message}`); }
  }
  for (const channel of youtubeChannels.filter(ch=>ch.category_id===cat.id)) {
    const feedUrl = youtubeFeedUrl(channel);
    if (!feedUrl) { diagnostics.push(`${cat.slug}/${channel.name}: skipped no channel_id`); continue; }
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
        const topic = hasKeyword(hay, String(cat.keywords||'').split(',').map(s=>s.trim()));
        candidates.push({ kind:'youtube', source: channel, title:item.title, url, published, summary:item.summary, score: recency + channel.weight + topic + 2, videoId, image:youtubeThumbnail(videoId, item.image) });
      }
    } catch (e) { diagnostics.push(`${cat.slug}/${channel.name}: youtube feed ${e.message}`); }
  }
  candidates.sort((a,b)=> b.score-a.score || new Date(b.published)-new Date(a.published) || a.url.localeCompare(b.url));
  for (const cand of candidates) {
    if (needed <= 0) break;
    const used = perSourcePicked.get(cand.source.id) || 0; if (used >= 2) continue;
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
      if (!img?.url) { diagnostics.push(`${cat.slug}/${cand.title}: rejected no hero image`); continue; }
      const title = cand.title && cand.title.length > 8 ? cand.title : null;
      if (!title) continue;
      if ((cand.summary + pageText).length < 160) { diagnostics.push(`${cat.slug}/${title}: rejected insufficient text`); continue; }
      let slug = slugify(title); let base = slug; let n=2; while (db.prepare('SELECT 1 FROM articles WHERE slug=?').get(slug)) slug = `${base}-${n++}`;
      const row = { slug, headline: title.slice(0,180), blurb: makeBlurb(title,cand.summary,pageText), body: cand.kind === 'youtube' ? makeVideoBody({title,sourceName:cand.source.name,summary:cand.summary}) : makeBody({title,sourceName:cand.source.name,summary:cand.summary,pageText}), hero_image: img.url, hero_image_alt: (img.alt || `Lead image for “${title}”.`).slice(0,280), hero_credit: `Image: ${cand.source.name}`, thumbnail_image: img.url, thumbnail_alt: (img.alt || `Thumbnail image for “${title}”.`).slice(0,280), category_id: cat.id, author:'NNN Staff', source_name:cand.source.name, source_url:cand.url, video_youtube_id: cand.videoId || null, published_at:cand.published };
      const fails = validateArticleRows([row]); if (fails.length) { diagnostics.push(`${cat.slug}/${title}: validation ${fails.map(f=>f.reason).join('; ')}`); continue; }
      const info = db.prepare(`INSERT INTO articles (slug, headline, blurb, body, hero_image, hero_image_alt, hero_credit, thumbnail_image, thumbnail_alt, category_id, author, source_name, source_url, video_youtube_id, published_at) VALUES (@slug,@headline,@blurb,@body,@hero_image,@hero_image_alt,@hero_credit,@thumbnail_image,@thumbnail_alt,@category_id,@author,@source_name,@source_url,@video_youtube_id,@published_at)`).run(row);
      inserted.push({ id: info.lastInsertRowid, category: cat.slug, source: cand.source.name, title }); existingUrls.add(cand.url); if (row.video_youtube_id) existingVideoIds.add(row.video_youtube_id); perSourcePicked.set(cand.source.id, used+1); needed--;
    } catch (e) { diagnostics.push(`${cat.slug}/${cand.title}: article ${e.message}`); }
  }
  if (needed > 0) diagnostics.push(`${cat.slug}: shortfall ${needed}/${DAILY_PER_CATEGORY}`);
}

function editorialLeads() {
  db.exec('UPDATE articles SET featured=0, category_featured=0');
  const smart = db.prepare("SELECT id FROM categories WHERE slug='smart-homes'").get();
  const localDate = new Date().toLocaleDateString('en-CA');
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
console.log(JSON.stringify({ inserted, insertedCount: inserted.length, startMaxId, diagnostics: diagnostics.slice(-80) }, null, 2));
db.close();
