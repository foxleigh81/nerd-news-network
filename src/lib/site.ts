/** Site-wide configuration and constants. */

export const SITE = {
  name: 'Nerd News Network',
  shortName: 'NNN',
  tagline: 'Smart news for curious minds.',
  description:
    'Nerd News Network aggregates and summarises the day’s most important stories in technology, gaming, science, space, AI and culture — clearly, quickly and with credit to the original source.',
  // Used for absolute URLs in metadata, sitemaps and social cards.
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://nerdnews.network',
  locale: 'en_GB',
  // Default social handle (used for Twitter/X cards).
  social: {
    twitter: '@nerdnewsnet',
  },
} as const;

/** Articles shown per page across feeds (home, archive month, category). */
export const PER_PAGE = 12;

/** Window used when falling back to "recent" related articles. */
export const RELATED_WINDOW_MONTHS = 3;

/** How many related articles to show in the article sidebar. */
export const RELATED_LIMIT = 5;
