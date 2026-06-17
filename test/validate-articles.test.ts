import { describe, expect, it } from 'vitest';
import { hasInlineMarkdownArtifacts, validateArticleRows } from '../scripts/validate-articles.mjs';

describe('article body validation', () => {
  it('flags markdown headings and bullets that have been flattened into a paragraph', () => {
    const body = "Intro sentence. ## The short version - First bullet - Second bullet ## Why it matters More text.";

    expect(hasInlineMarkdownArtifacts(body)).toBe(true);
  });

  it('flags known section headings that keep article prose on the heading line', () => {
    const body = [
      'Intro sentence.',
      '',
      '## The short version First bullet sentence continues on the same line.',
      '',
      '## What happened More article prose is glued to the heading.',
      '',
      '## Why it matters Science readers should care because this sentence is content, not a heading.',
    ].join('\n');

    expect(hasInlineMarkdownArtifacts(body)).toBe(true);
  });

  it('accepts properly separated markdown sections and lists', () => {
    const body = [
      'Intro sentence.',
      '',
      '## The short version',
      '',
      '- First bullet',
      '- Second bullet',
      '',
      '## What happened',
      '',
      'Article prose starts after the heading.',
      '',
      '## Why it matters',
      '',
      'More text.',
    ].join('\n');

    expect(hasInlineMarkdownArtifacts(body)).toBe(false);
  });

  it('does not mistake prose hyphens or asterisks for flattened Markdown lists', () => {
    const body = 'Steam Next Fest - June 2026 Edition is live. Width * Standard Wide Links Standard Orange is source boilerplate, not an article list.';

    expect(hasInlineMarkdownArtifacts(body)).toBe(false);
  });

  it('reports the affected slug when article bodies contain flattened markdown', () => {
    const failures = validateArticleRows([
      {
        slug: 'quantum-lab-aboard-space-station-gets-chilly-upgrade',
        headline: "Quantum lab aboard space station gets 'chilly' upgrade",
        body: "Intro sentence. ## The short version - First bullet ## Why it matters More text.",
      },
    ]);

    expect(failures).toEqual([
      expect.objectContaining({
        slug: 'quantum-lab-aboard-space-station-gets-chilly-upgrade',
        reason: expect.stringContaining('inline markdown'),
      }),
    ]);
  });
});
