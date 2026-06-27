# Nerd News Network

A statically generated news-aggregation site for technology, gaming, science,
space, AI and culture. Content lives in a SQLite database (populated daily by a
separate AI task); the site is built to fully static HTML/CSS/JS for fast,
cheap, secure hosting anywhere.

- **Front page** — 12 stories from the current calendar month, with a large lead
  story and pagination for older stories within the month.
- **Archive** — browse every previous month and year.
- **Article page** — 60 / 40 two-column layout: hero + headline + byline (with
  source credit) + content on the left; related stories + ad slot on the right;
  social sharing and a closing source credit.
- **Sections** — one page per category, paginated.
- Accessibility and performance are first-class: semantic landmarks, skip link,
  keyboard-friendly nav, `prefers-reduced-motion` support, reserved ad space (no
  layout shift), lazy images, self-hosted fonts. Audited with axe-core
  (0 violations) on every page type.

## Tech stack

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| Framework      | Next.js 15 (App Router), `output: 'export'`       |
| Language       | TypeScript                                         |
| Data           | SQLite via `better-sqlite3` (read at build time)  |
| Styling        | CSS Modules + design tokens (no runtime CSS-in-JS)|
| Type system    | Archivo (display) · Newsreader (body) · IBM Plex Mono (meta) |
| Content body   | Markdown → sanitised HTML (`marked` + `sanitize-html`) |
| Images         | Host-agnostic `<img>` with reserved dimensions    |
| Ads            | Google AdSense-ready slots (placeholders until configured) |

## Getting started

```bash
npm install
npm run dev        # seeds the local mock DB if empty, then starts the dev server
```

Local development uses a **separate, git-ignored mock database** (`data/nnn.dev.db`)
seeded with the sample content in `scripts/seed.mjs`, so dev never reads or
mutates the committed production database (`data/nnn.db`, which the daily task
owns). Production builds (`next build`) read `data/nnn.db`. Override either with
the `NNN_DB_PATH` env var.

Build the static site:

```bash
npm run build      # regenerates assets/schema, exports to ./out, then validates articles
npm run start      # serve the ./out directory locally
```

The export in `./out` is a plain static site — deploy it to Netlify, Cloudflare
Pages, GitHub Pages, S3/CloudFront, or any static host.

### Scripts

| Script               | Description                                                    |
| -------------------- | ------------------------------------------------------------- |
| `npm run dev`        | Seed the mock DB (`nnn.dev.db`) if empty, then `next dev`     |
| `npm run build`      | Build logo assets, ensure prod DB schema, `next build` export, then validate article formatting |
| `npm run validate:articles` | Fail if article Markdown would render raw/flattened on the site |
| `npm run seed`       | Seed the **mock** DB (`nnn.dev.db`) only if it is empty       |
| `npm run seed:reset` | Wipe and re-seed the **mock** DB with the sample data set     |
| `npm run images`     | Download real lead images from each source (placeholders only)|
| `npm run images:force` | Re-download lead images for every article                   |
| `npm run logo`       | Regenerate web logo/icon/OG assets from the master PNG        |

## Database — the daily-task data contract

The database lives at `data/nnn.db`. The schema is created/owned by
`scripts/seed.mjs` (run automatically on build); the **daily AI task only needs
to INSERT/UPDATE rows** — it should never need to change the schema. Dates are
**ISO 8601 UTC** strings, e.g. `2026-06-14T09:30:00Z`.

> **Daily candidate rule (site-wide).** Each daily run builds a deterministic,
> ranked candidate queue from the curated written sources and YouTube channels.
> It processes candidates in batches of `NNN_CANDIDATE_BATCH_SIZE` (default 60),
> highest weighted/scored first, until more than 15 articles have cleared the
> validation gate (`NNN_MIN_SUCCESS_ARTICLES`, default 16). It publishes at most
> `NNN_MAX_PUBLISHED_ARTICLES` (default 25) and discards the rest. Quotas are
> never padded with filler; if the candidate pool is exhausted before the success
> gate, the run fails and reports diagnostics.

### `categories`

