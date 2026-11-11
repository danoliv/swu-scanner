import { expect, test, type Browser, type Page } from '@playwright/test';
import { mockScanner, scanAndConfirmAll } from './helpers.ts';

/** Una lista con tre voci, la prima con la versione scelta (quindi con un prezzo). */
async function listWithPrice(page: Page): Promise<void> {
  await mockScanner(page);
  await page.goto('/');
  await scanAndConfirmAll(page);
  await page.getByTestId('list-row').first().locator('.row-head').click();
  await page.locator('.versions .chip').first().click();
  await expect(page.getByTestId('total')).not.toContainText('€0.00');
}

/** Clicca "Condividi" e restituisce il link finito negli appunti (il desktop non ha il foglio di condivisione). */
async function copyShareLink(page: Page): Promise<string> {
  await page.getByTestId('share').click();
  await expect(page.getByText('Link copied')).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
}

async function receiver(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
  });
  return { context, page: await context.newPage() };
}

test.describe('condividi la lista', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('il tasto è spento a lista vuota', async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await page.getByTestId('tab-list').click();
    await expect(page.getByTestId('share')).toBeDisabled();
  });

  test('il link porta la stessa lista, con lo stesso totale', async ({ page, browser }) => {
    await listWithPrice(page);
    const senderTotal = await page.getByTestId('total').innerText();
    const link = await copyShareLink(page);
    expect(link).toMatch(/#list=1\.[A-Za-z0-9_-]+$/);

    const other = await receiver(browser);
    await other.page.goto(link);
    await expect(other.page.getByTestId('share-dialog')).toBeVisible();
    await expect(other.page.getByTestId('share-summary')).toContainText('3 cards');
    expect(other.page.url()).not.toContain('#list='); // il frammento si toglie dopo la lettura
    await other.page.getByTestId('share-add').click();
    await expect(other.page.getByTestId('list-row')).toHaveCount(3);
    await expect(other.page.getByTestId('total')).toHaveText(senderTotal);
    // la voce con la versione scelta mostra la data del prezzo ricevuto
    await expect(other.page.getByTestId('list-row').first()).toContainText('Shared price of');
    await other.context.close();
  });

  test('"Aggiorna prezzi" toglie i prezzi ricevuti', async ({ page, browser }) => {
    await listWithPrice(page);
    const link = await copyShareLink(page);
    const other = await receiver(browser);
    await other.page.goto(link);
    await other.page.getByTestId('share-add').click();
    await other.page.getByTestId('update-prices').click();
    await expect(other.page.getByTestId('update-prices')).toHaveCount(0);
    await expect(other.page.getByText('Shared price of')).toHaveCount(0);
    await other.context.close();
  });

  test('con una lista già piena si può sommare o sostituire, e annullare', async ({
    page,
    browser,
  }) => {
    await listWithPrice(page);
    const link = await copyShareLink(page);

    // il destinatario ha già le stesse tre carte: sommando, restano tre voci e il suo prezzo
    await page.goto(link);
    await expect(page.getByText('already in your list')).toBeVisible();
    await page.getByTestId('share-add').click();
    await expect(page.getByTestId('list-row')).toHaveCount(3);
    await expect(page.getByText('your price is kept')).toBeVisible();
    await expect(page.getByTestId('tab-list').locator('.tab-badge')).toHaveText('6');

    await page.getByTestId('undo').click();
    await expect(page.getByTestId('tab-list').locator('.tab-badge')).toHaveText('3');

    await page.goto(link);
    await page.getByTestId('share-replace').click();
    await expect(page.getByTestId('tab-list').locator('.tab-badge')).toHaveText('3');
    void browser;
  });

  test('"Non ora" non cambia niente', async ({ page, browser }) => {
    await listWithPrice(page);
    const link = await copyShareLink(page);
    const other = await receiver(browser);
    await other.page.goto(link);
    await other.page.getByTestId('share-cancel').click();
    await expect(other.page.getByTestId('share-dialog')).toHaveCount(0);
    await expect(other.page.getByTestId('tab-list').locator('.tab-badge')).toHaveCount(0);
    await other.context.close();
  });

  test('un link rovinato dà un errore chiaro e non tocca la lista', async ({ page }) => {
    await listWithPrice(page);
    await page.goto('/#list=1.AAAA');
    await expect(page.getByRole('alert')).toContainText('not a valid list');
    await expect(page.getByTestId('share-add')).toHaveCount(0);
    await page.getByTestId('share-cancel').click();
    await expect(page.getByTestId('tab-list').locator('.tab-badge')).toHaveText('3');
  });
});
