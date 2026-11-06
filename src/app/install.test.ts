import { describe, expect, it } from 'vitest';
import { iosInstallHintVisible } from './install.ts';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';

const base = { standalone: false, dismissed: false, maxTouchPoints: 5 };

describe('iosInstallHintVisible', () => {
  it("si mostra su Safari dell'iPhone, non installata e non chiusa", () => {
    expect(iosInstallHintVisible({ ...base, userAgent: IPHONE })).toBe(true);
  });
  it('si mostra anche su iPad in modalità desktop (si presenta come Mac con touch)', () => {
    expect(iosInstallHintVisible({ ...base, userAgent: IPAD_DESKTOP_MODE })).toBe(true);
  });
  it("non si mostra se l'app è già installata (schermo intero)", () => {
    expect(iosInstallHintVisible({ ...base, userAgent: IPHONE, standalone: true })).toBe(false);
  });
  it("non si mostra se l'utente l'ha chiuso", () => {
    expect(iosInstallHintVisible({ ...base, userAgent: IPHONE, dismissed: true })).toBe(false);
  });
  it('non si mostra su Android né su un Mac senza touch', () => {
    expect(iosInstallHintVisible({ ...base, userAgent: ANDROID })).toBe(false);
    expect(
      iosInstallHintVisible({ ...base, userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 }),
    ).toBe(false);
  });
  it('non si mostra in altri browser su iPhone, che non hanno "Aggiungi a Home" allo stesso modo', () => {
    expect(iosInstallHintVisible({ ...base, userAgent: CHROME_IOS })).toBe(false);
  });
});
