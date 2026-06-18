import { describe, expect, it } from 'vitest';
import { hasInlineMarkdownArtifacts, hasReadabilityRetentionIssues, validateArticleRows } from '../scripts/validate-articles.mjs';

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

  it('flags literal newline escape tags in article prose', () => {
    const body = 'Intro paragraph.\\n\\n## What happened\\nThis should have been real line breaks, not visible newline tags.';

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

  it('flags repeated article sections that make the story tedious to read', () => {
    const body = [
      'A new smart-home standard update tries to make device setup less painful.',
      '',
      '## What changed',
      '',
      'The update adds NFC commissioning, shared fabric controls and cleaner onboarding so households can add devices without digging through confusing setup menus.',
      '',
      '## Why it matters',
      '',
      'The update adds NFC commissioning, shared fabric controls and cleaner onboarding so households can add devices without digging through confusing setup menus.',
      '',
      '> Summary by Nerd News Network. Read the full article at **Example** via the links above and below.',
    ].join('\n');

    expect(hasReadabilityRetentionIssues(body)).toBe(true);
  });

  it('flags article sections that have a heading but no readable content', () => {
    const body = [
      'Intro paragraph sets up the story.',
      '',
      '## What happened',
      '',
      '## Why it matters',
      '',
      'The useful context finally appears here.',
    ].join('\n');

    expect(hasReadabilityRetentionIssues(body)).toBe(true);
  });

  it('flags publisher boilerplate contamination that repeats topic subscription copy', () => {
    const body = [
      'The company announced a useful product update today.',
      '',
      '## What happened',
      '',
      'Tech Close Tech Posts from this topic will be added to your daily email digest and your homepage feed.',
      '',
      '## Context',
      '',
      'The actual story is buried under copied website navigation text.',
    ].join('\n');

    expect(hasReadabilityRetentionIssues(body)).toBe(true);
  });

  it('accepts concise articles where bullets briefly reinforce the intro without duplicating sections', () => {
    const body = [
      'Matter 1.6 adds NFC setup and joint-fabric controls for smart-home devices.',
      '',
      '## The short version',
      '',
      '- NFC pairing should reduce setup friction.',
      '- Joint fabrics make shared households easier to manage.',
      '',
      '## What changed',
      '',
      'The spec now gives device makers a standard way to handle tap-to-pair setup and multi-admin control.',
      '',
      '## Why it matters',
      '',
      'Less brittle onboarding means fewer users abandon otherwise useful smart-home gear during installation.',
    ].join('\n');

    expect(hasReadabilityRetentionIssues(body)).toBe(false);
  });

  it('reports readability failures from the article rows validator', () => {
    const failures = validateArticleRows([
      {
        slug: 'matter-repeat',
        headline: 'Matter update repeats itself',
        body: [
          'Matter has a new setup flow.',
          '',
          '## What changed',
          '',
          'The update adds NFC commissioning, shared fabric controls and cleaner onboarding so households can add devices without digging through confusing setup menus.',
          '',
          '## Why it matters',
          '',
          'The update adds NFC commissioning, shared fabric controls and cleaner onboarding so households can add devices without digging through confusing setup menus.',
        ].join('\n'),
      },
    ]);

    expect(failures).toEqual([
      expect.objectContaining({
        slug: 'matter-repeat',
        reason: expect.stringContaining('readability'),
      }),
    ]);
  });
});
