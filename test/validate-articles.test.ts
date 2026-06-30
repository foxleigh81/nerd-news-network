import { describe, expect, it } from 'vitest';
import { hasBlurbQualityIssues, hasFinalBossBollocks, hasHeadlineQualityIssues, hasInlineMarkdownArtifacts, hasNonSummaryMetaArtifacts, hasReadabilityRetentionIssues, validateArticleRows } from '../scripts/validate-articles.mjs';

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

  it('flags ad-copy contamination from sponsored video descriptions', () => {
    const body = [
      'If you want to skip the hassle of researching, buying, and building a gaming PC for yourself, buy one from one of Jawa’s Verified Sellers! Visit https://jawa.link/TechLinkedJune26 to get started.',
      '',
      '## The short version',
      '',
      '- Shadow AI tools can create unmanaged security and compliance risks inside companies.',
      '',
      '## Context',
      '',
      'The actual story should explain the risk without preserving the creator’s sponsor read.',
    ].join('\n');

    expect(hasReadabilityRetentionIssues(body)).toBe(true);
  });

  it('flags publisher newsletter and affiliate blocks copied into the article', () => {
    const body = [
      'The new smart light module expands a platform into ordinary switches.',
      '',
      '## The short version',
      '',
      '- If you buy something from a Verge link, Vox Media may earn a commission.',
      '- Smart lighting company Philips Hue has launched its first wired wall modules.',
      '',
      '## Context',
      '',
      'Readers need the product news, not the publisher commerce disclosure.',
    ].join('\n');

    expect(hasReadabilityRetentionIssues(body)).toBe(true);
  });

  it('flags copied bullets that repeat the intro instead of adding a digest', () => {
    const body = [
      'Smart lighting company Philips Hue has launched its first wired wall modules. Installed behind existing wall switches, the new devices bring non-smart lights into the Hue ecosystem for the first time.',
      '',
      '## The short version',
      '',
      '- Smart lighting company Philips Hue has launched its first wired wall modules.',
      '- Installed behind existing wall switches, the new devices bring non-smart lights into the Hue ecosystem for the first time.',
      '',
      '## Context',
      '',
      'The useful context belongs here after the non-repeated digest.',
    ].join('\n');

    expect(hasReadabilityRetentionIssues(body)).toBe(true);
  });

  it('flags broken teaser fragments that end mid-sentence', () => {
    const body = [
      'Telegram argues India should block specific content, not an entire platform used by',
      '',
      '## The short version',
      '',
      '- Telegram argues India should block specific content, not an entire platform used by',
      '- A temporary ban pushed users toward VPNs and competing messaging apps.',
      '',
      '## What happened',
      '',
      'India temporarily cut off access to Telegram over exam-fraud concerns.',
    ].join('\n');

    expect(hasReadabilityRetentionIssues(body)).toBe(true);
  });

  it('flags broken or ad-contaminated card blurbs', () => {
    expect(hasBlurbQualityIssues('Owners of affected iPhones can stop checking for patches now: the fix for this SecureROM bug comes in a new handset')).toBe(true);
    expect(hasBlurbQualityIssues('Owners of affected iPhones can stop checking for patches now: the fix for this SecureROM bug comes in a new handset.')).toBe(true);
    expect(hasBlurbQualityIssues('A stunningly concentrated galaxy cluster is challenging cosmic evolution theories, a team led by researchers f.')).toBe(true);
    expect(hasBlurbQualityIssues('The study suggests that the very shape of space-time may protect the cosmological constant from disrupt.')).toBe(true);
    expect(hasBlurbQualityIssues('Watch as Equity hosts unpack what the ban means for developers building on Anthropic\'s platform.')).toBe(true);
    expect(hasBlurbQualityIssues('Our regular weekly feature where we talk about the games we\'ve been playing so you return in kind. What have you been playing?')).toBe(true);
    expect(hasBlurbQualityIssues('People seem to love it or seem to be, you know, a little iffy on it, like this guy.')).toBe(true);
    expect(hasBlurbQualityIssues('If you want a gaming PC, buy one from a Jawa Verified Seller and visit https://jawa.link/TechLinkedJune26 to get started.')).toBe(true);
    expect(hasBlurbQualityIssues('A security research team published a BootROM exploit affecting older iPhones, which means the vulnerable hardware cannot be fixed by a normal software update.')).toBe(false);
  });

  it('flags headline fragments that end mid-phrase', () => {
    expect(hasHeadlineQualityIssues('James Webb Space Telescope finds a salty surprise on famous')).toBe(true);
    expect(hasHeadlineQualityIssues('New JWST images open up the cosmic noon frontier')).toBe(false);
  });

  it('flags visible agent output and draft instructions in article text', () => {
    const failures = validateArticleRows([
      {
        slug: 'agent-draft',
        headline: 'A normal headline about robots',
        blurb: 'Researchers showed a robot control system that reacts quickly enough for real-time industrial work.',
        body: [
          'Here is the article draft you requested. I have summarized the source below for the reader.',
          '',
          '## What happened',
          '',
          'The actual story should not contain assistant narration or production notes.',
        ].join('\n'),
      },
    ]);

    expect(failures).toContainEqual(expect.objectContaining({
      slug: 'agent-draft',
      reason: expect.stringContaining('agent'),
    }));
  });

  it('flags visible NNN process rationale that is not article summary', () => {
    const contaminated = [
      'The original report focuses on Climate change boosts soybean production but worsens bean quality.',
      'It adds a fresh item to today\'s science queue and is included here because it clears NNN\'s source, image and attribution checks.',
      'The point of this digest is to give readers the shape of the story before they decide whether to open the source piece.',
      '',
      '## The short version',
      '',
      '- Source: Phys.org.',
      '- Section: Science.',
      '- Published: 2026-06-21.',
      '- Original link below.',
    ].join('\n');

    expect(hasNonSummaryMetaArtifacts(contaminated)).toBe(true);

    const failures = validateArticleRows([
      {
        slug: 'process-rationale-leak',
        headline: 'Climate change boosts soybean production but worsens bean quality',
        blurb: 'A study analyzed how carbon dioxide, high temperatures and drought affect soybean quality.',
        body: contaminated,
      },
    ]);

    expect(failures).toContainEqual(expect.objectContaining({
      slug: 'process-rationale-leak',
      reason: expect.stringContaining('non-summary meta text'),
    }));
  });

  it('flags generic final-boss bollocks that is not an article summary', () => {
    const body = [
      'Phys.org reports that a study analyzed climate pressure on soybean quality.',
      '',
      '## The short version',
      '',
      '- Climate change boosts soybean production but worsens bean quality.',
      '- This affects how researchers interpret new evidence and open questions.',
      '',
      '## What happened',
      '',
      'The source article gives the main context behind this science development and the details readers need to understand the update.',
      '',
      '## Why it matters',
      '',
      'The practical science question is whether the result changes what researchers can test next or explain with confidence.',
      '',
      '> Summary by Nerd News Network. Read the full article at **Phys.org** via the links above and below.',
    ].join('\n');

    expect(hasFinalBossBollocks(body)).toBe(true);

    const failures = validateArticleRows([
      {
        slug: 'generic-not-summary',
        headline: 'Climate change boosts soybean production but worsens bean quality',
        blurb: 'A study analyzed how carbon dioxide, high temperatures and drought affect soybean quality.',
        body,
      },
    ]);

    expect(failures).toContainEqual(expect.objectContaining({
      slug: 'generic-not-summary',
      reason: expect.stringContaining('final-boss reader-quality'),
    }));
  });

  it('allows concise article summaries that mention the source without exposing NNN process', () => {
    const body = [
      'Phys.org reports that a study analyzed how carbon dioxide, high temperatures and drought affect soybean quality.',
      '',
      '## The short version',
      '',
      '- Climate change can raise soybean output while reducing protein and oil quality.',
      '- Heat, drought and extra carbon dioxide affect different parts of the crop in different ways.',
      '',
      '## What happened',
      '',
      'Researchers compared soybeans under higher carbon dioxide, heat and drought conditions, then measured how yield gains came with lower nutritional and processing quality.',
      '',
      '## Why it matters',
      '',
      'The finding matters because higher crop volume does not automatically mean a better food supply if the beans become less nutritious or less useful for producers.',
      '',
      '> Summary by Nerd News Network. Read the full article at **Phys.org** via the links above and below.',
    ].join('\n');

    expect(hasNonSummaryMetaArtifacts(body)).toBe(false);
    expect(validateArticleRows([
      {
        slug: 'clean-summary',
        headline: 'Climate change boosts soybean production but worsens bean quality',
        blurb: 'A study analyzed how carbon dioxide, high temperatures and drought affect soybean quality.',
        body,
      },
    ])).toEqual([]);
  });

  it('flags duplicated publisher promo bullets shared by unrelated articles', () => {
    const failures = validateArticleRows([
      {
        slug: 'ai-coding-startup',
        headline: 'AI coding startup raises a large Series A',
        source_name: 'Example Source',
        created_at: '2026-06-30T08:00:00Z',
        blurb: 'A coding startup raised new money for enterprise software tools.',
        body: [
          'A coding startup raised new money for enterprise software tools.',
          '',
          '## The short version',
          '',
          '- A publisher promo block about executive events was copied into the article summary.',
          '- A second unrelated marketing sentence also appeared in the generated bullet list.',
          '- The startup says enterprise controls are part of the product.',
          '',
          '## Why it matters',
          '',
          'The actual story is about enterprise AI coding tools, not TechCrunch event marketing.',
        ].join('\n'),
      },
      {
        slug: 'gemini-images',
        headline: 'Gemini personalized images reach free users',
        source_name: 'Example Source',
        created_at: '2026-06-30T08:00:00Z',
        blurb: 'Gemini can now use connected Google apps to personalize image prompts for free users.',
        body: [
          'Gemini can now use connected Google apps to personalize image prompts for free users.',
          '',
          '## The short version',
          '',
          '- A publisher promo block about executive events was copied into the article summary.',
          '- A second unrelated marketing sentence also appeared in the generated bullet list.',
          '- Users can opt in before Gemini accesses personal app data.',
          '',
          '## Why it matters',
          '',
          'The actual story is about personalized AI image generation, not TechCrunch event marketing.',
        ].join('\n'),
      },
    ]);

    expect(failures).toContainEqual(expect.objectContaining({
      slug: 'ai-coding-startup',
      reason: expect.stringContaining('shares multiple bullet points'),
    }));
    expect(failures).toContainEqual(expect.objectContaining({
      slug: 'gemini-images',
      reason: expect.stringContaining('shares multiple bullet points'),
    }));
  });

  it('flags source-page boilerplate copied into article bullets', () => {
    const failures = validateArticleRows([
      {
        slug: 'science-daily-boilerplate',
        headline: 'New study explores disease spread',
        blurb: 'Researchers found a disease can spread silently between animals in ways that merit closer monitoring.',
        body: [
          'Researchers found a disease can spread silently between animals.',
          '',
          '## The short version',
          '',
          '- New study explores potential cross-species spread of chronic wasting disease | ScienceDaily Science News from research organizations.',
          '- Date: June 16, 2026 Source: University of Calgary Summary: A new study found infectious prions in animals without symptoms.',
          '- Share: Facebook Twitter Pinterest LinkedIN Email FULL STORY Scientists uncovered a hidden side of the disease.',
          '',
          '## Why it matters',
          '',
          'Readers need the science finding, not copied publisher navigation and sharing furniture.',
        ].join('\n'),
      },
    ]);

    expect(failures).toContainEqual(expect.objectContaining({
      slug: 'science-daily-boilerplate',
      reason: expect.stringContaining('boilerplate'),
    }));
  });

  it('flags incomplete Nerd News Network attribution footers', () => {
    const failures = validateArticleRows([
      {
        slug: 'broken-footer',
        headline: 'A normal headline about space research',
        blurb: 'Researchers proposed safer lunar construction rules for future moon bases.',
        body: [
          'Researchers proposed safer lunar construction rules for future moon bases.',
          '',
          '## Why it matters',
          '',
          'A consistent standard would help crews build habitats without repeating avoidable mistakes.',
          '',
          '> Summary by Nerd News Network. Read the full article at',
        ].join('\n'),
      },
    ]);

    expect(failures).toContainEqual(expect.objectContaining({
      slug: 'broken-footer',
      reason: expect.stringContaining('attribution'),
    }));
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
