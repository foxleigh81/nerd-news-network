#!/usr/bin/env node
import Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DEFAULT_DB = join(ROOT, 'data', 'nnn.db');
const DEFAULT_OUT = join(ROOT, 'out');

const AGENT_OUTPUT_PATTERNS = [
  /\bhere(?:'s| is)\s+(?:the|an?)\s+(?:article|summary|draft)\b/i,
  /\bi\s+(?:have|ve)\s+(?:summari[sz]ed|written|created|generated|drafted)\b/i,
  /\bas an ai\b/i,
  /\bi (?:can|can't|cannot|will|would)\s+(?:help|write|summari[sz]e|draft|create|provide)\b/i,
  /\b(?:draft|final)\s+(?:article|summary):\s*$/im,
  /\bplaceholder(?:\s+text)?\b/i,
  /\bTODO:\b/i,
];

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function articlePageExists(outDir, slug) {
  return existsSync(join(outDir, 'article', `${slug}.html`)) || existsSync(join(outDir, 'article', slug, 'index.html'));
}

function htmlToVisibleText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function hrefsFromHtml(html) {
  return [...String(html || '').matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
}

export function validateRenderedOutput({ outDir = DEFAULT_OUT, articleRows = [] } = {}) {
  const failures = [];

  if (!existsSync(outDir)) {
    return [{ kind: 'missing-output-dir', path: outDir, message: `Output directory not found: ${outDir}` }];
  }

  for (const row of articleRows) {
    if (!row?.slug) continue;
    if (!articlePageExists(outDir, row.slug)) {
      failures.push({
        kind: 'unrendered-db-article',
        slug: row.slug,
        headline: row.headline,
        message: `Database article has no rendered page: /article/${row.slug}`,
      });
    }
  }

  const outputFiles = walkFiles(outDir).filter((path) => /\.(html|xml|txt)$/.test(path));
  for (const path of outputFiles) {
    const html = readFileSync(path, 'utf8');
    const rel = relative(outDir, path);

    for (const href of hrefsFromHtml(html)) {
      const cleanHref = href.split('#')[0].split('?')[0].replace(/\/$/, '');
      if (!cleanHref.startsWith('/article/')) continue;
      const slug = cleanHref.slice('/article/'.length);
      if (!slug) continue;
      if (!articlePageExists(outDir, slug)) {
        failures.push({
          kind: 'missing-article-page',
          path: rel,
          href,
          message: `Rendered output links to a missing article page: ${href}`,
        });
      }
    }

    const visibleText = htmlToVisibleText(html);
    for (const pattern of AGENT_OUTPUT_PATTERNS) {
      if (pattern.test(visibleText)) {
        failures.push({
          kind: 'agent-output-artifact',
          path: rel,
          pattern: String(pattern),
          message: `Rendered output contains visible agent/draft wording in ${rel}`,
        });
        break;
      }
    }
  }

  return failures;
}

function loadArticleRows(dbPath) {
  if (!existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT slug, headline FROM articles ORDER BY id').all();
  } finally {
    db.close();
  }
}

function main() {
  const outDir = process.env.NNN_OUT_DIR || DEFAULT_OUT;
  const dbPath = process.env.NNN_DB_PATH || DEFAULT_DB;
  const articleRows = loadArticleRows(dbPath);
  const failures = validateRenderedOutput({ outDir, articleRows });

  if (failures.length) {
    console.error(`[validate:output] Found ${failures.length} rendered output failure(s):`);
    for (const failure of failures.slice(0, 80)) {
      const subject = failure.href || failure.slug || failure.path || failure.kind;
      console.error(`- ${failure.kind}: ${subject}`);
      console.error(`  ${failure.message}`);
    }
    if (failures.length > 80) console.error(`- …and ${failures.length - 80} more failure(s).`);
    process.exit(1);
  }

  console.log(`[validate:output] OK — ${articleRows.length} DB article(s) and rendered article links checked.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
