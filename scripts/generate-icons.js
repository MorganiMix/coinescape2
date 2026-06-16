#!/usr/bin/env node
/**
 * Generate Coin Escape app-icon PNGs from the vector master.
 *
 *   assets/images/coin-escape-icon.svg  →  the razor-sharp source of truth
 *
 * Produces every PNG Expo references in app.json:
 *   - icon.png                      (1024) iOS / general app icon
 *   - android-icon-foreground.png   (432)  adaptive foreground (coin + arrow)
 *   - android-icon-background.png   (432)  adaptive background (charcoal frame)
 *   - android-icon-monochrome.png   (432)  themed-icon silhouette
 *   - splash-icon.png               (200)  splash mark
 *   - favicon.png                   (48)   web favicon
 *
 * Rasterizer: uses `sharp` if installed (npm i -D sharp), otherwise falls back
 * to a CLI tool on PATH — rsvg-convert, ImageMagick (magick/convert), or
 * Inkscape — whichever is found first.
 *
 * Usage:  node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IMG = path.join(ROOT, 'assets', 'images');
const SRC = path.join(IMG, 'coin-escape-icon.svg');

// Adaptive foreground: just the coin + escape arrow on transparency.
const FG_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="coin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9D2DE"/>
    </linearGradient>
    <linearGradient id="escape" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#FF7A3C"/><stop offset="1" stop-color="#E5142B"/>
    </linearGradient>
  </defs>
  <rect x="150" y="560" width="520" height="64" rx="32" fill="url(#escape)" transform="rotate(-45 410 592)"/>
  <path d="M812 150 L862 360 L652 310 Z" fill="#E5142B" transform="rotate(45 757 255)"/>
  <circle cx="560" cy="460" r="232" fill="url(#coin)" stroke="rgba(255,255,255,0.6)" stroke-width="6"/>
  <text x="560" y="460" font-family="Arial, sans-serif" font-size="200" font-weight="900"
        fill="#1A2230" text-anchor="middle" dominant-baseline="central" letter-spacing="4">CE</text>
</svg>`;

const BG_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2A3647"/><stop offset="1" stop-color="#0B1220"/>
  </linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#f)"/>
</svg>`;

const MONO_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="150" y="560" width="520" height="64" rx="32" fill="#FFFFFF" transform="rotate(-45 410 592)"/>
  <path d="M812 150 L862 360 L652 310 Z" fill="#FFFFFF" transform="rotate(45 757 255)"/>
  <circle cx="560" cy="460" r="232" fill="#FFFFFF"/>
</svg>`;

/** target file -> { svg, size } */
const TARGETS = [
  { out: 'icon.png', svg: fs.readFileSync(SRC, 'utf8'), size: 1024 },
  { out: 'android-icon-foreground.png', svg: FG_SVG, size: 432 },
  { out: 'android-icon-background.png', svg: BG_SVG, size: 432 },
  { out: 'android-icon-monochrome.png', svg: MONO_SVG, size: 432 },
  { out: 'splash-icon.png', svg: FG_SVG, size: 200 },
  { out: 'favicon.png', svg: fs.readFileSync(SRC, 'utf8'), size: 48 },
];

function which(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

async function renderWithSharp(svg, size, outPath) {
  const sharp = require('sharp');
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
}

function renderWithCli(svg, size, outPath) {
  const tmp = path.join(IMG, `.__tmp_${size}_${path.basename(outPath)}.svg`);
  fs.writeFileSync(tmp, svg);
  try {
    if (which('rsvg-convert')) {
      execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', outPath, tmp]);
    } else if (which('magick')) {
      execFileSync('magick', ['-background', 'none', '-density', '384', tmp,
        '-resize', `${size}x${size}`, outPath]);
    } else if (which('convert')) {
      execFileSync('convert', ['-background', 'none', '-density', '384', tmp,
        '-resize', `${size}x${size}`, outPath]);
    } else if (which('inkscape')) {
      execFileSync('inkscape', [tmp, '--export-type=png', `--export-filename=${outPath}`,
        `--export-width=${size}`, `--export-height=${size}`]);
    } else {
      throw new Error('NO_RASTERIZER');
    }
  } finally {
    fs.unlinkSync(tmp);
  }
}

(async () => {
  let useSharp = false;
  try {
    require.resolve('sharp');
    useSharp = true;
  } catch {
    useSharp = false;
  }

  if (!useSharp && !which('rsvg-convert') && !which('magick') && !which('convert') && !which('inkscape')) {
    console.error(
      'No rasterizer found. Install one of:\n' +
        '  npm i -D sharp          (recommended, no system deps)\n' +
        '  or rsvg-convert / ImageMagick / Inkscape on PATH\n' +
        `Vector master is ready at: ${path.relative(ROOT, SRC)}`
    );
    process.exit(1);
  }

  for (const t of TARGETS) {
    const outPath = path.join(IMG, t.out);
    if (useSharp) await renderWithSharp(t.svg, t.size, outPath);
    else renderWithCli(t.svg, t.size, outPath);
    console.log(`✓ ${t.out} (${t.size}px)`);
  }
  console.log('\nDone. App icons regenerated from coin-escape-icon.svg');
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
