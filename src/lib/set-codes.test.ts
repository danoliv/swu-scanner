import { describe, expect, it } from 'vitest';
import { baseSet, canonicalSet, imageSet, isPromoSet } from './set-codes.ts';

describe('canonicalSet', () => {
  it('unisce i nomi swu-db e ufficiali dei set promo', () => {
    expect(canonicalSet('SECOP')).toBe('SECP');
    expect(canonicalSet('SECP')).toBe('SECP');
    expect(canonicalSet('ASHOP')).toBe('ASHP');
    expect(canonicalSet('JTLOP')).toBe('JTLP');
    expect(canonicalSet('LOFOP')).toBe('LOFP');
  });
  it('lascia invariati HMWP e LAWP, uguali nelle due fonti', () => {
    expect(canonicalSet('HMWP')).toBe('HMWP');
    expect(canonicalSet('LAWP')).toBe('LAWP');
  });
  it('lascia invariati i set normali e quelli senza corrispondenza provata', () => {
    expect(canonicalSet('SEC')).toBe('SEC');
    expect(canonicalSet('P26')).toBe('P26');
    expect(canonicalSet('SHDOP')).toBe('SHDOP');
  });
  it('è insensibile alle maiuscole', () => {
    expect(canonicalSet('secop')).toBe('SECP');
  });
});

describe('baseSet', () => {
  it('riporta il set promo al set di base', () => {
    expect(baseSet('SECP')).toBe('SEC');
    expect(baseSet('SECOP')).toBe('SEC');
    expect(baseSet('HMWP')).toBe('HMW');
  });
  it('restituisce il set stesso se non è un promo noto', () => {
    expect(baseSet('SEC')).toBe('SEC');
    expect(baseSet('P26')).toBe('P26');
  });
});

describe('isPromoSet', () => {
  it('riconosce i set promo noti in entrambe le grafie', () => {
    expect(isPromoSet('SECOP')).toBe(true);
    expect(isPromoSet('LAWP')).toBe(true);
    expect(isPromoSet('SEC')).toBe(false);
  });
});

describe('imageSet', () => {
  it('restituisce il codice swu-db usato nei percorsi delle immagini', () => {
    expect(imageSet('SECP')).toBe('SECOP');
    expect(imageSet('ASHP')).toBe('ASHOP');
    expect(imageSet('JTLP')).toBe('JTLOP');
    expect(imageSet('LOFP')).toBe('LOFOP');
  });
  it('lascia invariati gli altri set', () => {
    expect(imageSet('SOR')).toBe('SOR');
    expect(imageSet('HMWP')).toBe('HMWP');
    expect(imageSet('p25')).toBe('P25');
  });
});
