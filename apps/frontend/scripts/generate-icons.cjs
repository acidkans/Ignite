/**
 * Jednorazowy generator ikon PWA. Uruchamiać po zmianie brandingu:
 *   node scripts/generate-icons.cjs
 *
 * Wygeneruje:
 *   public/icons/icon-192.png           — 192x192, "any"
 *   public/icons/icon-512.png           — 512x512, "any"
 *   public/icons/icon-maskable-512.png  — 512x512, "maskable" (60% safe zone)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BG = '#0b1220';
const FG = '#3b82f6';
const TEXT_COLOR = '#ffffff';

function svgIcon(size, padRatio) {
    const inner = Math.round(size * (1 - padRatio * 2));
    const offset = Math.round(size * padRatio);
    const radius = Math.round(inner * 0.22);
    const fontSize = Math.round(inner * 0.55);
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <rect x="${offset}" y="${offset}" width="${inner}" height="${inner}" rx="${radius}" ry="${radius}"
        fill="url(#g)" />
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${FG}"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Inter, Arial, sans-serif" font-weight="900" font-size="${fontSize}"
        fill="${TEXT_COLOR}" letter-spacing="-2">G</text>
</svg>`.trim();
}

async function render(size, padRatio, filename) {
    const svg = Buffer.from(svgIcon(size, padRatio));
    const out = path.join(OUT_DIR, filename);
    await sharp(svg).png().toFile(out);
    console.log('  →', filename);
}

(async () => {
    console.log('Generating PWA icons →', OUT_DIR);
    await render(192, 0.08, 'icon-192.png');
    await render(512, 0.08, 'icon-512.png');
    // Maskable: musi mieć ~20% safe zone od krawędzi.
    await render(512, 0.20, 'icon-maskable-512.png');
    console.log('Done.');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
