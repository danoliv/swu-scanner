import { describe, expect, it } from 'vitest';
import { buildPrices, toCents, type RawPriceGuide } from './prices.ts';

describe('toCents', () => {
  it('converte euro in centesimi interi', () => {
    expect(toCents(0.19)).toBe(19);
    expect(toCents(1.1)).toBe(110);
    expect(toCents(0.29)).toBe(29);
  });
  it('vale 0 per prezzo mancante o non valido', () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents(Number.NaN)).toBe(0);
    expect(toCents(-1)).toBe(0);
  });
});

describe('buildPrices', () => {
  const raw: RawPriceGuide = {
    createdAt: '2026-10-18T02:00:00+0200',
    priceGuides: [
      { idProduct: 1, low: 0.06, trend: 0.19, 'low-foil': 0.5, 'trend-foil': 0.8 },
      { idProduct: 2, low: 1, trend: null, 'low-foil': null, 'trend-foil': null },
      { idProduct: 3, low: null, trend: null, 'low-foil': null, 'trend-foil': 0 },
    ],
  };
  it('scrive [trend, minimo, trend foil, minimo foil] in centesimi', () => {
    expect(buildPrices(raw).p['1']).toEqual([19, 6, 80, 50]);
  });
  it('tiene il minimo anche quando il trend manca', () => {
    expect(buildPrices(raw).p['2']).toEqual([0, 100, 0, 0]);
  });
  it('omette i prodotti senza nessun prezzo', () => {
    expect(buildPrices(raw).p['3']).toBeUndefined();
  });
  it('riporta la data del price guide', () => {
    expect(buildPrices(raw).date).toBe('2026-10-18T02:00:00+0200');
  });
  it('rifiuta un file senza price guide', () => {
    expect(() => buildPrices({ createdAt: 'x', priceGuides: [] })).toThrow(/vuoto/);
  });
});
