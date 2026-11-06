import { describe, expect, it } from 'vitest';
import { priceAgeDays, pricesAreStale } from './freshness.ts';

const now = new Date('2026-11-05T12:00:00Z');

describe('priceAgeDays', () => {
  it('conta i giorni interi dalla data dei prezzi', () => {
    expect(priceAgeDays('2026-11-05T02:55:12+0200', now)).toBe(0);
    expect(priceAgeDays('2026-11-03T02:55:12+0200', now)).toBe(2);
    expect(priceAgeDays('2026-10-05T00:00:00Z', now)).toBe(31);
  });
  it('vale 0 per una data futura (orologio sbagliato)', () => {
    expect(priceAgeDays('2027-01-01T00:00:00Z', now)).toBe(0);
  });
  it('restituisce null per una data non valida o assente', () => {
    expect(priceAgeDays('non una data', now)).toBeNull();
    expect(priceAgeDays('', now)).toBeNull();
  });
});

describe('pricesAreStale', () => {
  it('avvisa oltre la soglia (3 giorni di default)', () => {
    expect(pricesAreStale('2026-11-05T00:00:00Z', now)).toBe(false);
    expect(pricesAreStale('2026-11-02T00:00:00Z', now)).toBe(false); // 3 giorni interi: non ancora
    expect(pricesAreStale('2026-11-01T00:00:00Z', now)).toBe(true); // 4 giorni interi
  });
  it('accetta una soglia diversa', () => {
    expect(pricesAreStale('2026-11-03T00:00:00Z', now, 1)).toBe(true); // 2 giorni > 1
  });
  it('con una data non valida avvisa (meglio un avviso in più)', () => {
    expect(pricesAreStale('boh', now)).toBe(true);
  });
});
