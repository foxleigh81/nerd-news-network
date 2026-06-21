#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureImageQualityColumns, scoreArticleImage } from './image-quality.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_DB = join(__dirname, '..', 'data', 'nnn.db');
const DB_PATH = process.env.NNN_DB_PATH || DEFAULT_DB;

/**
 * Detect Markdown structure that was flattened into a plain paragraph.
 *
 * `marked` only treats headings/lists as structure when they start a line. If
 * the daily task writes `Intro. ## The short version - bullet`, those tokens
 * render literally on the live page. This catches that specific failure mode
 * without banning normal, correctly line-separated Markdown.
 */
export function hasInlineMarkdownArtifacts(body) {
  if (!body || typeof body !== 'string') return false;

  // Escaped newline markers should never be visible in published article copy.
  // They usually mean the generator wrote `\n` text instead of real newlines.
  const literalNewlineTag = /\\n|(^|\s)\/n(?=\s|$)/.test(body);
  if (literalNewlineTag) return true;

  return body.split(/\n{2,}/).some((paragraph) => {
    const trimmed = paragraph.trim();
    if (!trimmed) return false;

    // `Intro. ## Heading` is the exact failure mode seen in production: the
    // heading marker is not at the start of a Markdown block, so it renders as
    // literal text.
    const headingNotAtLineStart = /\S[ \t]+#{2,6}\s+\S/.test(trimmed);

    // A flattened section can also start with a known NNN section heading but
    // keep article prose on the same line: `## What happened NASA...`. Markdown
    // renders that as a huge heading containing the whole paragraph. It is valid
    // Markdown syntactically, but invalid for our article format.
    const knownSectionHasInlineProse = /^##\s+(The short version|What happened|Why it matters)\s+\S/.test(trimmed);

    // Keep the generic marker check as a backstop for section headings glued to
    // list-like text. Prose may contain `foo - bar` or `Width * Standard`, so
    // only treat marker-looking text as a failure when it is glued to a Markdown
    // heading line.
    const headingLineContainsListMarker = /^#{2,6}\s+.*\s[-*]\s+\S/.test(trimmed);

    return headingNotAtLineStart || knownSectionHasInlineProse || headingLineContainsListMarker;
  });
}

