// Registra una demo dell'app su un viewport da telefono (video .webm): foto, avanzamento della
// lettura, lingua e versione delle carte, lista con totale e condivisione.
// Uso: node scripts/record-demo.mjs <foto.jpg> [cartella-uscita]
// L'indirizzo è quello pubblicato; per l'anteprima locale: DEMO_URL=http://127.0.0.1:4173/
import { chromium, devices } from '@playwright/test';

const [photo, outDir = 'demo'] = process.argv.slice(2);
if (!photo) throw new Error('Uso: node scripts/record-demo.mjs <foto.jpg> [cartella-uscita]');
const base = process.env.DEMO_URL ?? 'https://danoliv.github.io/swu-scanner/';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  locale: process.env.DEMO_LOCALE ?? 'it-IT',
  colorScheme: 'dark',
  permissions: ['clipboard-read', 'clipboard-write'],
  recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
await page.goto(base);
await pause(1500);
const download = page.getByTestId('setup-download');
if (await download.isVisible().catch(() => false)) await download.click();
await page.getByTestId('photo-gallery').waitFor({ state: 'attached', timeout: 120_000 });
await pause(2500); // la schermata iniziale, con il nome dell'app

await page.getByTestId('photo-gallery').setInputFiles(photo);
await page.getByTestId('found').waitFor({ timeout: 200_000 }); // intanto la barra avanza
await pause(2500);

// Le prime tre carte: si apre la riga, si cambia la lingua nella prima, si sceglie la versione.
const rows = page.getByTestId('review-row');
for (let i = 0; i < 3; i++) {
  const row = rows.nth(i);
  await row.locator('.row-head').click();
  await pause(1200);
  if (i === 0) {
    const select = row.getByTestId('language-select');
    await select.scrollIntoViewIfNeeded();
    await pause(1200);
    await select.selectOption('en');
    await pause(1800);
    await select.selectOption('fr');
    await pause(1500);
  }
  await row.locator('.versions .chip').first().click();
  await pause(1200);
  await row.locator('.row-head').click(); // si richiude
  await pause(600);
}

await page.getByTestId('confirm').click();
await page.getByTestId('total').waitFor();
await pause(3000);
await page.mouse.wheel(0, 400);
await pause(1500);
await page.mouse.wheel(0, -400);
await pause(800);
await page.getByTestId('share').click();
await page.getByText(/Link copiato|Link copied/).waitFor({ timeout: 10_000 });
await pause(3000);

await context.close(); // salva il video
await browser.close();
