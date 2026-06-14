// Seed / bootstrap script for the Nerd News Network database.
//
// Behaviour:
//   node scripts/seed.mjs           → ensure schema exists; seed sample data
//                                     ONLY if the DB is empty (safe for prod).
//   node scripts/seed.mjs --reset   → wipe all content and re-seed samples.
//
// In production the database is populated by a separate daily AI task. This
// script never overwrites existing content unless --reset is passed, so it is
// safe to run on every build (it just guarantees the schema is present).
//
// NOTE ON CONTENT: the seeded articles are REAL, recently-published stories.
// Each body is an original "cliff-notes" summary written for Nerd News Network
// (an aggregator) — an overview, a key-points digest and expanded context that
// capture the salient points so a reader gets the gist without leaving. The
// headline, source name, publication date and deep link point to the original
// so readers can read the full piece. Hero images are pulled from the source
// (see scripts/fetch-images.mjs); bodies may also embed images/video.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'nnn.db');

mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema — this is the contract the daily AI population task writes against.
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS articles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT NOT NULL UNIQUE,
    headline        TEXT NOT NULL,
    blurb           TEXT NOT NULL,                 -- card summary + meta description
    body            TEXT NOT NULL,                 -- Markdown article content (cliff-notes)
    hero_image      TEXT,                          -- hero image URL/path
    hero_image_alt  TEXT,                          -- REQUIRED alt text for A11y
    hero_credit     TEXT,                          -- image credit line
    thumbnail_image TEXT,                          -- optional; falls back to hero
    thumbnail_alt   TEXT,                          -- optional; falls back to hero alt
    category_id     INTEGER REFERENCES categories(id),
    author          TEXT NOT NULL DEFAULT 'NNN Staff',
    source_name     TEXT,                          -- original source (aggregation credit)
    source_url      TEXT,                          -- original article URL (deep link)
    reading_minutes INTEGER,                       -- optional precomputed read time
    featured        INTEGER NOT NULL DEFAULT 0,    -- 1 = lead story on its page
    published_at    TEXT NOT NULL,                 -- ISO 8601 UTC, e.g. 2026-06-14T09:30:00Z
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_category  ON articles(category_id);
  CREATE INDEX IF NOT EXISTS idx_articles_slug      ON articles(slug);

  -- Related articles, curated by the daily AI task. The frontend reads these;
  -- if an article has none, it falls back to recent articles (≤3 months).
  CREATE TABLE IF NOT EXISTS related_articles (
    article_id         INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    related_article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    position           INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (article_id, related_article_id)
  );
`);

const reset = process.argv.includes('--reset');
const existing = db.prepare('SELECT COUNT(*) AS n FROM articles').get().n;

if (existing > 0 && !reset) {
  console.log(
    `[seed] DB already has ${existing} article(s); schema ensured, leaving data untouched.`
  );
  db.close();
  process.exit(0);
}

if (reset) {
  console.log('[seed] --reset: clearing existing content.');
  db.exec('DELETE FROM related_articles; DELETE FROM articles; DELETE FROM categories;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('articles','categories');");
}

// ---------------------------------------------------------------------------
// Categories — order here defines the nav order (see getCategories).
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { slug: 'ai', name: 'AI', description: 'Machine learning, models and the automated age.' },
  { slug: 'networking', name: 'Networking', description: 'Connectivity, wireless standards and the plumbing of the internet.' },
  { slug: 'smart-homes', name: 'Smart Homes', description: 'Connected devices, hubs and home automation.' },
  { slug: 'gaming', name: 'Gaming', description: 'Games, consoles, showcases and the industry behind them.' },
  { slug: 'science', name: 'Science', description: 'Research, discovery and the cosmos explained.' },
  { slug: 'technology', name: 'Technology', description: 'Hardware, software, security and the people building it.' },
];

const insertCategory = db.prepare(
  'INSERT INTO categories (slug, name, description) VALUES (@slug, @name, @description)'
);
const categoryIds = {};
for (const c of CATEGORIES) {
  const info = insertCategory.run(c);
  categoryIds[c.slug] = info.lastInsertRowid;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const para = (s) => s.trim();
const esc = (s) => String(s).replace(/"/g, '&quot;');

// Inline figure (image pulled from the original article) and video embed.
function figImg(img) {
  return `<figure class="media"><img src="${img.url}" alt="${esc(img.alt || '')}" loading="lazy" decoding="async" />${img.caption ? `<figcaption>${img.caption}</figcaption>` : ''}</figure>`;
}
function figVideo(v) {
  return `<figure class="media"><div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${v.youtube}" title="${esc(v.title || 'Video')}" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>${v.caption ? `<figcaption>${v.caption}</figcaption>` : ''}</figure>`;
}

// Build a "cliff-notes" Markdown body: an overview, a key-points digest, then
// expanded sections (each optionally with an image), closing with a credit.
function buildBody({ intro, keyPoints, sections, video, sourceName }) {
  const parts = [];
  if (intro) parts.push(para(intro), '');
  if (keyPoints && keyPoints.length) {
    parts.push('## The short version', '');
    for (const k of keyPoints) parts.push(`- ${k}`);
    parts.push('');
  }
  if (video) parts.push(figVideo(video), '');
  for (const sec of sections || []) {
    parts.push(`## ${sec.heading}`, '');
    for (const p of sec.paras || []) parts.push(para(p), '');
    if (sec.list) {
      for (const li of sec.list) parts.push(`- ${li}`);
      parts.push('');
    }
    if (sec.image) parts.push(figImg(sec.image), '');
  }
  parts.push(
    `> Summary by Nerd News Network. Read the full article at **${sourceName}** via the links above and below.`,
    ''
  );
  return parts.join('\n');
}

const S = (heading, ...paras) => ({ heading, paras });

function article({ headline, blurb, category, source, sourceUrl, publishedAt, featured = 0, imageSeed, intro, keyPoints, sections, video, author = 'NNN Staff' }) {
  return {
    slug: slugify(headline),
    headline,
    blurb,
    body: buildBody({ intro, keyPoints, sections, video, sourceName: source }),
    hero_image: `https://picsum.photos/seed/nnn${imageSeed}/1280/720`,
    hero_image_alt: `Placeholder illustration for the story “${headline}”.`,
    hero_credit: 'Placeholder image — Picsum Photos',
    thumbnail_image: `https://picsum.photos/seed/nnn${imageSeed}/640/360`,
    thumbnail_alt: `Placeholder thumbnail for “${headline}”.`,
    category_id: categoryIds[category],
    author,
    source_name: source,
    source_url: sourceUrl,
    reading_minutes: 2 + (imageSeed % 3),
    featured,
    published_at: publishedAt,
  };
}

