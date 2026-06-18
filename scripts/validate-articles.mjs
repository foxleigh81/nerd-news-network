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
    console.error(`[validate:articles] Found ${failures.length} article formatting failure(s):`);
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
