import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FAKE_PHOTO } from './helpers.ts';

interface Hooks {
  __emit: (p: object) => void;
  __finish: () => void;
}

// Un motore finto che resta "in lettura" finché il test non lo lascia andare, e racconta l'avanzamento
// che il test gli detta: così si vede la schermata a metà strada.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Hooks & { __swuScanner: unknown };
    let emit: (p: object) => void = () => undefined;
    let finish: () => void = () => undefined;
    w.__emit = (p) => emit(p);
    w.__finish = () => finish();
    w.__swuScanner = {
      scan: (_file: File, onProgress: (p: object) => void) =>
        new Promise((resolve) => {
          emit = onProgress;
          finish = () =>
            resolve([
              {
                status: 'recognized',
                candidates: [{ name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' }],
                titleBox: { x: 0, y: 0, width: 1, height: 1 },
                rotation: 0,
              },
            ]);
        }),
    };
  });
  await page.goto('/');
});

test.describe('avanzamento della lettura', () => {
  test('la barra cresce, poi dice le carte trovate e a che punto è la rilettura', async ({
    page,
  }) => {
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    const bar = page.getByTestId('progress-bar');
    await expect(bar).toHaveAttribute('value', '0');
    await expect(page.getByTestId('found-so-far')).toHaveCount(0); // ancora non si sa

    await page.evaluate(() =>
      (window as unknown as Hooks).__emit({
        stage: 'read',
        fraction: 0.4,
        done: 0,
        total: 0,
        cards: null,
      }),
    );
    await expect(bar).toHaveAttribute('value', '40');
    await expect(page.getByRole('status')).toHaveText('Reading the photo…');

    await page.evaluate(() =>
      (window as unknown as Hooks).__emit({
        stage: 'zoom',
        fraction: 0.85,
        done: 3,
        total: 6,
        cards: 9,
      }),
    );
    await expect(bar).toHaveAttribute('value', '85');
    await expect(page.getByRole('status')).toHaveText('Looking closer…');
    await expect(page.getByTestId('scan-progress')).toContainText('3/6');
    await expect(page.getByTestId('found-so-far')).toHaveText('9 cards found so far');

    // un messaggio in ritardo non fa tornare indietro la barra
    await page.evaluate(() =>
      (window as unknown as Hooks).__emit({
        stage: 'read',
        fraction: 0.1,
        done: 0,
        total: 0,
        cards: null,
      }),
    );
    await expect(bar).toHaveAttribute('value', '85');

    await page.evaluate(() => (window as unknown as Hooks).__finish());
    await expect(page.getByTestId('found')).toHaveText('1 card found');
    await expect(page.getByTestId('scan-progress')).toHaveCount(0);
  });

  test('la schermata di lettura è accessibile', async ({ page }) => {
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    await page.evaluate(() =>
      (window as unknown as Hooks).__emit({
        stage: 'zoom',
        fraction: 0.8,
        done: 2,
        total: 5,
        cards: 7,
      }),
    );
    await expect(page.getByTestId('found-so-far')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('la barra ha un nome per chi usa uno screen reader', async ({ page }) => {
    await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
    await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible();
  });
});
