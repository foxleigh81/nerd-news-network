import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { validateRenderedOutput } from '../scripts/validate-output.mjs';

describe('rendered output validation', () => {
  function prepareCrawlerFiles(outDir: string) {
    writeFileSync(join(outDir, 'ads.txt'), 'google.com, pub-2552028648847975, DIRECT, f08c47fec0942fa0\n');
    writeFileSync(
      join(outDir, 'robots.txt'),
      'User-Agent: *\nAllow: /\n\nHost: www.nerdnewsnetwork.com\nSitemap: https://www.nerdnewsnetwork.com/sitemap.xml\n',
    );
  }

  it('fails when an internal article link points at a missing static page', () => {
    const outDir = join(tmpdir(), `nnn-output-link-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    prepareCrawlerFiles(outDir);
    writeFileSync(join(outDir, 'index.html'), '<a href="/article/missing-story">Missing story</a>');

    const failures = validateRenderedOutput({ outDir, articleRows: [] });

    expect(failures).toContainEqual(expect.objectContaining({
      kind: 'missing-article-page',
      href: '/article/missing-story',
    }));
  });

  it('fails when a database article does not have a rendered static article page', () => {
    const outDir = join(tmpdir(), `nnn-output-db-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    prepareCrawlerFiles(outDir);
    writeFileSync(join(outDir, 'index.html'), '<main>No article page exists.</main>');

    const failures = validateRenderedOutput({
      outDir,
      articleRows: [{ slug: 'existing-db-story', headline: 'Existing DB Story' }],
    });

    expect(failures).toContainEqual(expect.objectContaining({
      kind: 'unrendered-db-article',
      slug: 'existing-db-story',
    }));
  });

  it('fails when rendered pages contain visible agent notes or instructions', () => {
    const outDir = join(tmpdir(), `nnn-output-agent-${Date.now()}`);
    mkdirSync(join(outDir, 'article'), { recursive: true });
    prepareCrawlerFiles(outDir);
    writeFileSync(join(outDir, 'article', 'bad.html'), '<article>Here is the article draft you requested. I have summarized the source below.</article>');

    const failures = validateRenderedOutput({ outDir, articleRows: [{ slug: 'bad', headline: 'Bad Article' }] });

    expect(failures).toContainEqual(expect.objectContaining({
      kind: 'agent-output-artifact',
      path: expect.stringContaining('bad.html'),
    }));
  });

  it('fails when AdSense ads.txt is missing from the static output', () => {
    const outDir = join(tmpdir(), `nnn-output-ads-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, 'robots.txt'),
      'User-Agent: *\nAllow: /\n\nHost: www.nerdnewsnetwork.com\nSitemap: https://www.nerdnewsnetwork.com/sitemap.xml\n',
    );
    writeFileSync(join(outDir, 'index.html'), '<main>OK</main>');

    const failures = validateRenderedOutput({ outDir, articleRows: [] });

    expect(failures).toContainEqual(expect.objectContaining({ kind: 'missing-ads-txt' }));
  });

  it('fails when robots.txt advertises a URL-style Host value', () => {
    const outDir = join(tmpdir(), `nnn-output-robots-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'ads.txt'), 'google.com, pub-2552028648847975, DIRECT, f08c47fec0942fa0\n');
    writeFileSync(
      join(outDir, 'robots.txt'),
      'User-Agent: *\nAllow: /\n\nHost: https://nerdnewsnetwork.com\nSitemap: https://nerdnewsnetwork.com/sitemap.xml\n',
    );
    writeFileSync(join(outDir, 'index.html'), '<main>OK</main>');

    const failures = validateRenderedOutput({ outDir, articleRows: [] });

    expect(failures).toContainEqual(expect.objectContaining({ kind: 'invalid-robots-host' }));
    expect(failures).toContainEqual(expect.objectContaining({ kind: 'unexpected-sitemap-host' }));
  });
});