// ---------------------------------------------------------------------------
// Articles — real stories, original cliff-notes summaries, deep-linked sources.
// ---------------------------------------------------------------------------
const ARTICLES = [
  // ===================== JUNE 2026 (current month) =====================
  article({
    headline: 'James Webb Reveals Two Completely Different Twilights on Ultra-Hot World WASP-121b',
    blurb:
      'JWST measured the dawn and dusk edges of a scorching gas giant 858 light-years away and found them wildly different in temperature and chemistry — the clearest evidence yet of an asymmetric exoplanet atmosphere.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/06/260611024559.htm',
    publishedAt: '2026-06-11T08:30:00Z', featured: 1, imageSeed: 11,
    intro:
      'The James Webb Space Telescope has effectively read the weather on a world 858 light-years away — and found its morning and evening skies are nothing alike.',
    keyPoints: [
      'JWST measured stark differences between the dawn and dusk edges of ultra-hot Jupiter WASP-121b (“Tylos”).',
      'The day side reaches about 2,770 K (~2,500°C) while the night side sits near 1,000 K.',
      'Fierce eastward winds drag heat around the planet, leaving the evening edge hotter and more puffed-up than the morning edge.',
      'Water molecules are torn apart on the dayside; possible silicate (mineral) clouds may shroud the cooler morning side.',
      'The study, led by Cyril Gapp of the Max Planck Institute for Astronomy, appears in Nature Astronomy.',
    ],
    sections: [
      S('How they did it',
        'Rather than averaging the planet into a single measurement, the team used JWST’s NIRSpec instrument to track how starlight filtered through the atmosphere as the planet rotated roughly 30° during transit — effectively resolving its three-dimensional structure.'),
      S('Why it matters',
        'It is the clearest confirmation yet that hot-Jupiter atmospheres are deeply asymmetric, and it demonstrates a technique for mapping conditions across distant worlds rather than treating them as single dots of light.'),
    ],
  }),
  article({
    headline: 'Webb Spots a Hot Jupiter Trailing Twin Gas Tails That Defy Easy Explanation',
    blurb:
      'JWST watched WASP-121b bleed helium into space as two long tails during a near-complete orbit — the longest continuous detection of a planet losing its atmosphere, and a configuration current models can’t explain.',
    category: 'science', source: 'Space.com',
    sourceUrl: 'https://www.space.com/astronomy/exoplanets/james-webb-space-telescope-discovers-a-hot-jupiter-exoplanet-leaking-twin-gas-tails-that-defy-explanation',
    publishedAt: '2026-06-09T14:10:00Z', imageSeed: 12,
    intro:
      'Webb has caught an ultra-hot Jupiter behaving strangely — shedding helium into space as two distinct tails that current theory struggles to account for.',
    keyPoints: [
      'WASP-121b was observed losing helium in two separate tails during a near-complete orbit.',
      'The tails stretch roughly 100 times the planet’s width and three times the star–planet distance.',
      'At 37 consecutive hours with JWST’s NIRSpec, it is the longest continuous detection of atmospheric escape on record.',
      'The dual-tail structure contradicts existing models of how planets shed their atmospheres.',
      'The work was led by Romain Allart (University of Montreal) and published in Nature Communications.',
    ],
    sections: [
      S('Why it matters',
        'Watching a planet erode in real time helps astronomers understand how worlds change under intense starlight — and the unexpected twin tails show how much of the underlying physics is still missing from the models.'),
    ],
  }),
  article({
    headline: 'NASA’s Nancy Grace Roman Space Telescope Is Complete — and May Launch Months Early',
    blurb:
      'NASA’s next flagship observatory has finished assembly under budget and eight months ahead of schedule, with a Falcon Heavy launch now targeted for around September 2026.',
    category: 'science', source: 'Space.com',
    sourceUrl: 'https://www.space.com/space-exploration/the-nancy-grace-roman-space-telescope-nasas-next-great-observatory-is-finally-complete',
    publishedAt: '2026-06-07T09:00:00Z', imageSeed: 13,
    intro:
      'NASA’s next great observatory is built, on budget and ahead of schedule — and it could begin scanning the cosmos far sooner than planned.',
    keyPoints: [
      'The Nancy Grace Roman Space Telescope finished assembly at NASA’s Goddard center, eight months early and under budget.',
      'Launch is targeted for around September 2026 on a SpaceX Falcon Heavy, bound for the L2 point ~1 million miles from Earth.',
      'Its Wide Field Instrument is a 300-megapixel camera with a field of view about 100× Hubble’s.',
      'Roman surveys the sky roughly 1,000× faster than Hubble and will generate ~500 terabytes of data a year.',
      'A coronagraph can image planets up to 100 million times fainter than their host stars.',
    ],
    sections: [
      S('The mission',
        'Roman will probe dark energy and dark matter, hunt for exoplanets and capture transient events such as supernovae across enormous swaths of sky.'),
      S('Next steps',
        'The observatory now heads to Kennedy Space Center in Florida for final testing, fuelling and launch preparations.'),
    ],
  }),
  article({
    headline: 'A Satellite-Boosting Spacecraft Gets Set for an Air-Launched Ride to Orbit',
    blurb:
      'Katalyst Space’s LINK servicing satellite is being readied to chase down NASA’s ageing Swift telescope — which has dropped from 373 to 249 miles — and boost it back to a safe orbit.',
    category: 'science', source: 'Space.com',
    sourceUrl: 'https://www.space.com/space-exploration/launches-spacecraft/satellite-boosting-spacecraft-inside-air-launched-rocket-space-photo-of-the-day-for-june-12-2026',
    publishedAt: '2026-06-12T11:45:00Z', imageSeed: 14,
    intro:
      'A robotic spacecraft is being prepared for an unusual mission: catch an ageing NASA telescope that’s slowly falling, and push it back up to a safe orbit.',
    keyPoints: [
      'Katalyst Space’s LINK servicing satellite will rendezvous with NASA’s Swift Observatory and raise its orbit.',
      'Swift, launched in 2004 to study gamma-ray bursts, has decayed from about 373 to 249 miles in altitude.',
      'LINK will ride an air-launched Northrop Grumman Pegasus XL, dropped from a Lockheed L-1011 “Stargazer” at ~39,000 feet.',
      'The mission involves four separate vehicles and demands precise prediction of Swift’s position.',
    ],
    sections: [
      S('Why it matters',
        'In-orbit servicing — refuelling, repairing and repositioning satellites — could extend the lives of valuable spacecraft instead of letting them re-enter and burn up.'),
    ],
  }),
  article({
    headline: 'Giant Underground Neutrino Detector Edges Scientists Closer to Solving the Neutrino Puzzle',
    blurb:
      'China’s JUNO observatory published its debut result as a Nature cover, using just 59 days of data to deliver some of the most precise measurements yet of how neutrinos change as they travel.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/06/260612032026.htm',
    publishedAt: '2026-06-12T07:20:00Z', imageSeed: 15,
    intro:
      'A giant detector buried under southern China has delivered its first results — and immediately become one of the most precise neutrino experiments on Earth.',
    keyPoints: [
      'JUNO published its first physics result as a Nature cover article (June 10, 2026).',
      'Using only 59 days of data, it sharply improved key measurements of neutrino oscillation.',
      'The detector sits 700 metres underground near Jiangmen and watches antineutrinos from reactors 53 km away.',
      'The results boost confidence it can crack the neutrino “mass ordering” puzzle.',
    ],
    sections: [
      S('Why it matters',
        'Pinning down neutrino properties could help explain why the universe is made of matter rather than antimatter — one of the deepest open questions in physics.'),
    ],
  }),
  article({
    headline: 'Ancient DNA Shared With Neanderthals May Help Explain Human Language',
    blurb:
      'A new study finds the roots of language may lie not in special genes but in tiny regulatory “switches” — under 0.1% of the genome — some of which we share with Neanderthals.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/06/260611024612.htm',
    publishedAt: '2026-06-11T10:05:00Z', imageSeed: 16,
    intro:
      'A study suggests the foundations of human language may lie not in special genes, but in tiny genetic “switches” we partly share with Neanderthals.',
    keyPoints: [
      'University of Iowa researchers found regulatory DNA regions — under 0.1% of the genome — that strongly influence language ability.',
      'These “switches” act like volume controls on genes involved in brain development, rather than genes themselves.',
      'Some of the regions are shared with Neanderthals, hinting language’s foundations are older than thought.',
      'The work connects to FOXP2 and Forkhead-box transcription factors long associated with speech.',
    ],
    sections: [
      S('Why it matters',
        'Reframing language evolution around gene regulation, not just genes, changes how scientists study what made human speech possible in the first place.'),
    ],
  }),
  article({
    headline: 'Everything Announced at the Summer Game Fest 2026 Showcase',
    blurb:
      'Summer Game Fest’s headline show fired off one of its busiest nights yet — a new Resident Evil, the next Final Fantasy 7 chapter, Alien: Isolation 2 and a Zelda: Ocarina of Time remake among the reveals.',
    category: 'gaming', source: 'Game Informer',
    sourceUrl: 'https://gameinformer.com/sgf-2026/2026/06/05/heres-everything-announced-during-the-summer-game-fest-2026-showcase',
    publishedAt: '2026-06-05T18:30:00Z', imageSeed: 17,
    intro:
      'Summer Game Fest 2026 opened the summer showcase season with one of its busiest editions yet — a rapid-fire run of trailers, release dates and surprises across every platform.',
    keyPoints: [
      'The show spanned PS5, Xbox Series X|S, Switch 2 and PC.',
      'A new Resident Evil and the next chapter of the Final Fantasy 7 remake headlined the reveals.',
      'Other highlights: Alien: Isolation 2, a PlatinumGames Teenage Mutant Ninja Turtles game, and Monster Hunter Wilds’ “Ascension” expansion.',
      'Nintendo confirmed a long-rumoured Legend of Zelda: Ocarina of Time remake for Switch 2 in 2026.',
    ],
    sections: [
      S('Why it matters',
        'With no single E3 anymore, Summer Game Fest has become the anchor of the summer reveal calendar — and this edition set an aggressive pace for the months ahead.'),
    ],
  }),
  article({
    headline: 'The Biggest Surprises of Summer Game Fest 2026, From Resident Evil to Final Fantasy 7',
    blurb:
      'Beyond the expected sequels, SGF 2026 landed real shocks: a new Resident Evil (Veronica) due 2027, and the third Final Fantasy 7 remake chapter — subtitled Revelation — launching everywhere at once in spring 2027.',
    category: 'gaming', source: 'GamesRadar+',
    sourceUrl: 'https://www.gamesradar.com/games/the-6-biggest-surprise-trailers-announcements-reveals-at-summer-game-fest-2026/',
    publishedAt: '2026-06-06T16:00:00Z', imageSeed: 18,
    intro:
      'Beyond the expected sequels, Summer Game Fest 2026 delivered a handful of genuine shocks — led by a new Resident Evil and the next Final Fantasy 7 instalment.',
    keyPoints: [
      'A new Resident Evil (Veronica) was revealed, due 2027 on PS5, Xbox Series X, Switch 2 and PC.',
      'The third Final Fantasy 7 remake chapter is subtitled Revelation, launching simultaneously on all platforms in spring 2027.',
      'Alien: Isolation 2 was confirmed as the sequel’s official title.',
      'PlatinumGames showed a first trailer for a new Teenage Mutant Ninja Turtles game.',
    ],
    sections: [
      S('Why it matters',
        'Simultaneous multi-platform launches for marquee series signal how publishers are widening reach rather than betting on exclusivity.'),
    ],
  }),
  article({
    headline: 'Final Fantasy VII Rebirth Arrives on Switch 2 and Xbox This Week',
    blurb:
      'The middle chapter of Square Enix’s Final Fantasy 7 remake trilogy lands on Nintendo Switch 2 and Xbox Series X|S on the same day, finally putting it on every major platform.',
    category: 'gaming', source: 'Screen Rant',
    sourceUrl: 'https://screenrant.com/final-fantasy-7-rebirth-june-2026-release-psa/',
    publishedAt: '2026-06-03T13:00:00Z', imageSeed: 19,
    intro:
      'The middle chapter of Square Enix’s Final Fantasy 7 remake trilogy has gone everywhere at once, arriving on Switch 2 and Xbox the same day.',
    keyPoints: [
      'Final Fantasy VII Rebirth launches simultaneously on Nintendo Switch 2 and Xbox Series X|S on June 3, 2026.',
      'It first debuted on PS5 in 2024, followed by a PC release in 2025.',
      'The game is now playable on every major platform.',
    ],
    sections: [
      S('Why it matters',
        'Bringing a former console exclusive to all platforms — including Nintendo’s new hardware — widens the audience just as the trilogy’s finale, Revelation, comes into view.'),
    ],
  }),
  article({
    headline: 'Everything Nintendo Revealed at Its 2026 Summer Direct',
    blurb:
      'Nintendo capped a packed showcase weekend with a Summer Direct laying out the Switch and Switch 2 slate for the months ahead, dovetailing with Summer Game Fest reveals like the Ocarina of Time remake.',
    category: 'gaming', source: 'Game Informer',
    sourceUrl: 'https://gameinformer.com/nintendo-direct/2026/06/09/heres-everything-announced-during-nintendos-2026-summer-direct',
    publishedAt: '2026-06-09T15:00:00Z', imageSeed: 20,
    intro:
      'Nintendo capped a busy showcase weekend with a Summer Direct setting out what’s heading to Switch and Switch 2 over the coming months.',
    keyPoints: [
      'The Direct mixed fresh reveals with firm release dates for previously announced titles.',
      'Several announcements leaned on Switch 2, underlining the new hardware’s growing library.',
      'It connected to Summer Game Fest reveals, including the Legend of Zelda: Ocarina of Time remake.',
    ],
    sections: [
      S('Why it matters',
        'A strong first-party slate is central to Switch 2’s momentum as Nintendo builds out its next-generation catalogue.'),
    ],
  }),
  article({
    headline: 'The 25 Most Exciting Games of Summer Game Fest 2026',
    blurb:
      'After a marathon of showcases, the standout titles of SGF 2026 came into focus — a cross-section of the most-anticipated games across genres and platforms.',
    category: 'gaming', source: 'Game Informer',
    sourceUrl: 'https://gameinformer.com/sgf-2026/2026/06/09/the-25-most-exciting-games-of-summer-game-fest-2026',
    publishedAt: '2026-06-09T12:30:00Z', imageSeed: 21,
    intro:
      'After a marathon of showcases, the standouts of Summer Game Fest 2026 came into focus — a shortlist of the games most worth watching.',
    keyPoints: [
      'Dozens of games were shown across the week; the strongest rose to the top on the strength of their trailers and ambition.',
      'The picks span genres and platforms, from blockbuster sequels to indie debuts.',
      'Recurring favourites included the new Resident Evil, Final Fantasy 7 Revelation and the Ocarina of Time remake.',
    ],
    sections: [
      S('Why it matters',
        'Curated roundups help players cut through showcase overload to the releases that actually matter for their own libraries.'),
    ],
  }),
  article({
    headline: 'Every Switch Announcement From Summer Game Fest’s Opening Weekend',
    blurb:
      'For Switch owners, SGF’s opening weekend brought a steady stream of reveals — every Nintendo Switch and Switch 2 announcement collected in one place.',
    category: 'gaming', source: 'Nintendo Life',
    sourceUrl: 'https://www.nintendolife.com/news/2026/06/round-up-every-switch-1-and-2-announcement-from-summer-game-fests-weekend-showcases',
    publishedAt: '2026-06-07T10:00:00Z', imageSeed: 22,
    intro:
      'For Switch owners, Summer Game Fest’s opening weekend delivered a steady stream of reveals — here’s the Nintendo-relevant haul in one place.',
    keyPoints: [
      'The opening showcases confirmed numerous titles for both Switch and Switch 2.',
      'Announcements ranged across first- and third-party games.',
    ],
    sections: [
      S('Why it matters',
        'Consolidated roundups are handy when reveals are scattered across multiple back-to-back streams over a single weekend.'),
    ],
  }),
  article({
    headline: 'OpenAI Launches New Codex Tools Aimed at White-Collar Work',
    blurb:
      'OpenAI pushed its Codex agent well beyond coding, adding plug-ins for analytics, design, sales and finance plus a feature that publishes its output as a live website — and says Codex now has 5M weekly users.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/06/02/openai-launches-new-codex-tools-for-white-collar-work/',
    publishedAt: '2026-06-02T17:00:00Z', imageSeed: 23,
    intro:
      'OpenAI has pushed its Codex agent well beyond coding, adding role-specific plug-ins and a way to publish results as live web pages — a clear bid to make the tool useful across the whole office.',
    keyPoints: [
      'Six new plug-ins target specific jobs: data analytics, creative production, sales, product design, equity investing and investment banking.',
      'A new “Sites” feature lets Codex publish its output as a hosted, interactive website rather than a local file.',
      'Codex now reports more than 5 million weekly active users, up roughly sixfold since its desktop app launched in February.',
      'The update reframes Codex as an agent for white-collar work, not just software development.',
    ],
    sections: [
      S('Why it matters',
        'Positioning a coding agent as a general workplace tool puts OpenAI in competition with a wide range of productivity software, and hints at where it sees agentic AI heading next.'),
    ],
  }),

  // ===================== MAY 2026 (archive) =====================
  article({
    headline: 'OpenAI Makes GPT-5.5 Instant the New Default Model for ChatGPT',
    blurb: 'OpenAI quietly swapped ChatGPT’s default brain to GPT-5.5 Instant, the fast model most users now talk to, replacing GPT-5.3 Instant.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/05/05/openai-releases-gpt-5-5-instant-a-new-default-model-for-chatgpt/',
    publishedAt: '2026-05-05T16:00:00Z', imageSeed: 31,
    intro: 'OpenAI quietly swapped the brain behind everyday ChatGPT, making GPT-5.5 Instant the model most users now talk to by default.',
    keyPoints: [
      'GPT-5.5 Instant replaces GPT-5.3 Instant as ChatGPT’s default for most users.',
      'It follows the wider GPT-5.5 rollout that began reaching paid tiers in April.',
      '“Instant” models prioritise fast, low-latency responses for routine queries.',
    ],
    sections: [
      S('Context', 'The change is part of a steady cadence of model updates as OpenAI iterates on speed, cost and capability across its lineup.'),
    ],
  }),
  article({
    headline: 'NASA’s New AI Space Chip Could Let Spacecraft Think for Themselves',
    blurb: 'NASA is testing a radiation-hardened processor with roughly 100× the power of today’s space chips, built to let craft on the Moon, Mars and beyond make real-time decisions on their own.',
    category: 'technology', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/05/260515002134.htm',
    publishedAt: '2026-05-15T09:30:00Z', imageSeed: 32,
    intro: 'NASA is testing a processor that could let spacecraft think for themselves far from home, packing orders of magnitude more power than today’s space-rated chips.',
    keyPoints: [
      'The High-Performance Spaceflight Computing (HPSC) processor is radiation-hardened for deep space.',
      'It delivers roughly 100× the compute of current space processors — and up to ~500× versus today’s rad-hardened chips in some tests.',
      'It’s built jointly by NASA’s JPL and Microchip Technology, targeting Moon, Mars and long-duration missions.',
      'More onboard power enables real-time autonomy: driving rovers faster, filtering images and acting without waiting on Earth.',
    ],
    sections: [
      S('Why it matters', 'Light-speed delays make remote control impractical in deep space; smarter onboard computing lets missions make decisions for themselves.'),
    ],
  }),
  article({
    headline: 'Scientists Link a “Time Crystal” to a Real Device in Quantum Breakthrough',
    blurb: 'Physicists at Aalto University coupled a time crystal to a tiny mechanical oscillator and steered it — turning an exotic, perpetually-moving phase of matter into something controllable.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/05/260504154024.htm',
    publishedAt: '2026-05-04T08:00:00Z', imageSeed: 33,
    intro: 'Physicists have, for the first time, hooked a “time crystal” up to a real mechanical device — and steered it — turning an exotic curiosity into something controllable.',
    keyPoints: [
      'A team at Aalto University coupled a time crystal to a tiny mechanical oscillator and controlled its behaviour.',
      'Time crystals show perpetual, repeating motion while remaining in their lowest energy state.',
      'The system used magnons in superfluid helium-3 near absolute zero; motion persisted for up to 108 cycles (several minutes).',
      'Time crystals can outlast the quantum systems used in today’s quantum computers by orders of magnitude.',
    ],
    sections: [
      S('Why it matters', 'Controllable time crystals could feed into precise sensors, better quantum-computer memory and measurement tools — uses once thought impossible without destroying the state. The work appeared in Nature Communications.'),
    ],
  }),
  article({
    headline: '“CopyFail” Attackers Begin Cashing In on a Critical Linux Kernel Flaw',
    blurb: 'A critical Linux kernel bug nicknamed CopyFail (CVE-2026-31431) lets local users grab root and is now being exploited in the wild, prompting CISA to order urgent patching.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/security/2026/05/05/copyfail-attackers-start-cashing-in-on-linux-flaw/5226930',
    publishedAt: '2026-05-05T11:00:00Z', imageSeed: 34,
    intro: 'A critical Linux kernel flaw nicknamed “CopyFail” has gone from disclosure to active exploitation, prompting urgent patching orders.',
    keyPoints: [
      'The bug (CVE-2026-31431) lets unprivileged local users write controlled bytes into the page cache to gain root.',
      'Attackers are now exploiting it in the wild.',
      'CISA added it to its Known Exploited Vulnerabilities catalog and set a patch deadline for federal agencies.',
    ],
    sections: [
      S('What to do', 'Administrators are urged to apply kernel updates immediately, as working exploits are already circulating.'),
    ],
  }),
  article({
    headline: 'Linux Kernel Flaw Exposes Root-Only Files to Unprivileged Users',
    blurb: 'A second kernel vulnerability (CVE-2026-46333) lets ordinary users read protected files such as SSH keys and password databases, breaking a core access-control boundary.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/security/2026/05/18/linux-kernel-flaw-opens-root-only-files-to-unprivileged-users/5241950',
    publishedAt: '2026-05-18T10:30:00Z', imageSeed: 35,
    intro: 'Another Linux kernel weakness lets ordinary users read files that should be off-limits — including secrets like SSH keys.',
    keyPoints: [
      'The flaw (CVE-2026-46333) allows unprivileged users to read root-only files.',
      'Exposed data could include SSH keys and password databases.',
      'It undermines a core kernel access-control boundary; updated kernels fix it.',
    ],
    sections: [
      S('Why it matters', 'Leaking credentials from protected files can hand attackers the keys to escalate further across systems.'),
    ],
  }),
  article({
    headline: 'SpaceX’s Starship Flight 12 Splashes Down in the Indian Ocean as Planned',
    blurb: 'SpaceX opened Starship’s 2026 campaign with a clean suborbital test that deployed 20 dummy Starlink satellites before a controlled splashdown.',
    category: 'science', source: 'Space.com',
    sourceUrl: 'https://www.space.com/news/live/spacex-starship-flight-12-launch-updates-may-22-2026',
    publishedAt: '2026-05-22T23:00:00Z', imageSeed: 36,
    intro: 'SpaceX kicked off Starship’s 2026 campaign with a clean suborbital test that ended in a planned splashdown.',
    keyPoints: [
      'Starship Flight 12, the first of 2026, flew a suborbital profile and splashed down in the Indian Ocean.',
      'The Ship deployed 20 dummy Starlink satellites during the flight.',
      'It was an iterative test toward a rapidly reusable heavy-lift system.',
    ],
    sections: [
      S('Why it matters', 'Each successful flight moves SpaceX closer to routine reuse, the key to its cost goals for Starship.'),
    ],
  }),

  // ===================== APRIL 2026 (archive) =====================
  article({
    headline: 'OpenAI Releases GPT-5.5, Inching Toward an AI “Super App”',
    blurb: 'OpenAI’s GPT-5.5 reached Plus, Pro, Business and Enterprise tiers as the company steers ChatGPT toward an all-in-one assistant that folds many tasks into a single product.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/04/23/openai-chatgpt-gpt-5-5-ai-model-superapp/',
    publishedAt: '2026-04-23T15:00:00Z', imageSeed: 37,
    intro: 'OpenAI’s GPT-5.5 rollout is about more than benchmarks — it’s another step toward turning ChatGPT into an everything app.',
    keyPoints: [
      'GPT-5.5 became widely available across Plus, Pro, Business and Enterprise tiers.',
      'A 5.5 Pro variant targets Pro, Business and Enterprise users.',
      'OpenAI is steering ChatGPT toward an all-in-one “super app”.',
    ],
    sections: [
      S('Why it matters', 'Consolidating chat, tools, agents and commerce into one assistant is a strategic bet that could reshape how people use AI day to day.'),
    ],
  }),
  article({
    headline: 'Linux Cryptographic Code Flaw Offers a Fast Route to Root',
    blurb: 'A vulnerability in Linux cryptographic code could be chained into a quick privilege-escalation to full system control; distributions have shipped fixes.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2026/04/30/linux_cryptographic_code_flaw',
    publishedAt: '2026-04-30T12:00:00Z', imageSeed: 38,
    intro: 'A flaw in Linux cryptographic code offered attackers a fast lane to full system control.',
    keyPoints: [
      'The vulnerability could be chained into a quick privilege-escalation to root.',
      'Distributions issued patches to close it.',
    ],
    sections: [
      S('Why it matters', 'Bugs in low-level cryptographic code are especially dangerous because so much of the stack depends on it.'),
    ],
  }),
  article({
    headline: 'Google Unleashes More AI Security Agents to Fight Cybercriminals',
    blurb: 'Google says it has shifted from human-led to AI-led defence — overseen by people — and plans agentic “fleets” to handle routine security work at machine speed.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2026/04/22/google_unleashes_even_more_ai/',
    publishedAt: '2026-04-22T13:30:00Z', imageSeed: 39,
    intro: 'Google is handing more of its cyber-defence to AI, deploying agents to do routine security work at machine speed under human supervision.',
    keyPoints: [
      'Google said it has moved from human-led to AI-led defence, overseen by people.',
      'It plans agentic “fleets” to handle routine security tasks at machine pace.',
    ],
    sections: [
      S('Why it matters', 'As attacks accelerate, defenders are betting automation is the only way to keep up — raising fresh questions about oversight.'),
    ],
  }),
  article({
    headline: 'AI Agents Uncover Vulnerabilities in a Widely Used Print Server',
    blurb: 'Automated agents discovered multiple flaws in CUPS — the printing system on countless Linux and Unix machines — some of which could enable remote code execution.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/security/2026/04/07/ai-agents-found-vulns-in-this-linux-and-unix-print-server/5221119',
    publishedAt: '2026-04-07T11:15:00Z', imageSeed: 40,
    intro: 'AI agents turned bug-hunter, uncovering serious flaws in CUPS, the printing system found on countless Linux and Unix machines.',
    keyPoints: [
      'Automated agents discovered multiple CUPS vulnerabilities (including CVE-2026-34980 and CVE-2026-34990).',
      'Some of the flaws could enable remote code execution.',
      'The find showcases AI-assisted vulnerability discovery.',
    ],
    sections: [
      S('Why it matters', 'If AI can find exploitable bugs at scale, both defenders and attackers gain a powerful new capability.'),
    ],
  }),

  // ===================== MARCH 2026 (archive) =====================
  article({
    headline: 'Memory Giant SK Hynix Eyes a Blockbuster US IPO Amid the Memory Crunch',
    blurb: 'SK Hynix confidentially filed for a US listing targeted at H2 2026 that could reportedly raise $10–14 billion, as AI demand drives a memory crunch dubbed “RAMmageddon”.',
    category: 'technology', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/03/27/memory-chip-giant-sk-hynix-could-help-end-rammageddon-with-blockbuster-us-ipo/',
    publishedAt: '2026-03-27T14:00:00Z', imageSeed: 41,
    intro: 'Memory giant SK Hynix is preparing a blockbuster US listing, betting the AI-driven memory crunch makes the timing ideal.',
    keyPoints: [
      'SK Hynix confidentially filed paperwork toward a US IPO targeted for the second half of 2026.',
      'Reports peg a potential raise of around $10–14 billion.',
      'Surging AI demand for high-bandwidth memory frames the move — a so-called “RAMmageddon”.',
    ],
    sections: [
      S('Why it matters', 'Memory is a critical, supply-constrained input for AI hardware; a flush SK Hynix could expand capacity faster.'),
    ],
  }),
  article({
    headline: 'AI Chip Startup Rebellions Eyes Global Expansion With a Rack-Scale Platform',
    blurb: 'South Korean AI-chip startup Rebellions unveiled a rack-scale system — a step up from single chips — as it pursues customers beyond its home market.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2026/03/30/rebellions_ai_rackscale/',
    publishedAt: '2026-03-30T10:00:00Z', imageSeed: 42,
    intro: 'South Korean AI-chip startup Rebellions is going bigger, unveiling a rack-scale platform as it eyes customers beyond its home market.',
    keyPoints: [
      'Rebellions introduced a rack-scale AI system, a step up from single chips.',
      'The company is pursuing international expansion.',
    ],
    sections: [
      S('Why it matters', 'Rack-scale designs let challengers compete for the large AI deployments currently dominated by a handful of incumbents.'),
    ],
  }),
  article({
    headline: 'Linux Foundation Moves to Shield Open-Source Developers From AI “Bug Slop”',
    blurb: 'The Linux Foundation is moving to protect volunteer maintainers from a flood of low-quality, AI-generated bug reports, tied to the industry-backed Alpha-Omega security project.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2026/03/18/linux_foundation_ai_slop_defense/',
    publishedAt: '2026-03-18T12:45:00Z', imageSeed: 43,
    intro: 'The Linux Foundation is moving to protect open-source maintainers from a rising tide of low-quality, AI-generated bug reports.',
    keyPoints: [
      'The effort aims to shield volunteer maintainers from AI “bug slop” that wastes their time.',
      'It ties into the Alpha-Omega project, backed by major technology firms.',
      'Contributors including Anthropic, AWS, GitHub, Google, Microsoft and OpenAI have funded open-source security work.',
    ],
    sections: [
      S('Why it matters', 'Maintainer burnout is a genuine threat to the software everyone depends on; filtering the noise is part of keeping it healthy.'),
    ],
  }),
  article({
    headline: 'Scientists Discover Ancient DNA “Switches” Hidden in Plants for 400 Million Years',
    blurb: 'Researchers mapped over 2.3 million conserved regulatory “switches” across plant genomes — some more than 400 million years old — building an atlas that could aid future crop breeding.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/03/260313062533.htm',
    publishedAt: '2026-03-13T09:00:00Z', imageSeed: 44,
    intro: 'Scientists have mapped millions of ancient genetic “switches” in plants — some over 400 million years old — that quietly govern how plant genes behave.',
    keyPoints: [
      'Researchers identified over 2.3 million conserved non-coding sequences acting as regulatory switches across plants.',
      'Some date back more than 400 million years, predating flowering plants.',
      'The team (Cold Spring Harbor Laboratory and collaborators) compared 314 genomes from 284 species using a tool called Conservatory.',
      'The switches keep a consistent genomic order even as spacing changes, and new ones evolve from old.',
    ],
    sections: [
      S('Why it matters', 'The resulting regulatory atlas could aid crop breeding for drought resistance and food security. The study was published in Science.'),
    ],
  }),

  // ===================== FEBRUARY 2026 (archive) =====================
  article({
    headline: 'ChatGPT Reaches 900 Million Weekly Active Users',
    blurb: 'OpenAI’s assistant climbed to roughly 900 million weekly active users with about 50 million paying subscribers, putting the one-billion mark within reach.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users/',
    publishedAt: '2026-02-27T16:30:00Z', imageSeed: 45,
    intro: 'ChatGPT is closing in on a once-unthinkable milestone, with weekly users approaching the one-billion mark.',
    keyPoints: [
      'ChatGPT reached roughly 900 million weekly active users.',
      'OpenAI reported about 50 million paying subscribers.',
      'The company said early 2026 was on track to be its biggest period yet for new subscribers.',
    ],
    sections: [
      S('The bigger picture', 'The figures underline how quickly consumer AI has scaled, and intensify the race among assistants for everyday attention.'),
    ],
  }),
  article({
    headline: 'Google’s Gemini App Surpasses 750 Million Monthly Users',
    blurb: 'Google’s Gemini assistant crossed 750 million monthly active users, propelled by deep integration across Google’s products as the assistant race heats up.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/02/04/googles-gemini-app-has-surpassed-750m-monthly-active-users/',
    publishedAt: '2026-02-04T15:00:00Z', imageSeed: 46,
    intro: 'Google’s Gemini app has become one of the most-used AI assistants in the world, crossing 750 million monthly users.',
    keyPoints: [
      'Gemini surpassed 750 million monthly active users.',
      'Growth was driven by deep integration across Google’s products.',
      'The numbers place Gemini among the largest consumer AI assistants.',
    ],
    sections: [
      S('Why it matters', 'Distribution through Search, Android and Workspace gives Google a powerful on-ramp in the assistant race.'),
    ],
  }),
  article({
    headline: 'India Now Has 100 Million Weekly ChatGPT Users, Sam Altman Says',
    blurb: 'OpenAI’s CEO says India has become one of ChatGPT’s largest markets at 100 million weekly users, shaping priorities like language support and affordability.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/02/15/india-has-100m-weekly-active-chatgpt-users-sam-altman-says/',
    publishedAt: '2026-02-15T12:00:00Z', imageSeed: 47,
    intro: 'India has become one of ChatGPT’s biggest markets, with Sam Altman putting weekly users there at 100 million.',
    keyPoints: [
      'India now has around 100 million weekly ChatGPT users, per OpenAI’s CEO.',
      'It is one of the assistant’s largest and fastest-growing markets.',
    ],
    sections: [
      S('Context', 'Rapid uptake in large, diverse markets shapes product priorities such as language support and affordability.'),
    ],
  }),
  article({
    headline: 'Asia-Based Spies Breached Critical Networks Across 37 Countries',
    blurb: 'Investigators tied a sprawling cyber-espionage campaign to intrusions into critical infrastructure networks across 37 countries, renewing calls to harden essential systems.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/security/2026/02/05/asia-based-spies-hacked-37-countries-critical-networks/4130663',
    publishedAt: '2026-02-05T10:00:00Z', imageSeed: 48,
    intro: 'Investigators have tied a sprawling cyber-espionage campaign to intrusions into critical networks across dozens of countries.',
    keyPoints: [
      'An Asia-based espionage operation reportedly breached critical infrastructure networks in 37 countries.',
      'The campaign targeted high-value networks, raising fresh infrastructure-security concerns.',
    ],
    sections: [
      S('Why it matters', 'Coordinated intrusions into critical systems across borders sharpen the case for hardening essential networks and sharing threat intelligence.'),
    ],
  }),

  // ===================== JANUARY 2026 (archive) =====================
  article({
    headline: 'OpenAI Launches Prism, an AI Workspace Built for Scientists',
    blurb: 'OpenAI introduced Prism, a free web workspace for writing research papers that assesses claims, revises prose, searches prior work and supports LaTeX — built on GPT-5.2.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/01/27/openai-launches-prism-a-new-ai-workspace-for-scientists/',
    publishedAt: '2026-01-27T15:30:00Z', imageSeed: 49,
    intro: 'OpenAI has built a dedicated workspace for scientists, aiming to do for research papers what AI coding tools did for software.',
    keyPoints: [
      'Prism is a web-based workspace for writing scientific papers, free with a ChatGPT account.',
      'It assesses claims, revises prose, searches prior work and supports LaTeX.',
      'It can turn whiteboard sketches into diagrams and gives ChatGPT full project context.',
      'It is built on GPT-5.2 and inspired by AI-native code editors such as Cursor and Windsurf.',
    ],
    sections: [
      S('Why it matters', 'OpenAI says ChatGPT already fields millions of weekly science questions; a purpose-built tool aims to capture serious research workflows.'),
    ],
  }),
  article({
    headline: 'OpenAI Bets Big on Audio as Silicon Valley Declares War on Screens',
    blurb: 'OpenAI reorganised to overhaul its audio models and plans an “audio-first” personal device within a year, as Meta, Google, Tesla and a wave of startups push voice as the next interface.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/01/01/openai-bets-big-on-audio-as-silicon-valley-declares-war-on-screens/',
    publishedAt: '2026-01-01T09:00:00Z', imageSeed: 50,
    intro: 'Silicon Valley is betting the next computing interface is your voice, and OpenAI is reorganising to lead the shift away from screens.',
    keyPoints: [
      'OpenAI unified its teams to overhaul audio models and plans an “audio-first” personal device in about a year.',
      'A new audio model expected in early 2026 aims for natural speech, handling interruptions and talking over users.',
      'Rivals are moving too: Meta’s Ray-Ban glasses, Google’s Audio Overviews, Tesla’s in-car Grok, plus startups making rings and pendants.',
      'OpenAI brought in former Apple design chief Jony Ive via a $6.5B deal, with a stated goal of reducing device addiction.',
    ],
    sections: [
      S('Why it matters', 'If voice becomes the default way to reach AI, it could loosen the smartphone screen’s grip on how people compute.'),
    ],
  }),

  // ===================== NETWORKING =====================
  article({
    headline: '6G Is Taking Shape — but Nobody’s Quite Ready to Pay for It',
    blurb: 'The first 6G specs are expected by 2028 with launches around 2029, but carriers still recouping 5G costs see little consumer demand — and analysts forecast Asia will dominate early adoption.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/networks/2026/05/27/6g-the-next-gen-of-wireless-tech-nobodys-ready-to-pay-for/5246136',
    publishedAt: '2026-05-27T10:00:00Z', imageSeed: 60,
    intro: '6G is moving from research labs toward formal standards — but the industry is openly unsure who will pay for it.',
    keyPoints: [
      '3GPP is expected to publish the first 6G technical specifications by 2028, with launches around 2029.',
      'Analysts forecast 2.9 billion 6G connections by 2035, and roughly 290 million by the end of 2030.',
      'Asia (especially China) is projected to account for about 75% of connections by 2030; the US and South Korea lead early.',
      'Carriers are still recouping 5G spending and see limited consumer demand for another upgrade.',
      'Emerging pieces include reconfigurable intelligent surfaces, satellite integration (SAGIN) and joint communications-and-sensing.',
    ],
    sections: [
      S('The catch', 'One analyst frames 6G as an “unwanted distraction” for telcos. Early use cases are likely enterprise and military before consumers, with events such as the 2028 Los Angeles Olympics floated as testbeds.'),
    ],
  }),
  article({
    headline: 'HPE Ships Its First Juniper–Aruba Collaboration: Self-Driving Wi-Fi',
    blurb: 'HPE’s first post-Juniper product, the Networking 723H Wi-Fi 7 access point, can be run from both Aruba Central and Juniper’s Mist platforms and uses AI to manage networks automatically.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/networks/2026/05/08/hpe-drops-first-juniper-x-aruba-collab-self-driving-wi-fi/5235463',
    publishedAt: '2026-05-08T11:00:00Z', imageSeed: 61,
    intro: 'HPE has shipped the first fruit of its Juniper acquisition: a Wi-Fi 7 access point that blends Aruba and Juniper tech into self-managing networks.',
    keyPoints: [
      'The HPE Networking 723H Wi-Fi 7 access point can be managed from both Aruba Central and Juniper’s Mist platforms.',
      '“Self-driving” AI features detect and avoid reserved RF, optimise capacity during events, fix VLAN mismatches and neutralise rogue DHCP servers.',
      'It leans on Juniper’s Marvis AI plus decades of HPE and Aruba network data.',
      'HPE says it delivered a unified product faster than Cisco managed after buying Meraki.',
    ],
    sections: [
      S('Why it matters', 'The release is an early proof point that HPE can actually combine its two networking portfolios rather than leaving customers to choose between them.'),
    ],
  }),
  article({
    headline: 'Cisco Unveils a 102.4 Tbps Silicon One G300 Switch Chip',
    blurb: 'Cisco’s new Silicon One G300 is a 102.4 Tbps switch chip built for AI clusters — it can connect up to 128,000 GPUs with just 750 switches, versus 2,500 before — taking aim at Broadcom and Nvidia.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/on-prem/2026/02/10/cisco-unveils-1024t-silicon-one-g300-switch-chip/4836608',
    publishedAt: '2026-02-10T09:30:00Z', imageSeed: 62,
    intro: 'Cisco has unveiled switching silicon built for the AI era, squarely targeting the networks that lash together giant GPU clusters.',
    keyPoints: [
      'The Silicon One G300 is a 102.4 Tbps switch chip.',
      'Cisco says it can support up to 128,000 GPUs with just 750 switches, versus 2,500 previously.',
      'Chips, systems and optics are slated to ship later in 2026.',
      'It takes aim at Broadcom’s Tomahawk 6 and Nvidia’s Spectrum-X.',
    ],
    sections: [
      S('Why it matters', 'As AI training clusters balloon, the network fabric becomes a bottleneck — and a major new battleground for chipmakers.'),
    ],
  }),
  article({
    headline: 'Wi-Fi 8 Will Trade Peak Speed for Rock-Solid Reliability',
    blurb: 'The next Wi-Fi standard won’t raise top speeds or add wider channels; instead Wi-Fi 8 focuses on reliability, lower latency and smarter handling of congestion — and isn’t expected mainstream until the late 2020s.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2025/12/26/coming_wifi_8_reliability/',
    publishedAt: '2025-12-26T10:00:00Z', imageSeed: 63,
    intro: 'The next Wi-Fi standard breaks with tradition: instead of chasing record speeds, Wi-Fi 8 is all about connections that just work.',
    keyPoints: [
      'Wi-Fi 8 will not raise peak data rates or add wider channels and higher-order modulation over Wi-Fi 7.',
      'The focus shifts to reliability, lower latency and smarter adaptation to congestion.',
      'Intel’s wireless CTO frames the goal as more dependable, intelligent connectivity.',
      'Mainstream devices aren’t expected until the late 2020s.',
    ],
    sections: [
      S('Why it matters', 'For dense homes and offices, consistent performance often matters more than headline megabits — a notable change of priorities for the standard.'),
    ],
  }),

  // ===================== SMART HOMES =====================
  article({
    headline: 'Matter 1.5 Lands With Security Cameras, Closures and Energy Management',
    blurb: 'The smart-home standard’s biggest update yet finally adds security-camera support — meaning cameras that work across Apple Home, Alexa and Google Home — plus door/window closures and energy management.',
    category: 'smart-homes', source: 'Tom’s Guide',
    sourceUrl: 'https://www.tomsguide.com/home/smart-home/matter-1-5-update-launches-with-3-new-features-including-security-camera-support',
    publishedAt: '2026-05-12T12:00:00Z', imageSeed: 64,
    intro: 'The standard meant to make your smart-home gadgets finally talk to each other just got its most significant upgrade yet — including the camera support it long lacked.',
    keyPoints: [
      'Matter 1.5 adds support for security cameras, door/window closures and energy management.',
      'Camera support means more devices can work across Apple Home, Alexa and Google Home.',
      'Manufacturers are lining up — Aqara’s first Matter camera is expected in the first half of 2026.',
    ],
    sections: [
      S('Why it matters', 'Cameras were a glaring gap in Matter; closing it makes the cross-ecosystem promise far more compelling for buyers wary of lock-in.'),
    ],
  }),
  article({
    headline: 'IKEA’s New Matter Smart-Home Devices Hit Connectivity Snags — Fix Incoming',
    blurb: 'Early adopters report IKEA’s latest Matter devices dropping their connections, but the company says a firmware update is on the way.',
    category: 'smart-homes', source: 'Tom’s Guide',
    sourceUrl: 'https://www.tomsguide.com/home/smart-home/ikeas-new-matter-smart-home-devices-are-struggling-to-stay-connected-but-a-firmware-fix-is-in-the-works',
    publishedAt: '2026-04-15T09:00:00Z', imageSeed: 65,
    intro: 'IKEA’s push into affordable Matter smart-home kit hit a bump, with early buyers reporting devices that won’t stay connected — though a fix is coming.',
    keyPoints: [
      'Owners reported IKEA’s new Matter devices dropping their connections.',
      'IKEA says a firmware update is in the works to resolve the issue.',
    ],
    sections: [
      S('Context', 'Reliability stumbles are common in early Matter rollouts; how quickly vendors patch them shapes trust in the standard.'),
    ],
  }),
  article({
    headline: 'Apple’s Long-Rumoured Smart-Home Hub Slips Further Down the Calendar',
    blurb: 'A new report pushes the expected launch window for Apple’s smart-home hub back again — a device seen as central to Apple competing with Amazon and Google in the connected home.',
    category: 'smart-homes', source: 'Tom’s Guide',
    sourceUrl: 'https://www.tomsguide.com/home/smart-home/apple-smart-home-hub-we-just-got-bad-news-about-the-release-window',
    publishedAt: '2026-03-20T10:30:00Z', imageSeed: 66,
    intro: 'Apple’s long-rumoured smart-home hub has slipped again, leaving HomeKit fans waiting on a centrepiece device.',
    keyPoints: [
      'A new report pushes the hub’s expected launch window back further.',
      'The device is closely tied to Apple’s broader smart-home and Siri ambitions.',
    ],
    sections: [
      S('Why it matters', 'A capable hub is seen as key to Apple competing with Amazon and Google in the connected home; each delay cedes ground.'),
    ],
  }),
  article({
    headline: 'IKEA and Samsung Team Up to Simplify the Affordable Smart Home',
    blurb: 'A new collaboration brings around 25 of IKEA’s Matter-over-Thread devices — bulbs, plugs and more — into Samsung’s SmartThings ecosystem, aiming for cheaper, simpler setup.',
    category: 'smart-homes', source: 'Tom’s Guide',
    sourceUrl: 'https://www.tomsguide.com/home/a-familiar-and-easy-connectivity-experience-without-financial-burden-ikea-and-samsung-want-to-streamline-your-smart-home-heres-how',
    publishedAt: '2026-02-18T11:00:00Z', imageSeed: 67,
    intro: 'IKEA and Samsung are teaming up to make the budget smart home simpler, folding dozens of IKEA devices into the SmartThings ecosystem.',
    keyPoints: [
      'The collaboration brings around 25 IKEA Matter-over-Thread devices — bulbs, plugs and more — to Samsung SmartThings.',
      'The goal is easier setup and a more familiar, low-cost connectivity experience.',
    ],
    sections: [
      S('Why it matters', 'Pairing IKEA’s affordable hardware with Samsung’s hub ecosystem lowers the barrier to a reliable, standards-based smart home.'),
    ],
  }),

  // ===================== DECEMBER 2025 (archive, prior year) =====================
  article({
    headline: 'Nvidia Wants to Fix the Shortage of Strong American Open AI Models',
    blurb: 'Nvidia is expanding its open-weight Nemotron family — including Super and ~500B-parameter Ultra variants — and plans to release weights, training data and RL environments for customisation.',
    category: 'ai', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2025/12/16/nvidia_nemotron',
    publishedAt: '2025-12-16T11:00:00Z', imageSeed: 51,
    intro: 'Nvidia wants to close what it sees as a gap in strong, openly licensed American AI models — and is using its Nemotron family to do it.',
    keyPoints: [
      'Nvidia is expanding Nemotron, its line of open-weight models, with larger Super and Ultra variants.',
      'The Ultra tier is around 500 billion parameters, aimed at complex agentic tasks.',
      'Nvidia plans to release weights, training data and reinforcement-learning environments for customisation.',
    ],
    sections: [
      S('Why it matters', 'Open, inspectable models give developers an alternative to closed APIs — and put pressure on commercial labs to justify their value.'),
    ],
  }),
  article({
    headline: 'Nvidia Bulks Up Its Open-Source AI Push With New Models and an Acquisition',
    blurb: 'Nvidia expanded its open-source AI offerings with fresh models and a strategic acquisition, all aimed at the tooling for building AI agents and autonomous systems.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2025/12/15/nvidia-bulks-up-open-source-offerings-with-an-acquisition-and-new-open-ai-models/',
    publishedAt: '2025-12-15T16:00:00Z', imageSeed: 52,
    intro: 'Nvidia is doubling down on open-source AI, pairing new open models with an acquisition to round out its agent-building stack.',
    keyPoints: [
      'Nvidia added new open models and made an acquisition to strengthen its open-source offerings.',
      'The push centres on tools for building AI agents and autonomous systems.',
    ],
    sections: [
      S('Context', 'The moves fit a broader strategy of seeding the ecosystem that ultimately drives demand for Nvidia hardware.'),
    ],
  }),

  // ===================== OCTOBER 2025 (archive, prior year) =====================
  article({
    headline: 'Nvidia Deepens AI Ties With Hyundai, Samsung, SK and Naver',
    blurb: 'On Jensen Huang’s first South Korea visit in 15 years, Nvidia announced AI partnerships across the country’s biggest firms — spanning memory chips, cloud, robotics and autonomous mobility.',
    category: 'technology', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2025/10/31/nvidia-expands-ai-ties-with-hyundai-samsung-sk-naver/',
    publishedAt: '2025-10-31T13:00:00Z', imageSeed: 53,
    intro: 'On Jensen Huang’s first South Korea visit in 15 years, Nvidia announced a sweep of AI partnerships spanning the country’s biggest companies.',
    keyPoints: [
      'Nvidia deepened AI ties with Hyundai, Samsung, SK and Naver.',
      'The deals span AI memory chips, cloud infrastructure, robotics and autonomous mobility.',
      'SK Group is partnering with Nvidia on an enterprise-led manufacturing AI cloud.',
    ],
    sections: [
      S('Why it matters', 'South Korea’s chip and manufacturing strength makes it a strategic hub for Nvidia’s AI ambitions.'),
    ],
  }),
];

const insertArticle = db.prepare(`
  INSERT INTO articles (
    slug, headline, blurb, body, hero_image, hero_image_alt, hero_credit,
    thumbnail_image, thumbnail_alt, category_id, author, source_name, source_url,
    reading_minutes, featured, published_at
  ) VALUES (
    @slug, @headline, @blurb, @body, @hero_image, @hero_image_alt, @hero_credit,
    @thumbnail_image, @thumbnail_alt, @category_id, @author, @source_name, @source_url,
    @reading_minutes, @featured, @published_at
  )
`);

const insertMany = db.transaction((rows) => {
  for (const r of rows) insertArticle.run(r);
});
insertMany(ARTICLES);

console.log(
  `[seed] Inserted ${CATEGORIES.length} categories and ${ARTICLES.length} real-article cliff-notes summaries.`
);

db.close();
