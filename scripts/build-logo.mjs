// Generate web-ready logo assets from the print-ready master.
//
// The master (public/nerd-news-network-logo-xl.png) is a transparent PNG whose
// "NNN" monogram uses the brand's WHITE + BLACK + RED strokes, with a white
// "NERD NEWS NETWORK" wordmark beneath. We DO NOT recolour it — the brand keeps
// all three colours. Because it contains both white and black elements, it is
// placed on a neutral GREY surface so every colour has contrast.
//
// Outputs:
//   public/logo/logo.png        original-colour lockup (monogram + wordmark)
//   public/logo/og-default.png  1200x630 social card (logo on grey)
//   src/app/icon.png            512px favicon (monogram on a grey rounded tile)
//   src/app/apple-icon.png      180px apple touch icon

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MASTER = join(ROOT, 'public', 'nerd-news-network-logo-xl.png');
const OUT = join(ROOT, 'public', 'logo');
const APP = join(ROOT, 'src', 'app');
mkdirSync(OUT, { recursive: true });

// Brand-neutral grey used behind the logo wherever all three colours must read.
const GREY = '#8a8a8a';
const RED = '#e10a14';

async function run() {
  // --- Full lockup, original colours (just trimmed + resized) ---
  const lockup = await sharp(MASTER).trim({ threshold: 40 }).png().toBuffer();
  await sharp(lockup).resize({ width: 760 }).png({ compressionLevel: 9 }).toFile(join(OUT, 'logo.png'));

  // --- Monogram only (crop off the wordmark band) for square icons ---
  const meta = await sharp(lockup).metadata();
  const mark = await sharp(lockup)
    .extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * 0.74) })
    .trim({ threshold: 40 })
    .png()
    .toBuffer();

  const tile = (size, radius) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
         <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${GREY}"/>
       </svg>`
    );

  async function squareIcon(size, file, pad = 0.16, radius = 0.17) {
    const inner = Math.round(size * (1 - pad * 2));
    const m = await sharp(mark).resize({ width: inner, fit: 'inside' }).toBuffer();
    const dims = await sharp(m).metadata();
    await sharp(tile(size, Math.round(size * radius)))
      .composite([{ input: m, top: Math.round((size - dims.height) / 2), left: Math.round((size - dims.width) / 2) }])
      .png({ compressionLevel: 9 })
      .toFile(file);
  }

  // Next.js App Router picks these up automatically from src/app/.
  await squareIcon(512, join(APP, 'icon.png'));
  await squareIcon(180, join(APP, 'apple-icon.png'), 0.14, 0.22);

  // --- Open Graph / social card: logo on grey with a red base rule ---
  const ogW = 1200, ogH = 630;
  const ogLogo = await sharp(lockup).resize({ width: 720, fit: 'inside' }).toBuffer();
  const lm = await sharp(ogLogo).metadata();
  const ogBg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ogW}" height="${ogH}">
       <rect width="${ogW}" height="${ogH}" fill="${GREY}"/>
       <rect x="0" y="${ogH - 16}" width="${ogW}" height="16" fill="${RED}"/>
     </svg>`
  );
  await sharp(ogBg)
    .composite([{ input: ogLogo, top: Math.round((ogH - lm.height) / 2) - 8, left: Math.round((ogW - lm.width) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, 'og-default.png'));

  console.log('[logo] Wrote logo.png, og-default.png, src/app/icon.png, src/app/apple-icon.png (original colours on grey)');
}

run().catch((e) => {
  console.error('[logo] failed:', e);
  process.exit(1);
});
