import type { Page } from '@playwright/test';

/** Una scansione simulata: tre carte rilevate (una "da scegliere"). */
export async function mockScanner(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const box = { x: 0, y: 0, width: 1, height: 1 };
    (window as unknown as { __swuScanner: unknown }).__swuScanner = {
      scan: () =>
        Promise.resolve([
          {
            status: 'recognized',
            candidates: [{ name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' }],
            titleBox: box,
            rotation: 0,
          },
          {
            status: 'choose',
            candidates: [
              { name: 'Luke Skywalker', subtitle: 'Faithful Friend' },
              { name: 'Luke Skywalker', subtitle: 'Jedi Knight' },
            ],
            titleBox: box,
            rotation: 0,
          },
          {
            status: 'recognized',
            candidates: [{ name: 'Battlefield Marine', subtitle: null }],
            titleBox: box,
            rotation: 0,
          },
        ]),
    };
  });
}

/** Un file qualsiasi da "fotografare": il motore finto lo ignora. */
export const FAKE_PHOTO = {
  name: 'x.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
};

/** Fotografa, sceglie la prima candidata della carta "da scegliere" e conferma: la lista ha 3 voci. */
export async function scanAndConfirmAll(page: Page): Promise<void> {
  await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
  await page.locator('.candidate').first().click();
  await page.getByTestId('confirm').click();
}