const BOILERPLATE_PATTERNS = [
  /posts from this topic will be added to your daily email digest/i,
  /posts from this topic will be added to your homepage feed/i,
  /\b(close|share|gift)\b.{0,80}\bposts from this topic\b/i,

  // Commerce / sponsor copy should never be preserved as NNN article prose.
  /#sponsored\b/i,
  /\bsponsor(?:ed|ing)?\s+(?:this|the)\s+(?:video|post|article)\b/i,
  /\bget\s+[$£€]?\d+[\w% ]{0,24}\s+off\b/i,
  /\bvisit\s+https?:\/\/\S+\s+(?:for\s+more\s+info|to\s+get\s+started)\b/i,
  /\bverified\s+sellers?\b/i,
  /\bif you buy something from .* link, .* may earn a commission\b/i,
  /\baffiliate\s+links?\b/i,
  /\bby submitting your information, you confirm\b/i,
  /\bprivacy policy\b.{0,80}\bterms\s*&\s*conditions\b/i,
  /\bget the biggest gaming news, reviews, and releases straight to your inbox\b/i,
  /\bbreaking space news, the latest updates on rocket launches\b/i,
  /\bread a sci-fi short story every month\b/i,
  /\bScienceDaily\s+Science News from research organizations\b/i,
  /\bDate:\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+Source:\b/i,
  /\bShare:\s+Facebook\s+Twitter\s+Pinterest\s+LinkedIN\s+Email\s+FULL STORY\b/i,
  /\bWatch on YouTube\b/i,
  /\bSteam Next Fest\s+-\s+June\s+2026\s+Edition:\s+Official Trailer\b/i,
  /\bwatch as\s+[^.?!]{10,}\b(?:unpack|discuss|explain|break down|talk through)\b/i,
  /\bour regular weekly feature where we talk about the games we've been playing\b/i,
  /\bwhat have you been playing\??$/i,
  /\blike this guy[.!?…]?["')\]]?$/i,
  /\bfrom disrupt[.!?…]?["')\]]?$/i,
];

const BROKEN_TEXT_PATTERNS = [
  /\bcomes in a new handset[.!?…]?["')\]]?$/i,
  /\b[a-z]\.["')\]]?$/,
];

const AGENT_OUTPUT_PATTERNS = [
  /\bhere(?:'s| is)\s+(?:the|an?)\s+(?:article|summary|draft)\b/i,
  /\bi\s+(?:have|'ve)\s+(?:summari[sz]ed|written|created|generated|drafted)\b/i,
  /\bas an ai\b/i,
  /\bi (?:can|can't|cannot|will|would)\s+(?:help|write|summari[sz]e|draft|create|provide)\b/i,
  /\b(?:draft|final)\s+(?:article|summary):\s*$/im,
  /\bplaceholder(?:\s+text)?\b/i,
  /\bTODO:\b/i,
];

const NON_SUMMARY_META_PATTERNS = [
  /\bincluded here because\b/i,
  /\bclears\s+NNN(?:'s)?\s+(?:source|image|attribution|.*checks?)\b/i,
  /\bsource,\s*image\s+and\s+attribution\s+checks\b/i,
  /\badds?\s+a\s+fresh\s+item\s+to\s+today(?:'s)?\s+[^.?!]{0,40}\s+queue\b/i,
  /\bthe\s+point\s+of\s+this\s+digest\s+is\s+to\s+give\s+readers\b/i,
  /\boriginal\s+link\s+below\b/i,
  /^-\s*(?:source|section|published):\s+.+$/im,
  /\bthe\s+original\s+report\s+focuses\s+on\b/i,
];

export function hasAgentOutputArtifacts(text) {
  if (!text || typeof text !== 'string') return false;
  return AGENT_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasNonSummaryMetaArtifacts(text) {
  if (!text || typeof text !== 'string') return false;
  return NON_SUMMARY_META_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeReadableText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[-*>#\s]+/gm, ' ')
    .replace(/\b(summary by nerd news network|read the full article)\b.*$/gim, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function wordList(text) {
  const normalized = normalizeReadableText(text);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((word) => word.length > 3);
}

function similarity(a, b) {
  const aWords = new Set(wordList(a));
  const bWords = new Set(wordList(b));
  if (aWords.size < 10 || bWords.size < 10) return 0;

  let intersection = 0;
  for (const word of aWords) {
    if (bWords.has(word)) intersection += 1;
  }

  return intersection / (aWords.size + bWords.size - intersection);
}

function structuredBlocks(body) {
  return String(body || '')
    .split(/\n{2,}/)
    .flatMap((block) => {
      const trimmed = block.trim();
      if (!trimmed) return [];
      if (/^##\s+/.test(trimmed)) return [];
      if (/^>\s*Summary by Nerd News Network/i.test(trimmed)) return [];
      if (/^<figure\b/i.test(trimmed)) return [];
      if (/^-\s/m.test(trimmed)) {
        return trimmed
          .split(/\n+/)
          .map((line) => line.trim())
          .filter((line) => /^-\s+/.test(line))
          .map((line) => ({ type: 'bullet', text: line.replace(/^-\s+/, '').trim() }));
      }
      return [{ type: 'prose', text: trimmed }];
    })
    .filter((block) => wordList(block.text).length >= 6);
}

function bodyBlocks(body) {
  return structuredBlocks(body).map((block) => block.text);
}

function readableBlocks(body) {
  return bodyBlocks(body).filter((block) => wordList(block).length >= 10);
}

function isContainedRepeat(a, b) {
  const aNorm = normalizeReadableText(a);
  const bNorm = normalizeReadableText(b);
  if (!aNorm || !bNorm) return false;

  const shorter = aNorm.length <= bNorm.length ? aNorm : bNorm;
  const longer = aNorm.length <= bNorm.length ? bNorm : aNorm;
  if (wordList(shorter).length < 8) return false;

  return longer.includes(shorter);
}

function hasContainedBlockRepeats(body) {
  const blocks = structuredBlocks(body);
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const involvesBullet = blocks[i].type === 'bullet' || blocks[j].type === 'bullet';
      if (involvesBullet && isContainedRepeat(blocks[i].text, blocks[j].text)) return true;
    }
  }
  return false;
}

function hasBrokenTeaserFragments(body) {
  const fragments = bodyBlocks(body);
  const danglingEnding = /\b(?:a|an|the|to|of|for|with|without|and|or|but|from|by|in|on|at|as|than|that|which|who|used by|powered by|held by|back by|founded|founded just|just three years|so far|up to|based on|because|while|when|where|after|before|into|over|under|new handset)$/i;

  return fragments.some((fragment) => {
    const cleaned = fragment
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (wordList(cleaned).length < 7) return false;
    if (/[.!?…]["')\]]?$/.test(cleaned)) return false;
    return danglingEnding.test(cleaned);
  });
}

function hasEmptySections(body) {
  const blocks = String(body || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  let currentHeading = null;
  let currentHasContent = false;

  for (const block of blocks) {
    if (/^##\s+/.test(block)) {
      if (currentHeading && !currentHasContent) return true;
      currentHeading = block;
      currentHasContent = false;
      continue;
    }

    if (!currentHeading) continue;
    if (/^>\s*Summary by Nerd News Network/i.test(block) || /^<figure\b/i.test(block)) continue;
    if (wordList(block).length >= 4) currentHasContent = true;
  }

  return Boolean(currentHeading && !currentHasContent);
}

function hasMalformedAttribution(body) {
  const text = String(body || '').trim();
  const attributionBlocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => /^>\s*Summary by Nerd News Network/i.test(block));

  if (attributionBlocks.length === 0) return false;
  if (attributionBlocks.length !== 1) return true;
  return !/^>\s*Summary by Nerd News Network\. (?:(?:Read the full article at \*\*[^*]+\*\* via the links above and below\.)|(?:Read the full original at \*\*[^*]+\*\* via the source link\.)|(?:Watch the full video at \*\*[^*]+\*\* via the links above and below\.))$/i.test(attributionBlocks[0]);
}

export function hasHeadlineQualityIssues(headline) {
  if (!headline || typeof headline !== 'string') return true;
  const trimmed = headline.trim();
  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (BROKEN_TEXT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (/\bon\s+famous$/i.test(trimmed)) return true;
  return false;
}

export function hasBlurbQualityIssues(blurb) {
  if (!blurb || typeof blurb !== 'string') return true;
  const trimmed = blurb.trim();
  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (BROKEN_TEXT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (!/[.!?…]["')\]]?$/.test(trimmed)) return true;
  if (hasBrokenTeaserFragments(trimmed)) return true;
  return false;
}

export function hasReadabilityRetentionIssues(body) {
  if (!body || typeof body !== 'string') return false;

  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(body))) return true;
  if (hasEmptySections(body)) return true;
  if (hasContainedBlockRepeats(body)) return true;
  if (hasBrokenTeaserFragments(body)) return true;

  const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => normalizeReadableText(match[1]));
  if (new Set(headings).size !== headings.length) return true;

  const blocks = readableBlocks(body);
  const seenBlocks = new Set();
  for (const block of blocks) {
    const normalized = normalizeReadableText(block);
    if (seenBlocks.has(normalized)) return true;
    seenBlocks.add(normalized);
  }

  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (similarity(blocks[i], blocks[j]) >= 0.82) return true;
    }
  }

  return false;
}

export function validateArticleRows(rows) {
  const failures = [];

  for (const row of rows) {
    const combinedText = [row.headline, row.blurb, row.body].filter(Boolean).join('\n');
    if (hasAgentOutputArtifacts(combinedText)) {
      failures.push({
        slug: row.slug,
        headline: row.headline,
        reason: 'article contains visible agent output, draft wording, or production instructions',
      });
    }

    if (hasNonSummaryMetaArtifacts(combinedText)) {
      failures.push({
        slug: row.slug,
        headline: row.headline,
        reason: 'article contains non-summary meta text about NNN process, source checks, queues, or production rationale',
      });
    }

    if (hasInlineMarkdownArtifacts(row.body)) {
      failures.push({
        slug: row.slug,
        headline: row.headline,
        reason: 'body contains inline markdown markers or literal newline tags that will render as raw or malformed article text',
      });
    }

    if (hasHeadlineQualityIssues(row.headline)) {
      failures.push({
        slug: row.slug,
        headline: row.headline,
        reason: 'headline fails the quality pass because it appears to be boilerplate or a broken teaser fragment',
      });
    }

    if (Object.hasOwn(row, 'blurb') && hasBlurbQualityIssues(row.blurb)) {
      failures.push({
        slug: row.slug,
        headline: row.headline,
        reason: 'blurb fails the quality pass because it contains ad boilerplate or a broken teaser sentence',
      });
    }

    if (hasMalformedAttribution(row.body)) {
      failures.push({
        slug: row.slug,
        headline: row.headline,
        reason: 'body has malformed Nerd News Network attribution footer',
      });
    }

    if (hasReadabilityRetentionIssues(row.body)) {
      failures.push({
        slug: row.slug,
        headline: row.headline,
        reason: 'body fails the readability/retention pass because it repeats sections, duplicates prose, or includes publisher boilerplate',
      });
    }
  }

  return failures;
}

async function validateAndScoreImages(db, rows) {
  const findings = [];
  for (const row of rows) {
    const result = await scoreArticleImage(row, { root: join(__dirname, '..'), allowRemote: true, role: 'hero' });
    if (result.status === 'missing' || result.status === 'reject' || result.status === 'weak') {
      findings.push({
        slug: row.slug,
        headline: row.headline,
        reason: `image is ${result.status}: ${result.score}/100 — ${result.reason}`,
        fatal: result.status === 'missing' || result.status === 'reject',
      });
    }
  }
  return findings;
}

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`[validate:articles] Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  ensureImageQualityColumns(db);
  const rows = db.prepare('SELECT id, slug, headline, blurb, body, hero_image, thumbnail_image, source_url FROM articles ORDER BY published_at DESC, id DESC').all();
  const contentFailures = validateArticleRows(rows);
  const imageFindings = await validateAndScoreImages(db, rows);
  const strictImages = process.argv.includes('--strict-images');
  const failures = [
    ...contentFailures,
    ...(strictImages ? imageFindings.filter((finding) => finding.fatal) : []),
  ];

  if (failures.length > 0) {
    console.error(`[validate:articles] Found ${failures.length} article validation failure(s):`);
    for (const failure of failures) {
      console.error(`- ${failure.slug}: ${failure.reason}`);
      console.error(`  ${failure.headline}`);
    }
    process.exit(1);
  }

  if (imageFindings.length > 0) {
    const fatalImages = imageFindings.filter((finding) => finding.fatal).length;
    console.warn(
      `[validate:articles] Image quality warnings: ${imageFindings.length} article(s), ${fatalImages} missing/rejected. ` +
        'They remain published but are discounted in feed ranking.'
    );
    for (const finding of imageFindings.slice(0, 40)) {
      console.warn(`- ${finding.slug}: ${finding.reason}`);
      console.warn(`  ${finding.headline}`);
    }
    if (imageFindings.length > 40) {
      console.warn(`- …and ${imageFindings.length - 40} more image warning(s).`);
    }
  }

  console.log(`[validate:articles] OK — ${rows.length} article(s) checked.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[validate:articles] ${err.stack || err.message}`);
    process.exit(1);
  });
}
