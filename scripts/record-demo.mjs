// Registra una demo dell'app su un viewport da telefono (video .webm).
// Uso: npm run build && npx vite preview --port 4173 & node scripts/record-demo.mjs <foto.jpg> [uscita-dir]
import { chromium, devices } from '@playwright/test';

const [photo, outDir = 'demo'] = process.argv.slice(2);
if (!photo) throw new Error('Uso: node scripts/record-demo.mjs <foto.jpg> [uscita-dir]');
const base = process.env.DEMO_URL ?? 'http://127.0.0.1:4173/';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  locale: 'en-US',
  colorScheme: 'dark',
  recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
await page.goto(base);
await pause(1500);
const download = page.getByTestId('setup-download');
if (await download.isVisible().catch(() => false)) {
  await download.click();
}
await page.getByTestId('photo-gallery').waitFor({ state: 'attached', timeout: 90_000 });
await pause(2000); // la schermata iniziale, con il titolo
await page.getByTestId('photo-gallery').setInputFiles(photo);
await page.getByTestId('found').waitFor({ timeout: 200_000 });
await pause(2500);
const rows = page.getByTestId('review-row');
if ((await rows.count()) > 0) {
  await rows.first().scrollIntoViewIfNeeded();
  await pause(1500);
}
await page.getByTestId('confirm').click();
await page.getByTestId('total').waitFor();
await pause(3500);
await page.mouse.wheel(0, 500);
await pause(2000);
await context.close(); // salva il video
await browser.close();
