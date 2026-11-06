import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FAKE_PHOTO, mockScanner, scanAndConfirmAll } from './helpers.ts';

const hasModels = existsSync('public/models/manifest.json');

async function audit(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(summary, `Accessibilità: ${where}`).toEqual([]);
}

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`accessibilità, tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test.beforeEach(async ({ page }) => {
      await mockScanner(page);
      await page.goto('/');
      // l'app si disegna dopo il caricamento dei dati: l'audit parte solo a pagina pronta
      await expect(page.getByTestId('tab-scan')).toBeVisible();
    });

    test('scansiona (vuota)', async ({ page }) => {
      await audit(page, 'scansiona');
    });

    test('da rivedere, con una riga aperta', async ({ page }) => {
      await page.getByTestId('photo-gallery').setInputFiles(FAKE_PHOTO);
      await page.getByTestId('review-row').first().locator('.row-head').click();
      await audit(page, 'da rivedere');
    });

    test('lista con voci e riga aperta', async ({ page }) => {
      await scanAndConfirmAll(page);
      await page.getByTestId('list-row').first().locator('.row-head').click();
      await audit(page, 'lista');
    });

    test("lista con l'intervallo del totale e l'annulla", async ({ page }) => {
      await scanAndConfirmAll(page);
      await page.getByTestId('to-choose').click();
      await page.getByTestId('list-row').first().getByRole('button', { name: 'Remove' }).click();
      await expect(page.getByTestId('toast')).toBeVisible();
      await audit(page, 'lista con intervallo e annulla');
    });

    test('lista vuota', async ({ page }) => {
      await page.getByTestId('tab-list').click();
      await audit(page, 'lista vuota');
    });

    test('impostazioni', async ({ page }) => {
      await page.getByTestId('tab-settings').click();
      await audit(page, 'impostazioni');
    });

    test('ricerca "Aggiungi una carta"', async ({ page }) => {
      await page.getByRole('button', { name: 'Add a card' }).click();
      await page.getByRole('searchbox').fill('vader');
      await expect(page.getByTestId('results').locator('.candidate').first()).toBeVisible();
      await audit(page, 'ricerca');
    });
  });
}

test.describe('accessibilità: primo avvio', () => {
  test.skip(!hasModels, 'servono i modelli (npm run assets)');
  test('pagina di scelta del modello', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('setup-download')).toBeVisible();
    await audit(page, 'primo avvio');
  });
});

test.describe('accessibilità: suggerimento di installazione', () => {
  test('scheda di installazione su iPhone', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await mockScanner(page);
    await page.goto('/');
    await expect(page.getByTestId('install')).toBeVisible();
    await audit(page, 'installazione');
    await context.close();
  });
});

test.describe('tastiera', () => {
  test('si arriva ai pulsanti principali con Tab e si attivano con Invio', async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await expect(page.getByTestId('tab-scan')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Take a photo' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Choose from gallery' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Add a card' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('searchbox')).toBeFocused();
  });

  test('il pulsante focalizzato ha un contorno visibile', async ({ page }) => {
    await mockScanner(page);
    await page.goto('/');
    await expect(page.getByTestId('tab-scan')).toBeVisible();
    await page.keyboard.press('Tab');
    const outline = await page
      .getByRole('button', { name: 'Take a photo' })
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });
});
