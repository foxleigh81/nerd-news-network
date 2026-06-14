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
// Each `blurb` and `body` is an original summary written for Nerd News Network
// (an aggregator); the headline, source name, publication date and — crucially
// — the deep link point to the original article so readers can read the full
// piece at the source. Images are placeholders (Picsum) pending the daily
// task supplying real artwork.

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
    body            TEXT NOT NULL,                 -- Markdown article content
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
// Categories
// ---------------------------------------------------------------------------
// Order here defines the order categories appear in the nav (see getCategories).
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

// Build a Markdown body from sections, closing with a credit to the source.
function buildBody({ sections, sourceName }) {
  const parts = [];
  for (const sec of sections) {
    parts.push(`## ${sec.heading}`, '');
    for (const p of sec.paras) parts.push(para(p), '');
    if (sec.list) {
      for (const li of sec.list) parts.push(`- ${li}`);
      parts.push('');
    }
  }
  parts.push(
    `> This is a Nerd News Network summary of original reporting. Read the full story at **${sourceName}** via the links above and below.`,
    ''
  );
  return parts.join('\n');
}

const S = (heading, ...paras) => ({ heading, paras });

function article({ headline, blurb, category, source, sourceUrl, publishedAt, featured = 0, imageSeed, sections, author = 'NNN Staff' }) {
  return {
    slug: slugify(headline),
    headline,
    blurb,
    body: buildBody({ sections, sourceName: source }),
    hero_image: `https://picsum.photos/seed/nnn${imageSeed}/1280/720`,
    hero_image_alt: `Placeholder illustration for the story “${headline}”.`,
    hero_credit: 'Placeholder image — Picsum Photos',
    thumbnail_image: `https://picsum.photos/seed/nnn${imageSeed}/640/360`,
    thumbnail_alt: `Placeholder thumbnail for “${headline}”.`,
    category_id: categoryIds[category],
    author,
    source_name: source,
    source_url: sourceUrl,
    reading_minutes: 3 + (imageSeed % 4),
    featured,
    published_at: publishedAt,
  };
}

