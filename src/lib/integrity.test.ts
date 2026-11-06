import { describe, expect, it } from 'vitest';
import { checkIntegrity } from './integrity.ts';
import type { Link } from './link-cardmarket.ts';

const link = (over: Partial<Link>): Link => ({
  set: 'SEC',
  number: '1',
  variantType: 'Normal',
  idProduct: 100,
  confidence: 'alta',
  method: 'strutturale',
  ...over,
});

const base = { productIds: new Set([100, 101, 102]), maxUnlinkedRatio: 0.1 };

describe('checkIntegrity', () => {
  it('non segnala nulla su dati coerenti', () => {
    const r = checkIntegrity({ ...base, links: [link({}), link({ number: '2', idProduct: 101 })] });
    expect(r.errors).toEqual([]);
  });

  it('segnala un idProduct che non esiste nel catalogo del giorno', () => {
    const r = checkIntegrity({ ...base, links: [link({ idProduct: 999 })] });
    expect(r.errors.join()).toMatch(/999/);
  });

  it('segnala un idProduct assegnato a varianti diverse', () => {
    const r = checkIntegrity({
      ...base,
      links: [link({ variantType: 'Normal' }), link({ number: '2', variantType: 'Hyperspace' })],
    });
    expect(r.errors.join()).toMatch(/100/);
  });

  it('ammette Normal e Foil sullo stesso prodotto (set vecchi)', () => {
    const r = checkIntegrity({
      ...base,
      links: [link({ variantType: 'Normal' }), link({ variantType: 'Foil' })],
    });
    expect(r.errors).toEqual([]);
  });

  it('ammette la stampa foil con numero suffissato "F" sul prodotto della normale (TWI 254F)', () => {
    const r = checkIntegrity({
      ...base,
      links: [link({ number: '254' }), link({ number: '254F' })],
    });
    expect(r.errors).toEqual([]);
  });

  it('segnala invece numeri diversi senza suffisso F sullo stesso prodotto', () => {
    const r = checkIntegrity({
      ...base,
      links: [link({ number: '254' }), link({ number: '255' })],
    });
    expect(r.errors.join()).toMatch(/100/);
  });

  it('segnala un set con troppe stampe senza collegamento', () => {
    const links = [
      link({ idProduct: 100 }),
      link({ number: '2', idProduct: null, confidence: null, method: 'nessuno' }),
    ];
    const r = checkIntegrity({ ...base, links });
    expect(r.errors.join()).toMatch(/SEC/);
  });

  it('non segnala senza collegamento sotto soglia', () => {
    const links = Array.from({ length: 20 }, (_, i) =>
      link({ number: String(i), idProduct: i === 0 ? null : 101 + (i % 2), variantType: 'Normal' }),
    );
    // più stampe sullo stesso idProduct con stessa variante è ammesso solo se uguale base
    const r = checkIntegrity({ ...base, links, maxUnlinkedRatio: 0.1 });
    expect(r.errors.join()).not.toMatch(/senza collegamento/);
  });

  it('avvisa degli idExpansion sconosciuti ma non blocca', () => {
    const r = checkIntegrity({
      ...base,
      links: [link({})],
      productExpansions: [100, 5618, 7777],
      knownExpansions: new Set([100, 5618]),
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/7777/);
  });
});
