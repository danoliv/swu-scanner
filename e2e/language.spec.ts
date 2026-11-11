import { expect, test, type Page } from '@playwright/test';

/** Una carta riconosciuta dal titolo francese: il motore dice che la lingua è il francese. */
async function frenchVader(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const box = { x: 0, y: 0, width: 1, height: 1 };
    (window as unknown as { __swuScanner: unknown }).__swuScanner = {
      scan: () =>
        Promise.resolve([
          {
            status: 'recognized',
            candidates: [
              {
                name: 'Dark Vador',
                subtitle: 'Seigneur noir des Sith',
                ref: { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
                languages: ['fr'],
              },
            ],
            titleBox: box,
            rotation: 0,
          },
        ]),
    };
  });
  await page.goto('/');
  await page.getByTestId('photo-gallery').setInputFiles({
    name: 'x.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff]),
  });
  await expect(page.getByTestId('review-row')).toHaveCount(1);
}

test.describe('lingua della carta', () => {
  test('si vede la lingua letta e si può cambiare, anche dopo averla aggiunta alla lista', async ({
    page,
  }) => {
    await frenchVader(page);
    const row = page.getByTestId('review-row').first();
    await expect(row.getByTestId('language-badge')).toHaveText('FR');
    await expect(row).toContainText('Dark Vador');

    await row.locator('.row-head').click();
    const select = row.getByTestId('language-select');
    await expect(select).toHaveValue('fr');
    await select.selectOption('en');
    await expect(row.getByTestId('language-badge')).toHaveText('EN');
    await expect(row).toContainText('Darth Vader');
    await expect(row).not.toContainText('Dark Vador');

    await page.getByTestId('confirm').click();
    const listRow = page.getByTestId('list-row').first();
    await expect(listRow.getByTestId('language-badge')).toHaveText('EN');

    await listRow.locator('.row-head').click();
    await listRow.getByTestId('language-select').selectOption('fr');
    await expect(listRow.getByTestId('language-badge')).toHaveText('FR');
    await expect(listRow).toContainText('Dark Vador');
  });

  test('la stessa carta in due lingue sono due voci; nella stessa si sommano', async ({ page }) => {
    await frenchVader(page);
    await page.getByTestId('confirm').click();
    await page.getByTestId('tab-scan').click();
    await page.getByTestId('photo-gallery').setInputFiles({
      name: 'y.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    });
    await page.getByTestId('confirm').click(); // ancora in francese: si somma
    await expect(page.getByTestId('list-row')).toHaveCount(1);
    await expect(page.getByTestId('tab-list').locator('.tab-badge')).toHaveText('2');

    // una delle due diventa inglese: ora sono due voci
    await page.getByTestId('list-row').first().locator('.row-head').click();
    await page.getByTestId('language-select').selectOption('en');
    await expect(page.getByTestId('list-row')).toHaveCount(1); // cambia l'unica voce da 2: resta una voce
    await expect(page.getByTestId('language-badge')).toHaveText('EN');
  });

  test('la lingua passa nel link condiviso', async ({ page, browser, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await frenchVader(page);
    await page.getByTestId('confirm').click();
    await page.getByTestId('share').click();
    await expect(page.getByText('Link copied')).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());

    const other = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'en-US',
    });
    const p = await other.newPage();
    await p.goto(link);
    await p.getByTestId('share-add').click();
    await expect(p.getByTestId('list-row').first().getByTestId('language-badge')).toHaveText('FR');
    await expect(p.getByTestId('list-row').first()).toContainText('Dark Vador');
    await other.close();
  });
});
