#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
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
];

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

function readableBlocks(body) {
  return String(body || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => {
      if (!block) return false;
      if (/^##\s+/.test(block)) return false;
      if (/^>\s*Summary by Nerd News Network/i.test(block)) return false;
      if (/^<figure\b/i.test(block)) return false;
      if (/^-\s/.test(block)) return false;
      return wordList(block).length >= 10;
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

export function hasReadabilityRetentionIssues(body) {
  if (!body || typeof body !== 'string') return false;

  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(body))) return true;
  if (hasEmptySections(body)) return true;

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
    if (hasInlineMarkdownArtifacts(row.body)) {
      failures.push({
        slug: row.slug,
        headline: row.headline,
        reason: 'body contains inline markdown markers or literal newline tags that will render as raw or malformed article text',
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

function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`[validate:articles] Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.prepare('SELECT slug, headline, body FROM articles ORDER BY published_at DESC, id DESC').all();
  const failures = validateArticleRows(rows);

  if (failures.length > 0) {
    console.error(`[validate:articles] Found ${failures.length} article validation failure(s):`);
    for (const failure of failures) {
      console.error(`- ${failure.slug}: ${failure.reason}`);
      console.error(`  ${failure.headline}`);
    }
    process.exit(1);
  }

  console.log(`[validate:articles] OK — ${rows.length} article(s) checked.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
