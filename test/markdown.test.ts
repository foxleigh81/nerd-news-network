import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown';

describe('renderMarkdown — basic conversion', () => {
  it('converts markdown to HTML', () => {
    const html = renderMarkdown('Hello **world**');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('<p>');
  });

  it('keeps allowed headings (h2)', () => {
    expect(renderMarkdown('## Sub-heading')).toContain('<h2>Sub-heading</h2>');
  });
});

describe('renderMarkdown — sanitisation (security)', () => {
  it('strips <script> tags and their contents', () => {
    const html = renderMarkdown('Before <script>alert(1)</script> after');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('alert(1)');
  });

  it('removes javascript: links', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('strips the src from iframes on untrusted hosts (leaving an inert tag)', () => {
    const html = renderMarkdown('<iframe src="https://evil.example.com/x"></iframe>');
    // sanitize-html keeps the now-empty, harmless tag but removes the disallowed
    // source, so nothing from the untrusted host can load.
    expect(html).not.toContain('evil.example.com');
    expect(html).not.toMatch(/<iframe[^>]*\ssrc=/i);
  });

  it('keeps iframes from trusted, privacy-respecting video hosts', () => {
    const html = renderMarkdown(
      '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>'
    );
    expect(html).toMatch(/<iframe/i);
    expect(html).toContain('https://www.youtube-nocookie.com/embed/abc123');
  });
});

describe('renderMarkdown — link & image hardening', () => {
  it('opens external links safely in a new tab', () => {
    const html = renderMarkdown('[example](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('forces lazy-loading on images', () => {
    const html = renderMarkdown('![alt text](https://example.com/pic.jpg)');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });
});
