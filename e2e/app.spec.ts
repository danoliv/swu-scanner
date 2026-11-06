import { expect, test } from '@playwright/test';
import { FAKE_PHOTO, mockScanner, scanAndConfirmAll } from './helpers.ts';

test.describe('flusso di scansione', () => {
  test.beforeEach(async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
  });

  test('foto, da rivedere, versione, conferma e lista con totale', async ({ page }) => {
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    await expect(page.getByTestId('found')).toHaveText('3 cards found');
    await expect(page.getByTestId('review-row')).toHaveCount(3);

    // la prima carta (Darth Vader): si apre e si sceglie la versione base
    await page.getByTestId('review-row').first().locator('.row-head').click();
    await page.locator('.versions .chip').first().click();
    // la seconda è "da scegliere": si sceglie una candidata
    await page.locator('.candidate').first().click();

    // conferma: entrano solo le carte con una Carta scelta (2 su 3: la terza è la Battlefield Marine, già riconosciuta)
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('list-row')).toHaveCount(3);
    await expect(page.getByTestId('total')).toContainText('€');
    await expect(page.getByTestId('total')).not.toContainText('€0.00');
  });

  test('il totale conta le carte da scegliere', async ({ page }) => {
    await scanAndConfirmAll(page);
    // nessuna versione scelta: totale zero e 3 carte da scegliere
    await expect(page.getByTestId('total')).toHaveText('Total €0.00');
    await expect(page.locator('.totals')).toContainText('3 to choose');
  });

  test('alla conferma una carta ancora da scegliere resta tra quelle da rivedere', async ({
    page,
  }) => {
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    await page.getByTestId('confirm').click(); // 2 carte pronte su 3
    await expect(page.getByTestId('tab-list').locator('.tab-badge')).toHaveText('2');
    await expect(page.getByTestId('found')).toHaveText('1 card found');
    await expect(page.getByTestId('review-row')).toHaveCount(1);
    await expect(page.getByTestId('list-row')).toHaveCount(0); // siamo ancora sulla scheda Scansiona
  });

  test('si può scartare una carta rilevata', async ({ page }) => {
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    await page.getByTestId('review-row').first().getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByTestId('found')).toHaveText('2 cards found');
  });
});

test.describe('aggiungi una carta', () => {
  test.beforeEach(async ({ page }) => {
    await mockScanner(page);
  });

  test('la ricerca trova la carta in qualsiasi lingua e la aggiunge a "Da rivedere"', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add a card' }).click();
    await page.getByRole('searchbox').fill('dark vador');
    await expect(page.getByTestId('results').locator('.name').first()).toHaveText('Darth Vader');
    await page.getByTestId('results').locator('.candidate').first().click();
    await expect(page.getByTestId('found')).toHaveText('1 card found');
  });

  test('segnala quando nessuna carta corrisponde', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add a card' }).click();
    await page.getByRole('searchbox').fill('zzzzqqq');
    await expect(page.getByText('No cards match')).toBeVisible();
  });
});

test.describe('lista e impostazioni', () => {
  test('la lista resta dopo aver ricaricato la pagina', async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await scanAndConfirmAll(page);
    await expect(page.getByTestId('list-row')).toHaveCount(3);
    await page.reload();
    await page.getByTestId('tab-list').click();
    await expect(page.getByTestId('list-row')).toHaveCount(3);
  });

  test('la quantità si cambia e le voci si rimuovono', async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await scanAndConfirmAll(page);
    const first = page.getByTestId('list-row').first();
    await first.getByRole('button', { name: /Quantity \+/ }).click();
    await expect(first.locator('.qty-value')).toHaveText('2');
    await first.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('list-row')).toHaveCount(2);
  });

  test("l'interfaccia segue la lingua del telefono e si cambia dalle impostazioni", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: 'it-IT',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await mockScanner(page);
    await page.goto('/');
    await expect(page.getByTestId('tab-scan')).toHaveText('Scansiona');
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await page.getByTestId('tab-settings').click();
    await page.locator('#lang').selectOption('fr');
    await expect(page.getByTestId('tab-scan')).toHaveText('Scanner');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await context.close();
  });

  test("con una lingua non supportata si usa l'inglese", async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'ja-JP',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await mockScanner(page);
    await page.goto('/');
    await expect(page.getByTestId('tab-scan')).toHaveText('Scan');
    await context.close();
  });
});

test.describe('CSV', () => {
  test('esporta la lista in un file CSV con intestazione e una riga per voce', async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await scanAndConfirmAll(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('swu-scanner-list.csv');
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream) text += String(chunk);
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe('quantity,name,subtitle,set,number,variant,finish,idProduct,price_eur');
    expect(lines).toHaveLength(4);
  });

  test('importa un CSV e aggiunge le voci', async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await page.getByTestId('tab-list').click();
    const csv = 'quantity,name,subtitle\n2,Battlefield Marine,\n1,Carta Inventata,\n';
    await page.locator('input[type=file][accept*=csv]').setInputFiles({
      name: 'lista.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await expect(page.getByTestId('list-row')).toHaveCount(1);
    await expect(page.locator('.qty-value').first()).toHaveText('2');
    await expect(page.getByRole('status').filter({ hasText: 'Carta Inventata' })).toBeVisible();
  });
});

test.describe('installabile e offline', () => {
  test('il manifest ha nome, schermo intero e icone', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    const res = await request.get(new URL(href as string, page.url()).href);
    const manifest = (await res.json()) as {
      name: string;
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBe('SWU Scanner');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(
      true,
    );
    for (const icon of manifest.icons) {
      const r = await request.get(new URL(icon.src, page.url()).href);
      expect(r.ok(), icon.src).toBe(true);
    }
    expect(await page.locator('link[rel=apple-touch-icon]').count()).toBe(1);
  });

  test("l'interfaccia, il Catalogo e la Lista funzionano senza rete dopo il primo caricamento", async ({
    page,
    context,
  }) => {
    await mockScanner(page);
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload(); // il service worker controlla la pagina e la cache si riempie
    await expect(page.getByTestId('tab-scan')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('tab-scan')).toBeVisible();
    await page.getByRole('button', { name: 'Add a card' }).click();
    await page.getByRole('searchbox').fill('vader');
    await expect(page.getByTestId('results').locator('.name').first()).toBeVisible();
    await context.setOffline(false);
  });

  test('si apre senza rete anche subito dopo la prima visita, senza un secondo caricamento', async ({
    page,
    context,
  }) => {
    await mockScanner(page);
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('tab-scan')).toBeVisible();
    await page.getByTestId('tab-settings').click();
    await expect(page.locator('#lang')).toBeVisible();
    await context.setOffline(false);
  });
});