| Column        | Notes                                                              |
| ------------- | ------------------------------------------------------------------ |
| `id`          | PK                                                                 |
| `slug`        | URL slug, unique (e.g. `technology`)                               |
| `name`        | Display name (e.g. `Technology`)                                   |
| `description` | Optional section description                                       |
| `keywords`    | Comma-separated topic vocabulary for this section — the daily task's topic-match signal (see the written-article flow) |

### `articles`

| Column            | Required | Notes                                                            |
| ----------------- | :------: | ---------------------------------------------------------------- |
| `slug`            |    ✓     | Unique URL slug → `/article/<slug>`                              |
| `headline`        |    ✓     | Story headline                                                   |
| `blurb`           |    ✓     | 1–2 sentence summary (used on cards + as meta description)       |
| `body`            |    ✓     | **Markdown** article content (sanitised at build); headings/lists must be line-separated so raw Markdown never renders inline |
| `hero_image`      |          | Hero image URL (any host). 16:9 recommended (e.g. 1280×720)     |
| `hero_image_alt`  |   ★      | Alt text — **always provide for accessibility**                 |
| `hero_credit`     |          | Image credit line                                               |
| `thumbnail_image` |          | Card thumbnail URL; falls back to `hero_image`                  |
| `thumbnail_alt`   |          | Thumbnail alt; falls back to `hero_image_alt`                   |
| `category_id`     |   ★      | FK → `categories.id`                                             |
| `author`          |    ✓     | Byline (defaults to `NNN Staff`)                                |
| `source_name`     |   ★      | Original publisher name (aggregation credit)                    |
| `source_url`      |   ★      | Original article/video URL — rendered in the byline and closing credit |
| `video_youtube_id`|          | If set, the article is built from a YouTube video; the player is embedded at the top of the page (see YouTube section) |
| `video_duration_seconds` |   | Video length; used to keep the feed long-form only (exclude Shorts) and to show runtime |
| `reading_minutes` |          | Optional; auto-estimated from `body` if omitted                 |
| `featured`        |          | `1` marks the editorial lead story of the day / front-page lead |
| `category_featured` |        | `1` marks the editorial lead story for that article's category page |
| `published_at`    |    ✓     | ISO 8601 UTC; drives the front page, archive and ordering       |

> ★ = strongly recommended for a complete, well-credited, accessible article.

### Body format — write a "cliff-notes" digest, not a teaser

`body` is Markdown, sanitised at build. The goal of each summary is to give the
reader **all the salient points of the original** in a shorter, scannable form,
so they only click through for the full thing if they want it. Aim for ~150–350
words structured as:

1. A 1–2 sentence overview.
2. A `## The short version` heading followed by a bullet list of the key facts
   (figures, names, dates, findings — everything that matters).
3. One or two short `##` sections expanding on context and why it matters.

Bodies may embed media pulled from the original article:

- **Images** — standard Markdown `![alt](url)` or a `<figure class="media">`
  with an `<img>` and `<figcaption>` credit. Always include alt text.
- **Video** — an `<iframe>` from `youtube-nocookie.com`, `youtube.com` or
  `player.vimeo.com` only (other hosts are stripped by the sanitiser). Wrap it in
  `<div class="video">` for a responsive 16:9 frame.

The renderer also allows headings (h2–h4), lists, blockquotes, tables, `code`/
`pre`, and links (external links automatically open in a new tab with
`rel="noopener noreferrer"`). Everything else is stripped.

### `sources` (written-news feeds the daily task monitors)

A curated, fixed registry of publications the daily task scrapes for written
stories. **This is the only place the task looks** — it iterates these rows and
never free-roams the open web, which is what keeps the daily run reproducible.
Each row points at a machine-readable feed (RSS/Atom/JSON) so the parse shape is
stable even if the publisher restyles their site. The seed ships ~4 per section;
the list is surfaced on `/about` under "Sources we read".

> **Editing the lists.** The curated sources and YouTube channels live in a
> plain, human-editable file at [`data/sources.json`](data/sources.json)
> (`newsSources[]` and `youtubeChannels[]`). Add, remove or re-weight entries
> there, then run `npm run seed:reset` (or just rebuild) to apply — no need to
> touch `scripts/seed.mjs`.

