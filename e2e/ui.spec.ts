import { expect, test, type APIRequestContext } from '@playwright/test';
import { FAKE_PHOTO, mockScanner, scanAndConfirmAll } from './helpers.ts';

test.describe('più foto', () => {
  test("durante la revisione si può scattare un'altra foto e le carte si aggiungono", async ({
    page,
  }) => {
    await mockScanner(page);
    await page.goto('/');
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    await expect(page.getByTestId('found')).toHaveText('3 cards found');
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    await expect(page.getByTestId('found')).toHaveText('6 cards found');
    await expect(page.getByRole('button', { name: 'Take a photo' })).toBeVisible();
  });
});

test.describe('data dei prezzi', () => {
  /** La data dei prezzi pubblicati: dipende dai dati del giorno, quindi l'orologio si fissa rispetto a lei. */
  async function priceDate(request: APIRequestContext): Promise<Date> {
    const meta = (await (await request.get('/data/meta.json')).json()) as { priceDate: string };
    return new Date(meta.priceDate);
  }
  const days = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);

  test('si vede sempre e avvisa se i prezzi sono vecchi', async ({ page, request }) => {
    await mockScanner(page);
    await page.clock.install({ time: days(await priceDate(request), 10) });
    await page.goto('/');
    await expect(page.getByTestId('price-date')).toContainText('Prices of');
    await expect(page.getByTestId('price-date')).toContainText('days old');
    await page.getByTestId('tab-list').click();
    await expect(page.getByTestId('price-date')).toBeVisible();
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('price-date')).toBeVisible();
  });

  test("con prezzi recenti non c'è nessun avviso", async ({ page, request }) => {
    await mockScanner(page);
    await page.clock.install({ time: days(await priceDate(request), 1) });
    await page.goto('/');
    await expect(page.getByTestId('price-date')).toContainText('Prices of');
    await expect(page.getByTestId('price-date')).not.toContainText('days old');
  });
});

test.describe('totale con carte da scegliere', () => {
  test("al tocco mostra l'intervallo minimo-massimo e si richiude", async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await scanAndConfirmAll(page);
    await expect(page.getByTestId('range')).toHaveCount(0);
    await page.getByTestId('to-choose').click();
    await expect(page.getByTestId('range')).toContainText('Once you choose: from');
    await expect(page.getByTestId('range')).toContainText('€');
    await page.getByTestId('to-choose').click();
    await expect(page.getByTestId('range')).toHaveCount(0);
  });
});

test.describe('annulla', () => {
  test.beforeEach(async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
  });

  test('rimuovere una voce dalla lista si può annullare', async ({ page }) => {
    await scanAndConfirmAll(page);
    await page.getByTestId('list-row').first().getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('list-row')).toHaveCount(2);
    await expect(page.getByTestId('toast')).toContainText('Card removed');
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('list-row')).toHaveCount(3);
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test('svuotare la lista si può annullare', async ({ page }) => {
    await scanAndConfirmAll(page);
    await page.getByRole('button', { name: 'Clear list' }).click();
    await page.getByRole('button', { name: 'Clear list?' }).click();
    await expect(page.getByTestId('list-row')).toHaveCount(0);
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('list-row')).toHaveCount(3);
  });

  test('scartare una carta rilevata si può annullare', async ({ page }) => {
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    await page.getByTestId('review-row').first().getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByTestId('found')).toHaveText('2 cards found');
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('found')).toHaveText('3 cards found');
  });

  test("l'annullamento scade da solo", async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await scanAndConfirmAll(page);
    await page.getByTestId('list-row').first().getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await page.clock.fastForward(9000);
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });
});

test.describe('installazione', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  test('su iPhone suggerisce Condividi, Aggiungi a Home, e si può chiudere per sempre', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: IPHONE,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      locale: 'it-IT',
    });
    const page = await context.newPage();
    await mockScanner(page);
    await page.goto('/');
    await expect(page.getByTestId('install')).toContainText('Aggiungi a Home');
    await page.getByTestId('install-dismiss').click();
    await expect(page.getByTestId('install')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('tab-scan')).toBeVisible();
    await expect(page.getByTestId('install')).toHaveCount(0);
    await context.close();
  });

  test("su Android propone l'installazione quando il browser la offre", async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await expect(page.getByTestId('install')).toHaveCount(0);
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      (e as unknown as { prompt: () => Promise<void> }).prompt = () => {
        (window as unknown as { __prompted: boolean }).__prompted = true;
        return Promise.resolve();
      };
      window.dispatchEvent(e);
    });
    await expect(page.getByTestId('install')).toBeVisible();
    await page.getByTestId('install-now').click();
    expect(
      await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted),
    ).toBe(true);
    await expect(page.getByTestId('install')).toHaveCount(0);
  });

  test('nessun suggerimento sul desktop o senza evento del browser', async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await expect(page.getByTestId('tab-scan')).toBeVisible();
    await expect(page.getByTestId('install')).toHaveCount(0);
  });
});
