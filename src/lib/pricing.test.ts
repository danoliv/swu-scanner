import { describe, expect, it } from 'vitest';
import { formatEuro, isFoilVariant, quote, resolveFinish } from './pricing.ts';
import type { PriceRow } from './prices.ts';

// [trend, minimo, trend foil, minimo foil], in centesimi
const row = (r: PriceRow): PriceRow => r;

describe('isFoilVariant', () => {
  it('riconosce le varianti foil dal nome', () => {
    expect(isFoilVariant('Foil')).toBe(true);
    expect(isFoilVariant('Hyperspace Foil')).toBe(true);
    expect(isFoilVariant('Prestige Foil')).toBe(true);
    expect(isFoilVariant('Normal')).toBe(false);
    expect(isFoilVariant('Hyperspace')).toBe(false);
  });
});

describe('quote', () => {
  it('per la normale usa il trend', () => {
    expect(quote(row([19, 6, 80, 50]), 'normal')).toEqual({ cents: 19, kind: 'trend' });
  });
  it('per la foil usa il trend foil', () => {
    expect(quote(row([19, 6, 80, 50]), 'foil')).toEqual({ cents: 80, kind: 'trend' });
  });
  it('se il trend manca usa il minimo, segnalato come "da"', () => {
    expect(quote(row([0, 6, 0, 0]), 'normal')).toEqual({ cents: 6, kind: 'low' });
    expect(quote(row([0, 6, 0, 50]), 'foil')).toEqual({ cents: 50, kind: 'low' });
  });
  it('senza prezzi restituisce null (prezzo non disponibile)', () => {
    expect(quote(row([0, 0, 0, 0]), 'normal')).toBeNull();
    expect(quote(row([19, 6, 0, 0]), 'foil')).toBeNull();
    expect(quote(undefined, 'normal')).toBeNull();
  });
});

describe('resolveFinish', () => {
  it('una variante foil ha la finitura foil', () => {
    expect(resolveFinish(['Hyperspace Foil'], row([0, 0, 500, 400]))).toEqual({
      finish: 'foil',
      choices: ['foil'],
    });
  });
  it('una variante non foil con un solo prezzo ha la finitura normale', () => {
    expect(resolveFinish(['Normal'], row([19, 6, 0, 0]))).toEqual({
      finish: 'normal',
      choices: ['normal'],
    });
  });
  it("Normal e Foil sullo stesso prodotto (set vecchi): sceglie l'utente", () => {
    expect(resolveFinish(['Normal', 'Foil'], row([19, 6, 80, 50]))).toEqual({
      finish: null,
      choices: ['normal', 'foil'],
    });
  });
  it("un prodotto non foil con due prezzi (alcuni Extras): sceglie l'utente", () => {
    expect(resolveFinish(['Hyperspace'], row([100, 90, 300, 250]))).toEqual({
      finish: null,
      choices: ['normal', 'foil'],
    });
  });
  it('senza prezzi e senza foil, normale', () => {
    expect(resolveFinish(['Normal'], undefined)).toEqual({ finish: 'normal', choices: ['normal'] });
  });
  it("un prodotto di variante ignota con due prezzi: sceglie l'utente", () => {
    expect(resolveFinish([], row([100, 90, 300, 250]))).toEqual({
      finish: null,
      choices: ['normal', 'foil'],
    });
  });
  it('un prodotto di variante ignota con solo prezzi foil è foil', () => {
    expect(resolveFinish([], row([0, 0, 300, 250]))).toEqual({ finish: 'foil', choices: ['foil'] });
    expect(resolveFinish([], row([0, 0, 0, 250])).finish).toBe('foil');
  });
  it('un prodotto di variante ignota con solo prezzi normali o senza prezzi è normale', () => {
    expect(resolveFinish([], row([100, 90, 0, 0])).finish).toBe('normal');
    expect(resolveFinish([], undefined).finish).toBe('normal');
  });
  it('una variante foil non diventa mai una scelta anche con due prezzi', () => {
    expect(resolveFinish(['Prestige Foil'], row([100, 90, 300, 250])).finish).toBe('foil');
  });
});

describe('formatEuro', () => {
  it('formatta i centesimi in euro nella lingua data', () => {
    expect(formatEuro(1867, 'it')).toBe('18,67 €');
    expect(formatEuro(1867, 'en')).toBe('€18.67');
    expect(formatEuro(5, 'fr')).toBe('0,05 €');
    expect(formatEuro(0, 'de')).toBe('0,00 €');
  });
  it('torna alla formattazione inglese per una lingua non valida', () => {
    expect(formatEuro(100, 'x-non-esiste-!!')).toBe('€1.00');
  });
});
