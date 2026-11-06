// Genera le icone dell'app (PNG) da un disegno SVG, con Chromium di Playwright.
// Uso: node scripts/make-icons.ts   (scrive in public/icons/)
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

/** Una carta inclinata con una linea di scansione; `pad` lascia margine per le icone "maskable". */
const svg = (size: number, pad: number): string => {
  const s = size;
  const inner = s * (1 - 2 * pad);
  const cx = s / 2;
  const w = inner * 0.5;
  const h = inner * 0.7;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#0b0d12"/>
  <g transform="rotate(-8 ${cx} ${cx})">
    <rect x="${cx - w / 2}" y="${cx - h / 2}" width="${w}" height="${h}" rx="${s * 0.04}" fill="#151922" stroke="#ffd24a" stroke-width="${s * 0.025}"/>
    <rect x="${cx - w / 2 + s * 0.04}" y="${cx - h / 2 + s * 0.04}" width="${w - s * 0.08}" height="${h * 0.45}" rx="${s * 0.02}" fill="#1d2330"/>
    <rect x="${cx - w * 0.62}" y="${cx + h * 0.05}" width="${w * 1.24}" height="${s * 0.03}" rx="${s * 0.015}" fill="#ffd24a"/>
  </g>
</svg>`;
};

const outputs: [string, number, number][] = [
  ['icon-192.png', 192, 0.1],
  ['icon-512.png', 512, 0.1],
  ['icon-maskable-512.png', 512, 0.22],
  ['apple-touch-icon.png', 180, 0.08],
];

await mkdir('public/icons', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg(size, pad)}</body>`);
  await writeFile(`public/icons/${name}`, await page.screenshot({ type: 'png' }));
  console.log(`${name} (${size}x${size})`);
}
await browser.close();
