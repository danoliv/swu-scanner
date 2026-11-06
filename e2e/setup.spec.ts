import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const hasModels = existsSync('public/models/manifest.json');

test.describe('primo avvio: scelta e scaricamento del modello di lettura', () => {
  test.skip(!hasModels, 'servono i modelli (npm run assets)');

  test('mostra la scelta Leggero/Preciso con le dimensioni prima di scaricare', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Get ready to scan' })).toBeVisible();
    await expect(page.getByText(/Light · \d+ MB/)).toBeVisible();
    await expect(page.getByText(/Precise · \d+ MB/)).toBeVisible();
    // Leggero preselezionato
    await expect(page.getByRole('radio', { name: /Light/ })).toBeChecked();
    // senza la pagina di scansione non ci sono le schede
    await expect(page.getByTestId('tab-scan')).toHaveCount(0);
  });

  test('scarica il modello scelto, lo tiene in cache e non lo richiede al riavvio', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('setup-download').click();
    await expect(page.getByTestId('tab-scan')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('photo-gallery')).toBeAttached();
    // al riavvio il modello è in cache: niente pagina del primo avvio
    await page.reload();
    await expect(page.getByTestId('tab-scan')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Get ready to scan' })).toHaveCount(0);
  });

  test('un errore di rete durante lo scaricamento mostra il messaggio e permette di riprovare', async ({
    page,
  }) => {
    await page.route('**/models/*.onnx', (route) => route.abort());
    await page.goto('/');
    await page.getByTestId('setup-download').click();
    await expect(page.getByRole('alert')).toContainText('Download failed');
    await page.unroute('**/models/*.onnx');
    await page.getByRole('button', { name: /Try again/ }).click();
    await expect(page.getByTestId('tab-scan')).toBeVisible({ timeout: 60_000 });
  });

  test('un file del modello alterato non viene usato', async ({ page }) => {
    await page.route('**/models/PP-OCRv6_rec_tiny.onnx', (route) =>
      route.fulfill({ status: 200, body: Buffer.from('non sono un modello') }),
    );
    await page.goto('/');
    await page.getByTestId('setup-download').click();
    await expect(page.getByRole('alert')).toContainText('Download failed');
    await expect(page.getByTestId('tab-scan')).toHaveCount(0);
  });
});

// Scansione vera con il motore del sito: serve una foto (fuori dal repo) indicata da SWU_E2E_PHOTO.
test('scansione vera di una foto con il modello Leggero', async ({ page }) => {
  const photo = process.env.SWU_E2E_PHOTO;
  test.skip(!hasModels || !photo || !existsSync(photo), 'servono modelli e SWU_E2E_PHOTO');
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByTestId('setup-download').click();
  await expect(page.getByTestId('photo-gallery')).toBeAttached({ timeout: 90_000 });
  await page.getByTestId('photo-gallery').setInputFiles(photo as string);
  await expect(page.getByTestId('found')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByTestId('review-row').first()).toBeVisible();
});

test.describe('uso offline', () => {
  test.skip(!hasModels, 'servono i modelli (npm run assets)');

  test("dopo il primo uso l'app si apre e scansiona senza rete", async ({ page, context }) => {
    const photo = process.env.SWU_E2E_PHOTO;
    test.skip(!photo || !existsSync(photo), 'serve SWU_E2E_PHOTO');
    test.setTimeout(300_000);
    await page.goto('/');
    await page.getByTestId('setup-download').click();
    await expect(page.getByTestId('photo-gallery')).toBeAttached({ timeout: 90_000 });
    // una prima scansione carica il worker e il motore WASM e li mette in cache
    await page.getByTestId('photo-gallery').setInputFiles(photo as string);
    await expect(page.getByTestId('found')).toBeVisible({ timeout: 200_000 });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('tab-scan')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('photo-gallery')).toBeAttached({ timeout: 90_000 });
    await page.getByTestId('photo-gallery').setInputFiles(photo as string);
    await expect(page.getByTestId('found')).toBeVisible({ timeout: 200_000 });
    await context.setOffline(false);
  });
});