| Column        | Notes                                                            |
| ------------- | --------------------------------------------------------------- |
| `name`        | Publisher display name (used as the article's `source_name`)    |
| `feed_url`    | RSS/Atom/JSON feed URL, unique — the task reads this            |
| `site_url`    | Publisher homepage (nullable; shown on `/about`)               |
| `category_id` | FK → `categories.id`                                            |
| `weight`      | Editorial priority (higher = preferred in ranking ties)        |
| `active`      | `1` = monitor, `0` = paused/skip                                |

> **Feed-less sites.** A source without an RSS/Atom feed can still be monitored
> via its `sitemap.xml`: the task filters the sitemap to article URLs (e.g. the
> `/blog/` path) and uses each entry's `<lastmod>` for recency. Our own
> **Foxy's Lab** blog is wired in this way (`feed_url` points at its sitemap)
> and carries the top `weight` of 10 so it leads the Smart Homes section.

#### The daily written-article flow (built for determinism)

The goal is that two runs over the same inputs produce the same articles. The
task's only genuinely generative step is writing the cliff-notes prose;
everything else is fixed rules:

1. **Fixed sources.** Read every `active` row in `sources` — that table only.
   Fetch and parse each `feed_url` into entries (title, link, published date,
   summary). Prefer feeds over HTML scraping so a layout change can't break you.
2. **Canonicalise links.** For each entry derive a canonical URL: lowercase the
   host, drop the fragment and tracking params (`utm_*`, `fbclid`, `gclid`, …).
   This is the dedupe key for written stories (the video equivalent is
   `video_youtube_id`).
3. **Recency window.** Keep only entries published within the last _N_ days,
   measured against the build reference date (`NNN_BUILD_DATE`), **not**
   wall-clock-at-run — so a re-run on the same build date sees the same window.
4. **Dedupe (idempotency).** Drop any whose canonical URL already exists in
   `articles.source_url`. A `UNIQUE` index on `source_url` enforces this at the
   database level, so a re-run can never double-insert; reruns converge.
5. **Deterministic score.** Rank survivors by an explicit score:
   `score = recencyPoints + source.weight + topicMatch`, where `recencyPoints`
   decays with age, `source.weight` comes from the registry (so Foxy's Lab, at
   weight 10, outranks everything in its section), and `topicMatch` counts how
   many of the candidate's category's `categories.keywords` appear in its
   headline/summary. The keyword vocabulary is read straight from the database —
   no "is this interesting?" judgement calls.
6. **Stable ordering.** Sort by `score` descending, breaking ties by
   `published_at` descending, then canonical URL ascending — so equal scores
   always resolve the same way.
7. **Global publish budget.** Process the deterministic candidate queue in
   batches of 60 (`NNN_CANDIDATE_BATCH_SIZE`), always in score/weight order so
   the most desired articles are attempted first. Keep going with the next batch
   if the validation gate has not produced more than 15 publishable stories
   (`NNN_MIN_SUCCESS_ARTICLES`, default 16). Stop once 25 articles have passed
   (`NNN_MAX_PUBLISHED_ARTICLES`, default 25) and discard the rest; NNN should
   publish a strong daily edition, not every possible qualifying item.
8. **Hard validation gate + backfill — reject, don't patch.** Before writing,
   a candidate must have **both** a `source_url` (the deep link) and a usable
   hero image. Resolve the image from the task or the article's Open Graph /
   Twitter card (`scripts/fetch-images.mjs` does the latter). **If no real image
   resolves, reject the candidate and promote the next-highest-scoring story** —
   never publish with a placeholder. Likewise reject anything missing
   `source_url`.

   The same rule applies to article copy quality. Generate the cliff-notes row
   as a candidate, run the article validator against its `body` and `blurb`, and
   reject the candidate if it fails because of scraper residue, ad/sponsor copy,
   repeated copied text, malformed Markdown, or a broken card blurb. Do **not**
   manually patch contaminated prose into shape. Promote the next ranked story
   from the deterministic queue and keep trying until the daily success gate is
   reached or the eligible pool is exhausted. If the pool is exhausted before
   more than 15 articles pass, fail the run and log/report the shortfall
   explicitly.
9. **Write.** For each survivor, write a cliff-notes `body` (the one generative
   step), set `headline`, `blurb`, `category_id`, `author`, `source_name` (the
   publisher), `source_url` (the canonical link), `published_at` (the source's
   real publish time) and the hero fields, then insert.
10. **Post-write validation repair.** After insert/build validation, if any newly
   inserted row fails `scripts/validate-articles.mjs`, delete that row, record
   the failure reason, and backfill from the next ranked candidate in the same
   category. Re-run validation/build after every repair pass. Existing historic
   rows that now fail validation should stop the run and be reported rather than
   silently removed unless the run is explicitly doing a cleanup.
11. **Editorial leads.** After inserting the day's batch, the task may choose the
    best lead story of the day (`featured = 1`) and one lead story per category
    (`category_featured = 1`). This is an editorial judgement call: prefer
    broadly important, useful, surprising, high-signal stories over merely the
    newest item. **Exception: if Foxy's Lab publishes a video or article on the
    local run date, that Foxy's Lab item must be the front-page lead story and
    the Smart Homes category lead. No exceptions.** Clear old lead flags first
    so there is only one front-page lead and one category lead per category.

### `youtube_channels` (video sources the daily task monitors)

A curated list of YouTube channels per category. The seed ships four per
section (Smart Homes includes **Foxy's Lab** and **Paul Hibbert**). The list is
surfaced on the `/about` page under "Channels we follow".

| Column        | Notes                                                            |
| ------------- | --------------------------------------------------------------- |
| `name`        | Channel display name                                            |
| `handle`      | `@handle` (nullable)                                            |
| `channel_id`  | `UC…` id for the RSS/API feed (nullable; resolvable from handle)|
| `url`         | Channel URL (unique)                                            |
| `category_id` | FK → `categories.id`                                            |
| `weight`      | Editorial priority (higher = preferred). **Foxy's Lab = 10** (top of Smart Homes); others default to 3 |
| `active`      | `1` = monitor, `0` = paused/skip                                |

**The daily video-to-article flow** the task should implement:

1. For each `active` channel, read its uploads feed
   (`https://www.youtube.com/feeds/videos.xml?channel_id=<channel_id>`) and find
   videos published in the last day or two.
2. Skip any whose video id already appears in `articles.video_youtube_id` (the
   dedupe key) so the same video is never written twice.
3. **Exclude Shorts — the feed is long-form only.** Skip vertical/short videos
   (e.g. duration under ~60 seconds). The channel RSS feed has no duration, so
   detect this via the YouTube Data API (`contentDetails.duration`) or by
   checking whether `https://www.youtube.com/shorts/<id>` stays on `/shorts`
   (a Short) versus redirecting to `/watch` (long-form). Store the length in
   `video_duration_seconds`.
4. For a new video, fetch the transcript and write a cliff-notes `body` from it
   (same format as above), set `video_youtube_id`, `source_name` (the channel),
   `source_url` (the watch URL) and `category_id`, and insert the article.

Videos enter the same deterministic daily candidate queue as written articles.
Process channels in `weight` order (highest first) so top channels are attempted
first — **Foxy's Lab (weight 10) always leads Smart Homes** — then apply the
same 60-candidate batch, >15 success gate, and 25-article publish cap.

When `video_youtube_id` is set the article page embeds the player at the top in
place of the hero image, the card shows a play badge, and the byline/credit read
"Based on the video by … on YouTube" / "Watch on YouTube". The card thumbnail
uses the YouTube thumbnail (`i.ytimg.com/vi/<id>/…`) automatically.

### `related_articles` (curated sidebar links)

Populate this to control the "Related Reading" sidebar. If an article has no
rows here, the site automatically falls back to recent articles from the last 3
months, then to recent articles overall.

| Column                | Notes                                  |
| --------------------- | -------------------------------------- |
| `article_id`          | FK → the article being viewed          |
| `related_article_id`  | FK → the related article               |
| `position`            | Sort order (ascending)                 |

### Example insert (Node, `better-sqlite3`)

```js
import Database from 'better-sqlite3';
const db = new Database('data/nnn.db');

db.prepare(`INSERT INTO articles
  (slug, headline, blurb, body, hero_image, hero_image_alt, hero_credit,
   category_id, author, source_name, source_url, published_at)
  VALUES (@slug, @headline, @blurb, @body, @hero_image, @hero_image_alt,
   @hero_credit, @category_id, @author, @source_name, @source_url, @published_at)`
).run({
  slug: 'example-story',
  headline: 'Example Story Headline',
  blurb: 'A one or two sentence summary of the story.',
  body: '## Subheading\n\nMarkdown body text…',
  hero_image: 'https://example.com/image.jpg',
  hero_image_alt: 'Descriptive alt text for the hero image.',
  hero_credit: 'Photo: Example Source',
  category_id: 1,
  author: 'Jane Doe',
  source_name: 'Example Source',
  source_url: 'https://example.com/original-article',
  published_at: '2026-06-14T09:30:00Z',
});
```

After updating the database, re-run `npm run build` to regenerate the static
site. (The "current calendar month" on the front page is the month of the build,
which is why the site is rebuilt daily.)

### Lead images

`scripts/fetch-images.mjs` (run automatically during `prebuild`) downloads each
article's lead image from its source page's Open Graph / Twitter card, optimises
it into local hero + thumbnail WebP files under `public/images/`, and records a
`Image: <source>` credit plus alt text. It only touches articles whose image is
still a placeholder, so artwork supplied directly by the daily task is left
untouched. If a source has no usable image, the placeholder is kept. The daily
task can either set `hero_image`/`thumbnail_image` itself or leave them blank and
let this script populate them.

## Configuration (environment variables)

See `.env.example`. All are optional for local development.

| Variable                       | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`              | Absolute URL for canonical links, sitemap, RSS, OG |
| `NEXT_PUBLIC_ADS_ENABLED`           | **Master switch** — set to `true` to render any ad space at all |
| `NEXT_PUBLIC_ADSENSE_CLIENT`        | AdSense publisher id — activates live ad units     |
| `NEXT_PUBLIC_AD_SLOT_LEADER`        | Feed leaderboard (top) ad-unit slot id             |
| `NEXT_PUBLIC_AD_SLOT_INFEED`        | In-grid ad-unit slot id (replaces one feed card)   |
| `NEXT_PUBLIC_AD_SLOT_ARTICLE_TOP`   | Article — above the body                            |
| `NEXT_PUBLIC_AD_SLOT_ARTICLE_BOTTOM`| Article — below the body                            |
| `NEXT_PUBLIC_AD_SLOT_SIDEBAR`       | Article sidebar (top) ad-unit slot id              |
| `NEXT_PUBLIC_AD_SLOT_SIDEBAR_BOTTOM`| Article sidebar (bottom) ad-unit slot id           |
| `NNN_BUILD_DATE`                    | Pin the build's reference date (ISO 8601 UTC)      |

Advertising is **off by default**. Set `NEXT_PUBLIC_ADS_ENABLED=true` to render
ad placements; without an AdSense client id they appear as clearly-labelled
placeholders that reserve the correct space (so enabling live ads causes no
layout shift). The placements are: a feed leaderboard, an in-grid unit that
replaces one card in the feed, top/bottom units on the article body, and
top/bottom units in the article sidebar. With ads off, nothing renders and the
feed shows a full set of articles.

## Logo assets

The brand master is `public/nerd-news-network-logo-xl.png` (a transparent,
print-ready "NNN" monogram with a wordmark, using the brand's white/black/red
strokes). `scripts/build-logo.mjs` derives web assets from it on every build,
**preserving the original colours** and placing the logo on a neutral grey
backdrop wherever all three colours need contrast:

- `public/logo/logo.png` — original-colour lockup (used in the grey masthead and,
  on a grey plate, in the dark footer)
- `public/logo/og-default.png` — 1200×630 social card (logo on grey)
- `src/app/icon.png`, `src/app/apple-icon.png` — square app icons / favicon
  (monogram on a grey rounded tile)

## Project structure

```
data/                     SQLite database (generated; git-ignored)
scripts/
  seed.mjs                Schema + sample-data bootstrap (the data contract)
  build-logo.mjs          Logo/icon/OG asset generation
src/
  app/                    App Router pages, routes, metadata, sitemap, RSS
  components/             UI components (Header, Footer, ArticleCard, …)
  lib/                    db access, types, formatting, markdown, site config
public/                   Static assets + generated logo/
```

## Notes

- No user accounts, comments or runtime server — everything is static.
- Articles are summaries that credit and link to original sources; rights remain
  with the respective publishers (see `/about`).