// ---------------------------------------------------------------------------
// Articles — real stories, original summaries, deep links to the source.
// ---------------------------------------------------------------------------
const ARTICLES = [
  // ===================== JUNE 2026 (current month) =====================
  article({
    headline: 'James Webb Reveals Two Completely Different Twilights on Ultra-Hot World WASP-121b',
    blurb:
      'New JWST observations show the dawn and dusk edges of the scorching gas giant differ sharply in temperature and chemistry — the clearest evidence yet for atmospheric asymmetry on a distant world.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/06/260611024559.htm',
    publishedAt: '2026-06-11T08:30:00Z', featured: 1, imageSeed: 11,
    sections: [
      S('A tale of two terminators',
        'Astronomers compared infrared starlight filtering through the planet’s atmosphere at its morning and evening edges and found the two are far from identical.',
        'Powerful winds appear to drag heat from the permanent dayside, leaving the evening side hotter and more puffed-up than the morning side.'),
      S('Chemistry on the boundary',
        'The measurements point to water molecules being torn apart at extreme temperatures and recombining elsewhere, while mineral clouds may be shaping the cooler side of the planet.'),
    ],
  }),
  article({
    headline: 'Webb Spots a Hot Jupiter Trailing Twin Gas Tails That Defy Easy Explanation',
    blurb:
      'The James Webb Space Telescope has detected an ultra-hot Jupiter shedding two distinct streams of gas — a configuration researchers are still working to explain.',
    category: 'science', source: 'Space.com',
    sourceUrl: 'https://www.space.com/astronomy/exoplanets/james-webb-space-telescope-discovers-a-hot-jupiter-exoplanet-leaking-twin-gas-tails-that-defy-explanation',
    publishedAt: '2026-06-09T14:10:00Z', imageSeed: 12,
    sections: [
      S('An unexpected silhouette',
        'As the planet passed in front of its star, Webb captured signs of escaping atmosphere forming two separate tails rather than the single trail usually expected.'),
      S('Why it matters',
        'Studying how close-in giant planets lose their atmospheres helps astronomers understand the long-term fate of worlds bathed in intense stellar radiation.'),
    ],
  }),
  article({
    headline: 'NASA’s Nancy Grace Roman Space Telescope Is Complete — and May Launch Months Early',
    blurb:
      'NASA’s next great observatory has finished construction and is being prepared for shipment to Florida, with launch now targeted for as early as autumn 2026.',
    category: 'science', source: 'Space.com',
    sourceUrl: 'https://www.space.com/space-exploration/the-nancy-grace-roman-space-telescope-nasas-next-great-observatory-is-finally-complete',
    publishedAt: '2026-06-07T09:00:00Z', imageSeed: 13,
    sections: [
      S('Ahead of schedule',
        'Engineers have completed assembly of the wide-field observatory and are packing it for the journey to Kennedy Space Center, with the launch window pulled forward from its original 2027 target.'),
      S('What Roman will do',
        'Designed to survey vast swaths of sky, Roman will probe dark energy, hunt for exoplanets and map the structure of the Milky Way in unprecedented breadth.'),
    ],
  }),
  article({
    headline: 'A Satellite-Boosting Spacecraft Gets Set for an Air-Launched Ride to Orbit',
    blurb:
      'Engineers prepared a robotic servicing spacecraft for encapsulation inside an air-launched rocket — part of a growing push toward maintaining and repositioning satellites in orbit.',
    category: 'science', source: 'Space.com',
    sourceUrl: 'https://www.space.com/space-exploration/launches-spacecraft/satellite-boosting-spacecraft-inside-air-launched-rocket-space-photo-of-the-day-for-june-12-2026',
    publishedAt: '2026-06-12T11:45:00Z', imageSeed: 14,
    sections: [
      S('In-orbit servicing takes shape',
        'The robotic vehicle is built to dock with existing satellites and extend their lives — a capability that could reshape how operators think about spacecraft longevity.'),
      S('An unconventional ride',
        'Rather than a traditional pad launch, the spacecraft is set to reach orbit aboard an air-launched rocket released from a carrier aircraft.'),
    ],
  }),
  article({
    headline: 'Giant Underground Neutrino Detector Edges Scientists Closer to Solving the Neutrino Puzzle',
    blurb:
      'China’s JUNO observatory has published its first physics results, delivering some of the most precise measurements yet of how neutrinos change as they travel.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/06/260612032026.htm',
    publishedAt: '2026-06-12T07:20:00Z', imageSeed: 15,
    sections: [
      S('A debut with impact',
        'Using a relatively short stretch of data, researchers sharpened key measurements of neutrino behaviour, boosting confidence the detector can tackle one of particle physics’ deepest open questions.'),
      S('Deep underground',
        'Buried hundreds of metres below ground to shield it from interference, the detector watches for elusive particles streaming from distant nuclear reactors.'),
    ],
  }),
  article({
    headline: 'Ancient DNA Shared With Neanderthals May Help Explain Human Language',
    blurb:
      'A new study suggests tiny regulatory “switches” in our DNA — not genes themselves — may have played an outsized role in the evolution of language.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/06/260611024612.htm',
    publishedAt: '2026-06-11T10:05:00Z', imageSeed: 16,
    sections: [
      S('Volume knobs, not just genes',
        'Researchers point to small regulatory regions that act like volume controls on genes involved in brain development, finding they have a disproportionate influence on language ability.'),
      S('Older than we thought',
        'Because some of these regions are shared with Neanderthals, the work hints that the genetic foundations of language may stretch back much further than previously assumed.'),
    ],
  }),
  article({
    headline: 'Everything Announced at the Summer Game Fest 2026 Showcase',
    blurb:
      'Summer Game Fest’s headline show delivered a packed run of trailers, release dates and surprises spanning every major platform.',
    category: 'gaming', source: 'Game Informer',
    sourceUrl: 'https://gameinformer.com/sgf-2026/2026/06/05/heres-everything-announced-during-the-summer-game-fest-2026-showcase',
    publishedAt: '2026-06-05T18:30:00Z', imageSeed: 17,
    sections: [
      S('A jam-packed night',
        'This year’s live show fired off reveal after reveal, making it one of the busiest editions of the event in recent memory.'),
      S('Something for everyone',
        'From blockbuster sequels to indie debuts, the showcase set the tone for a crowded summer of releases.'),
    ],
  }),
  article({
    headline: 'The Biggest Surprises of Summer Game Fest 2026, From Resident Evil to Final Fantasy 7',
    blurb:
      'A brand-new Resident Evil and the next chapter of the Final Fantasy 7 remake saga headlined the show’s most unexpected reveals.',
    category: 'gaming', source: 'GamesRadar+',
    sourceUrl: 'https://www.gamesradar.com/games/the-6-biggest-surprise-trailers-announcements-reveals-at-summer-game-fest-2026/',
    publishedAt: '2026-06-06T16:00:00Z', imageSeed: 18,
    sections: [
      S('The headline shocks',
        'The show opened strong and kept the surprises coming, including long-rumoured projects finally stepping into the light.'),
      S('Looking to 2027',
        'Several of the biggest reveals carried release windows well into next year, setting up a stacked road ahead.'),
    ],
  }),
  article({
    headline: 'Final Fantasy VII Rebirth Arrives on Switch 2 and Xbox This Week',
    blurb:
      'Square Enix’s acclaimed RPG sequel lands simultaneously on Nintendo Switch 2 and Xbox Series X|S, bringing the remake trilogy to every major platform.',
    category: 'gaming', source: 'Screen Rant',
    sourceUrl: 'https://screenrant.com/final-fantasy-7-rebirth-june-2026-release-psa/',
    publishedAt: '2026-06-03T13:00:00Z', imageSeed: 19,
    sections: [
      S('A milestone for the trilogy',
        'With this release, the second entry in the Final Fantasy 7 remake project becomes playable across all current major platforms.'),
      S('From PS5 to everywhere',
        'Originally a console exclusive, the game’s expanded availability caps a steady rollout that began with its earlier debut.'),
    ],
  }),
  article({
    headline: 'Everything Nintendo Revealed at Its 2026 Summer Direct',
    blurb:
      'Nintendo’s summer presentation rounded out a busy showcase season with a slate of Switch and Switch 2 announcements.',
    category: 'gaming', source: 'Game Informer',
    sourceUrl: 'https://gameinformer.com/nintendo-direct/2026/06/09/heres-everything-announced-during-nintendos-2026-summer-direct',
    publishedAt: '2026-06-09T15:00:00Z', imageSeed: 20,
    sections: [
      S('The summer slate',
        'Nintendo used the Direct to lay out what’s coming to its platforms over the months ahead, mixing new reveals with release dates for known titles.'),
      S('Switch 2 momentum',
        'Several announcements leaned on the newer hardware, underscoring the platform’s growing library.'),
    ],
  }),
  article({
    headline: 'The 25 Most Exciting Games of Summer Game Fest 2026',
    blurb:
      'After a marathon of showcases, these are the standout titles that defined this year’s Summer Game Fest.',
    category: 'gaming', source: 'Game Informer',
    sourceUrl: 'https://gameinformer.com/sgf-2026/2026/06/09/the-25-most-exciting-games-of-summer-game-fest-2026',
    publishedAt: '2026-06-09T12:30:00Z', imageSeed: 21,
    sections: [
      S('The cream of the crop',
        'With dozens of games shown across the week, a handful rose above the rest on the strength of their trailers and ambitions.'),
      S('What to watch',
        'The list spans genres and platforms, offering a useful map of the releases worth keeping an eye on.'),
    ],
  }),
  article({
    headline: 'Every Switch Announcement From Summer Game Fest’s Opening Weekend',
    blurb:
      'A roundup of every Nintendo Switch and Switch 2 reveal from the opening weekend of Summer Game Fest 2026.',
    category: 'gaming', source: 'Nintendo Life',
    sourceUrl: 'https://www.nintendolife.com/news/2026/06/round-up-every-switch-1-and-2-announcement-from-summer-game-fests-weekend-showcases',
    publishedAt: '2026-06-07T10:00:00Z', imageSeed: 22,
    sections: [
      S('A weekend of reveals',
        'Across the opening showcases, a steady stream of titles was confirmed for Nintendo’s current and previous-generation hardware.'),
      S('One handy list',
        'This roundup collects the Switch-relevant announcements in a single place for players catching up.'),
    ],
  }),
  article({
    headline: 'OpenAI Launches New Codex Tools Aimed at White-Collar Work',
    blurb:
      'OpenAI expanded its Codex agent with plug-ins for analytics, design, sales and finance, plus a feature that publishes its output as a hosted website.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/06/02/openai-launches-new-codex-tools-for-white-collar-work/',
    publishedAt: '2026-06-02T17:00:00Z', imageSeed: 23,
    sections: [
      S('Beyond coding',
        'The new plug-ins push Codex toward a broader set of office tasks, targeting roles well outside traditional software development.'),
      S('Fast-growing user base',
        'OpenAI says the agent’s weekly active users have climbed sharply since its desktop app debuted earlier in the year.'),
    ],
  }),

  // ===================== MAY 2026 (archive) =====================
  article({
    headline: 'OpenAI Makes GPT-5.5 Instant the New Default Model for ChatGPT',
    blurb: 'OpenAI rolled out GPT-5.5 Instant as ChatGPT’s standard model, replacing the previous default for most users.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/05/05/openai-releases-gpt-5-5-instant-a-new-default-model-for-chatgpt/',
    publishedAt: '2026-05-05T16:00:00Z', imageSeed: 31,
    sections: [
      S('A new baseline', 'The model becomes the everyday option served to most ChatGPT users.'),
      S('Part of a wider push', 'It follows a string of releases as OpenAI iterates on its flagship assistant.'),
    ],
  }),
  article({
    headline: 'NASA’s New AI Space Chip Could Let Spacecraft Think for Themselves',
    blurb: 'A radiation-hardened processor in testing promises orders-of-magnitude more onboard computing power, enabling far greater spacecraft autonomy.',
    category: 'technology', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/05/260515002134.htm',
    publishedAt: '2026-05-15T09:30:00Z', imageSeed: 32,
    sections: [
      S('A leap in capability', 'The chip is reported to vastly outperform the processors currently flying on spacecraft while surviving harsh radiation.'),
      S('Autonomy in deep space', 'More onboard power means craft can process data and make decisions without waiting for instructions from Earth.'),
    ],
  }),
  article({
    headline: 'Scientists Link a “Time Crystal” to a Real Device in Quantum Breakthrough',
    blurb: 'Researchers connected an exotic phase of matter known as a time crystal to a functioning device, a notable step for quantum technology.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/05/260504154024.htm',
    publishedAt: '2026-05-04T08:00:00Z', imageSeed: 33,
    sections: [
      S('From theory to hardware', 'The work moves a once-abstract concept closer to practical use.'),
      S('Why it matters', 'Bridging exotic physics and real devices could open new avenues for quantum systems.'),
    ],
  }),
  article({
    headline: '“CopyFail” Attackers Begin Cashing In on a Critical Linux Kernel Flaw',
    blurb: 'A serious Linux kernel vulnerability is under active exploitation, prompting urgent patching guidance from security agencies.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/security/2026/05/05/copyfail-attackers-start-cashing-in-on-linux-flaw/5226930',
    publishedAt: '2026-05-05T11:00:00Z', imageSeed: 34,
    sections: [
      S('Exploited in the wild', 'Attackers are abusing the flaw to escalate privileges on affected systems.'),
      S('Patch now', 'Authorities urged administrators to apply fixes without delay.'),
    ],
  }),
  article({
    headline: 'Linux Kernel Flaw Exposes Root-Only Files to Unprivileged Users',
    blurb: 'A newly disclosed kernel vulnerability could let ordinary users read protected files such as SSH keys and password databases.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/security/2026/05/18/linux-kernel-flaw-opens-root-only-files-to-unprivileged-users/5241950',
    publishedAt: '2026-05-18T10:30:00Z', imageSeed: 35,
    sections: [
      S('Reading what shouldn’t be read', 'The bug undermines a core access-control boundary in the kernel.'),
      S('Mitigation', 'Updated kernels address the issue; admins are advised to upgrade promptly.'),
    ],
  }),
  article({
    headline: 'SpaceX’s Starship Flight 12 Splashes Down in the Indian Ocean as Planned',
    blurb: 'The first Starship mission of 2026 completed a suborbital flight, deploying dummy payloads before a controlled splashdown.',
    category: 'science', source: 'Space.com',
    sourceUrl: 'https://www.space.com/news/live/spacex-starship-flight-12-launch-updates-may-22-2026',
    publishedAt: '2026-05-22T23:00:00Z', imageSeed: 36,
    sections: [
      S('A clean test', 'The upper stage flew its planned profile and came down on target in the ocean.'),
      S('Iterating toward reuse', 'Each flight feeds into SpaceX’s push for a rapidly reusable heavy-lift system.'),
    ],
  }),

  // ===================== APRIL 2026 (archive) =====================
  article({
    headline: 'OpenAI Releases GPT-5.5, Inching Toward an AI “Super App”',
    blurb: 'OpenAI’s GPT-5.5 rollout broadened access across its paid tiers as the company pushes ChatGPT toward an all-in-one assistant.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/04/23/openai-chatgpt-gpt-5-5-ai-model-superapp/',
    publishedAt: '2026-04-23T15:00:00Z', imageSeed: 37,
    sections: [
      S('Wider availability', 'The model reached Plus, Pro, Business and Enterprise users.'),
      S('The super-app vision', 'The release reflects OpenAI’s ambition to fold many tasks into a single product.'),
    ],
  }),
  article({
    headline: 'Linux Cryptographic Code Flaw Offers a Fast Route to Root',
    blurb: 'A vulnerability in Linux cryptographic code could give attackers a quick path to full system control.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2026/04/30/linux_cryptographic_code_flaw',
    publishedAt: '2026-04-30T12:00:00Z', imageSeed: 38,
    sections: [
      S('A dangerous shortcut', 'The flaw could be chained into a straightforward privilege-escalation attack.'),
      S('Fixes available', 'Distributions issued updates to close the hole.'),
    ],
  }),
  article({
    headline: 'Google Unleashes More AI Security Agents to Fight Cybercriminals',
    blurb: 'Google is leaning further into AI-led defence, deploying agents to handle routine security work at machine speed under human oversight.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2026/04/22/google_unleashes_even_more_ai/',
    publishedAt: '2026-04-22T13:30:00Z', imageSeed: 39,
    sections: [
      S('Machines on defence', 'The company is shifting toward AI-driven security operations supervised by people.'),
      S('Scaling the SOC', 'Automated agents aim to keep pace with the speed and volume of modern attacks.'),
    ],
  }),
  article({
    headline: 'AI Agents Uncover Vulnerabilities in a Widely Used Print Server',
    blurb: 'Automated agents discovered multiple flaws in the CUPS printing system, some of which could enable remote code execution.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/security/2026/04/07/ai-agents-found-vulns-in-this-linux-and-unix-print-server/5221119',
    publishedAt: '2026-04-07T11:15:00Z', imageSeed: 40,
    sections: [
      S('Bugs found by bots', 'AI tooling surfaced previously unknown weaknesses in the print server.'),
      S('A sign of things to come', 'Automated vulnerability discovery is increasingly part of the security toolkit.'),
    ],
  }),

  // ===================== MARCH 2026 (archive) =====================
  article({
    headline: 'Memory Giant SK Hynix Eyes a Blockbuster US IPO Amid the Memory Crunch',
    blurb: 'SK Hynix is laying the groundwork for a major US listing that could raise billions, against a backdrop of tight memory supply.',
    category: 'technology', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/03/27/memory-chip-giant-sk-hynix-could-help-end-rammageddon-with-blockbuster-us-ipo/',
    publishedAt: '2026-03-27T14:00:00Z', imageSeed: 41,
    sections: [
      S('Going public in the US', 'The chipmaker confidentially filed paperwork toward a listing later in the year.'),
      S('Riding the AI boom', 'Surging demand for memory in AI systems frames the timing of the move.'),
    ],
  }),
  article({
    headline: 'AI Chip Startup Rebellions Eyes Global Expansion With a Rack-Scale Platform',
    blurb: 'The South Korean AI chip company unveiled a rack-scale system as it sets sights on customers beyond its home market.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2026/03/30/rebellions_ai_rackscale/',
    publishedAt: '2026-03-30T10:00:00Z', imageSeed: 42,
    sections: [
      S('Scaling up', 'A rack-scale platform positions the startup to compete for larger AI deployments.'),
      S('Global ambitions', 'The company is looking to expand its footprint internationally.'),
    ],
  }),
  article({
    headline: 'Linux Foundation Moves to Shield Open-Source Developers From AI “Bug Slop”',
    blurb: 'The Linux Foundation outlined efforts to protect maintainers from a flood of low-quality, AI-generated bug reports.',
    category: 'technology', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2026/03/18/linux_foundation_ai_slop_defense/',
    publishedAt: '2026-03-18T12:45:00Z', imageSeed: 43,
    sections: [
      S('Protecting maintainers', 'The initiative aims to reduce the burden of noisy, automated submissions on volunteers.'),
      S('Quality over quantity', 'The effort underscores growing tension between AI tooling and open-source workflows.'),
    ],
  }),
  article({
    headline: 'Scientists Discover Ancient DNA “Switches” Hidden in Plants for 400 Million Years',
    blurb: 'Researchers identified long-preserved regulatory elements in plant genomes, offering a window into deep evolutionary history.',
    category: 'science', source: 'ScienceDaily',
    sourceUrl: 'https://www.sciencedaily.com/releases/2026/03/260313062533.htm',
    publishedAt: '2026-03-13T09:00:00Z', imageSeed: 44,
    sections: [
      S('Switches that lasted', 'The regulatory regions appear to have persisted across hundreds of millions of years.'),
      S('Reading deep time', 'Such conserved elements help scientists trace how plant genomes evolved.'),
    ],
  }),

  // ===================== FEBRUARY 2026 (archive) =====================
  article({
    headline: 'ChatGPT Reaches 900 Million Weekly Active Users',
    blurb: 'OpenAI’s assistant climbed to roughly 900 million weekly users, putting the one-billion mark within reach.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users/',
    publishedAt: '2026-02-27T16:30:00Z', imageSeed: 45,
    sections: [
      S('Approaching a billion', 'The milestone underscores the scale of consumer AI adoption.'),
      S('Paying users grow too', 'OpenAI also reported strong momentum in subscriptions.'),
    ],
  }),
  article({
    headline: 'Google’s Gemini App Surpasses 750 Million Monthly Users',
    blurb: 'Google’s Gemini assistant crossed 750 million monthly active users as the AI assistant race intensifies.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/02/04/googles-gemini-app-has-surpassed-750m-monthly-active-users/',
    publishedAt: '2026-02-04T15:00:00Z', imageSeed: 46,
    sections: [
      S('Rapid growth', 'Gemini’s user base expanded quickly across Google’s products.'),
      S('A crowded field', 'The numbers highlight fierce competition among AI assistants.'),
    ],
  }),
  article({
    headline: 'India Now Has 100 Million Weekly ChatGPT Users, Sam Altman Says',
    blurb: 'OpenAI’s chief executive said India has become one of ChatGPT’s largest markets, with 100 million weekly users.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/02/15/india-has-100m-weekly-active-chatgpt-users-sam-altman-says/',
    publishedAt: '2026-02-15T12:00:00Z', imageSeed: 47,
    sections: [
      S('A key market', 'India’s rapid uptake reflects broad global demand for AI assistants.'),
      S('Localisation matters', 'Growth in large, diverse markets shapes how these tools evolve.'),
    ],
  }),
  article({
    headline: 'Asia-Based Spies Breached Critical Networks Across 37 Countries',
    blurb: 'Investigators linked a sweeping espionage campaign to intrusions into critical infrastructure networks in dozens of countries.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/security/2026/02/05/asia-based-spies-hacked-37-countries-critical-networks/4130663',
    publishedAt: '2026-02-05T10:00:00Z', imageSeed: 48,
    sections: [
      S('A broad campaign', 'The operation reportedly reached critical networks across many nations.'),
      S('Hardening defences', 'The findings renewed calls to shore up infrastructure security.'),
    ],
  }),

  // ===================== JANUARY 2026 (archive) =====================
  article({
    headline: 'OpenAI Launches Prism, an AI Workspace Built for Scientists',
    blurb: 'OpenAI introduced Prism, a workspace tailored to scientific research workflows.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/01/27/openai-launches-prism-a-new-ai-workspace-for-scientists/',
    publishedAt: '2026-01-27T15:30:00Z', imageSeed: 49,
    sections: [
      S('Tools for research', 'Prism targets the specific needs of scientists working with AI.'),
      S('Specialised products', 'The launch reflects a trend toward domain-focused AI tooling.'),
    ],
  }),
  article({
    headline: 'OpenAI Bets Big on Audio as Silicon Valley Declares War on Screens',
    blurb: 'OpenAI signalled a major push into audio interfaces amid a broader industry move beyond traditional screens.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2026/01/01/openai-bets-big-on-audio-as-silicon-valley-declares-war-on-screens/',
    publishedAt: '2026-01-01T09:00:00Z', imageSeed: 50,
    sections: [
      S('Voice first', 'Audio-centric interaction is emerging as a key battleground.'),
      S('Beyond the screen', 'Several companies are exploring less screen-dependent computing.'),
    ],
  }),

  // ===================== DECEMBER 2025 (archive, prior year) =====================
  article({
    headline: 'Nvidia Wants to Fix the Shortage of Strong American Open AI Models',
    blurb: 'Nvidia outlined plans to bolster the field of openly available US-built AI models with its Nemotron family.',
    category: 'ai', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2025/12/16/nvidia_nemotron',
    publishedAt: '2025-12-16T11:00:00Z', imageSeed: 51,
    sections: [
      S('Open by design', 'Nvidia positioned the effort as a boost for open-weight models.'),
      S('Why it matters', 'Strong open models give developers inspectable, customisable alternatives.'),
    ],
  }),
  article({
    headline: 'Nvidia Bulks Up Its Open-Source AI Push With New Models and an Acquisition',
    blurb: 'Nvidia expanded its open-source AI offerings with fresh models and a strategic acquisition.',
    category: 'ai', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2025/12/15/nvidia-bulks-up-open-source-offerings-with-an-acquisition-and-new-open-ai-models/',
    publishedAt: '2025-12-15T16:00:00Z', imageSeed: 52,
    sections: [
      S('Growing the stack', 'New open models broaden the tools available for building AI agents.'),
      S('Buying in', 'An acquisition rounds out the company’s open-source strategy.'),
    ],
  }),

  // ===================== NETWORKING =====================
  article({
    headline: '6G Is Taking Shape — but Nobody’s Quite Ready to Pay for It',
    blurb: 'The next generation of wireless is advancing through the standards bodies, even as carriers and users question who will foot the bill.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/networks/2026/05/27/6g-the-next-gen-of-wireless-tech-nobodys-ready-to-pay-for/5246136',
    publishedAt: '2026-05-27T10:00:00Z', imageSeed: 60,
    sections: [
      S('Standards first, demand later', 'The first 6G specifications are expected in the coming years, but the commercial case remains unproven.'),
      S('Who pays?', 'Operators are wary of funding another costly upgrade cycle without clear demand.'),
    ],
  }),
  article({
    headline: 'HPE Ships Its First Juniper–Aruba Collaboration: Self-Driving Wi-Fi',
    blurb: 'Following its Juniper acquisition, HPE debuts AI-driven networking that aims to manage and tune wireless networks automatically.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/networks/2026/05/08/hpe-drops-first-juniper-x-aruba-collab-self-driving-wi-fi/5235463',
    publishedAt: '2026-05-08T11:00:00Z', imageSeed: 61,
    sections: [
      S('Two portfolios, one stack', 'The release blends Aruba and Juniper technology into a single AI-managed networking offering.'),
      S('Hands-off operations', 'The pitch is networks that tune and heal themselves with less manual intervention.'),
    ],
  }),
  article({
    headline: 'Cisco Unveils a 102.4 Tbps Silicon One G300 Switch Chip',
    blurb: 'Cisco’s new switching silicon targets massive AI clusters, promising to connect tens of thousands of GPUs with far fewer switches.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/on-prem/2026/02/10/cisco-unveils-1024t-silicon-one-g300-switch-chip/4836608',
    publishedAt: '2026-02-10T09:30:00Z', imageSeed: 62,
    sections: [
      S('Bandwidth for AI', 'The chip squarely targets the networking demands of large GPU clusters.'),
      S('Fewer boxes', 'A higher port count means the same fabric can be built with a fraction of the switches.'),
    ],
  }),
  article({
    headline: 'Wi-Fi 8 Will Trade Peak Speed for Rock-Solid Reliability',
    blurb: 'The next Wi-Fi standard won’t raise top speeds — instead it focuses on consistent, low-latency connections in congested environments.',
    category: 'networking', source: 'The Register',
    sourceUrl: 'https://www.theregister.com/2025/12/26/coming_wifi_8_reliability/',
    publishedAt: '2025-12-26T10:00:00Z', imageSeed: 63,
    sections: [
      S('Reliability over records', 'Rather than chasing headline speeds, Wi-Fi 8 prioritises dependable performance.'),
      S('Years away', 'Mainstream devices aren’t expected for a while yet.'),
    ],
  }),

  // ===================== SMART HOMES =====================
  article({
    headline: 'Matter 1.5 Lands With Security Cameras, Closures and Energy Management',
    blurb: 'The smart-home standard’s latest update finally brings camera support, opening the door to cross-ecosystem security devices.',
    category: 'smart-homes', source: 'Tom’s Guide',
    sourceUrl: 'https://www.tomsguide.com/home/smart-home/matter-1-5-update-launches-with-3-new-features-including-security-camera-support',
    publishedAt: '2026-05-12T12:00:00Z', imageSeed: 64,
    sections: [
      S('Cameras join the fold', 'Matter 1.5 adds support for security cameras across compatible ecosystems.'),
      S('More than video', 'The update also covers window and door closures and energy management.'),
    ],
  }),
  article({
    headline: 'IKEA’s New Matter Smart-Home Devices Hit Connectivity Snags — Fix Incoming',
    blurb: 'Early adopters report dropouts with IKEA’s latest Matter devices, but the company says a firmware fix is on the way.',
    category: 'smart-homes', source: 'Tom’s Guide',
    sourceUrl: 'https://www.tomsguide.com/home/smart-home/ikeas-new-matter-smart-home-devices-are-struggling-to-stay-connected-but-a-firmware-fix-is-in-the-works',
    publishedAt: '2026-04-15T09:00:00Z', imageSeed: 65,
    sections: [
      S('Teething problems', 'Some users found the new devices struggling to stay connected.'),
      S('A fix in the works', 'IKEA says a firmware update will address the issue.'),
    ],
  }),
  article({
    headline: 'Apple’s Long-Rumoured Smart-Home Hub Slips Further Down the Calendar',
    blurb: 'A new report pushes the expected launch window for Apple’s smart-home hub back again, testing the patience of HomeKit fans.',
    category: 'smart-homes', source: 'Tom’s Guide',
    sourceUrl: 'https://www.tomsguide.com/home/smart-home/apple-smart-home-hub-we-just-got-bad-news-about-the-release-window',
    publishedAt: '2026-03-20T10:30:00Z', imageSeed: 66,
    sections: [
      S('Another delay', 'The device’s release window appears to have slipped again.'),
      S('Tied to Siri', 'The hub is closely linked to Apple’s broader smart-home ambitions.'),
    ],
  }),
  article({
    headline: 'IKEA and Samsung Team Up to Simplify the Affordable Smart Home',
    blurb: 'A new collaboration brings dozens of IKEA’s Matter-over-Thread devices into Samsung’s SmartThings ecosystem.',
    category: 'smart-homes', source: 'Tom’s Guide',
    sourceUrl: 'https://www.tomsguide.com/home/a-familiar-and-easy-connectivity-experience-without-financial-burden-ikea-and-samsung-want-to-streamline-your-smart-home-heres-how',
    publishedAt: '2026-02-18T11:00:00Z', imageSeed: 67,
    sections: [
      S('Cheaper, simpler', 'The tie-up aims to make budget smart-home kit easier to set up.'),
      S('Matter over Thread', 'Dozens of IKEA devices gain SmartThings support.'),
    ],
  }),

  // ===================== OCTOBER 2025 (archive, prior year) =====================
  article({
    headline: 'Nvidia Deepens AI Ties With Hyundai, Samsung, SK and Naver',
    blurb: 'Nvidia announced a sweep of AI partnerships with major South Korean firms spanning chips, cloud, robotics and mobility.',
    category: 'technology', source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/2025/10/31/nvidia-expands-ai-ties-with-hyundai-samsung-sk-naver/',
    publishedAt: '2025-10-31T13:00:00Z', imageSeed: 53,
    sections: [
      S('A broad alliance', 'The agreements touch memory chips, cloud infrastructure, robotics and autonomous mobility.'),
      S('Building an AI hub', 'The partnerships deepen Nvidia’s footprint across the South Korean tech sector.'),
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
  `[seed] Inserted ${CATEGORIES.length} categories and ${ARTICLES.length} real-article summaries.`
);

db.close();
