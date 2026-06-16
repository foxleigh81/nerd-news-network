/** Site-wide configuration and constants. */

export const SITE = {
  name: 'Nerd News Network',
  shortName: 'NNN',
  tagline: 'Smart news for curious minds.',
  description:
    'Nerd News Network aggregates and summarises the day’s most important stories in technology, gaming, science, space, AI and culture — clearly, quickly and with credit to the original source.',
  // Used for absolute URLs in metadata, sitemaps and social cards.
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://nerdnewsnetwork.com',
  locale: 'en_GB',
  // Default social handle (used for Twitter/X cards).
  social: {
    twitter: '@nerdnewsnet',
  },
} as const;

/**
 * Advertising feature flag. Set NEXT_PUBLIC_ADS_ENABLED=true to render ad
 * placements (real AdSense units when a client id + slot are configured,
 * labelled placeholders otherwise). When unset/false, no ad space renders at
 * all and the feed shows a full set of articles instead of dropping one for an
 * in-grid ad.
 */
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';

/** AdSense ad-unit slot ids per placement (configured via env). */
export const AD_SLOTS = {
  leader: process.env.NEXT_PUBLIC_AD_SLOT_LEADER, // feed leaderboard (top)
  infeed: process.env.NEXT_PUBLIC_AD_SLOT_INFEED, // in-grid unit replacing a feed card
  articleTop: process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_TOP,
  articleBottom: process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_BOTTOM,
  sidebarTop: process.env.NEXT_PUBLIC_AD_SLOT_SIDEBAR, // existing sidebar slot id
  sidebarBottom: process.env.NEXT_PUBLIC_AD_SLOT_SIDEBAR_BOTTOM,
} as const;

/** Which feed grid position (0-based, within the post-lead grid) becomes an ad. */
export const FEED_AD_POSITION = 4;

/** Articles shown per page across feeds (home, archive month, category). */
export const PER_PAGE = 12;

/** Window used when falling back to "recent" related articles. */
export const RELATED_WINDOW_MONTHS = 3;

/** How many related articles to show in the article sidebar. */
export const RELATED_LIMIT = 5;
