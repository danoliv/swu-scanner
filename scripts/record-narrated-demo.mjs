// Registra una demo narrata in inglese: video del sito + voce (un file .wav per frase).
// 1. Genera le frasi:  python3 e say-it (vedi scripts/demo-narration.en.json → demo/narration/N.wav)
// 2. Registra e monta:  node scripts/record-narrated-demo.mjs <foto.jpg> [cartella]
// Ogni passo dura almeno quanto la sua frase; l'audio parte quando il passo inizia.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const [photo, outDir = 'demo'] = process.argv.slice(2);
if (!photo) throw new Error('Uso: node scripts/record-narrated-demo.mjs <foto.jpg> [cartella]');
const base = process.env.DEMO_URL ?? 'https://danoliv.github.io/swu-scanner/';
const lines = JSON.parse(readFileSync('scripts/demo-narration.en.json', 'utf8'));
const durations = lines.map((_, i) =>
  Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      `${outDir}/narration/${i}.wav`,
    ])
      .toString()
      .trim(),
  ),
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  locale: 'en-US',
  colorScheme: 'dark',
  permissions: ['clipboard-read', 'clipboard-write'],
  recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const t0 = Date.now();
const starts = [];

/** Un passo: la frase parte ora, l'azione corre insieme, si va avanti a frase e azione finite. */
async function step(i, action) {
  starts[i] = (Date.now() - t0) / 1000;
  await Promise.all([action(), pause(durations[i] * 1000 + 700)]);
}

await page.goto(base);
const download = page.getByTestId('setup-download');
await pause(1200);
if (await download.isVisible().catch(() => false)) await download.click();
await page.getByTestId('photo-gallery').waitFor({ state: 'attached', timeout: 120_000 });

const rows = page.getByTestId('review-row');

await step(0, async () => {}); // la schermata iniziale
await step(1, async () => {
  await page.getByTestId('photo-gallery').setInputFiles(photo);
  await page.getByTestId('found').waitFor({ timeout: 200_000 });
});
await step(2, async () => {
  await pause(1500);
  await page.mouse.wheel(0, 250);
  await pause(1500);
  await page.mouse.wheel(0, -250);
});
await step(3, async () => {
  await pause(600);
  await rows.first().locator('.row-head').click();
  await pause(1500);
  const select = rows.first().getByTestId('language-select');
  await select.selectOption('en');
  await pause(1800);
  await select.selectOption('fr');
});
await step(4, async () => {
  await rows.first().locator('.versions .chip').first().click();
  await pause(1200);
  await rows.first().locator('.row-head').click();
  for (const i of [1, 2]) {
    await rows.nth(i).locator('.row-head').click();
    await pause(700);
    await rows.nth(i).locator('.versions .chip').first().click();
    await pause(900);
    await rows.nth(i).locator('.row-head').click();
  }
});
await step(5, async () => {
  await page.getByTestId('confirm').click();
  await page.getByTestId('total').waitFor();
  await pause(2500);
  await page.mouse.wheel(0, 350);
  await pause(1500);
  await page.mouse.wheel(0, -350);
});
await step(6, async () => {
  await pause(1000);
  await page.getByTestId('share').click();
  await page.getByText('Link copied').waitFor({ timeout: 10_000 });
});
await step(7, async () => {});
await pause(800);
await context.close();
await browser.close();

// Montaggio: si taglia l'avvio (scaricamento del modello) e si mettono le frasi ai loro istanti.
const webm = execFileSync('sh', ['-c', `ls -t ${outDir}/page@*.webm | head -1`])
  .toString()
  .trim();
const trim = Math.max(0, starts[0] - 0.8);
const delay = (i) => Math.round((starts[i] - trim) * 1000);
const inputs = lines.flatMap((_, i) => ['-i', `${outDir}/narration/${i}.wav`]);
const filter =
  lines.map((_, i) => `[${i + 1}:a]adelay=${delay(i)}|${delay(i)}[a${i}]`).join(';') +
  ';' +
  lines.map((_, i) => `[a${i}]`).join('') +
  `amix=inputs=${lines.length}:normalize=0[a]`;
execFileSync(
  'ffmpeg',
  [
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(trim),
    '-i',
    webm,
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '0:v',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-shortest',
    `${outDir}/demo-narrated.mp4`,
  ],
  { stdio: 'inherit' },
);
console.log(
  'Pronto:',
  `${outDir}/demo-narrated.mp4`,
  'tagliato',
  trim.toFixed(1),
  's; passi',
  starts.map((s) => s.toFixed(1)).join(', '),
);
