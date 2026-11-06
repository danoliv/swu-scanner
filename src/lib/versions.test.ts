import { describe, expect, it } from 'vitest';
import type { LinkedCard } from './attach-links.ts';
import { buildVersions } from './versions.ts';
import type { PriceRow } from './prices.ts';

const card = (printings: LinkedCard['printings']): LinkedCard => ({
  name: 'Darth Vader',
  subtitle: 'Dark Lord of the Sith',
  type: 'Leader',
  printings,
});

const prices: Record<string, PriceRow> = {
  '1': [1000, 900, 0, 0],
  '2': [5000, 4000, 0, 0],
  '3': [0, 0, 9000, 8000],
};

describe('buildVersions', () => {
  it('ordina: prima la base (Normal), poi V.1, V.2… per numero crescente', () => {
    const v = buildVersions(
      card([
        ['SOR', '262', 'Hyperspace', 2, 2],
        ['SOR', '010', 'Normal', 1, 2],
        ['SOR', '300', 'Showcase', 4, 2],
      ]),
      prices,
    );
    expect(v.map((x) => x.label)).toEqual([
      { kind: 'base' },
      { kind: 'v', n: 1 },
      { kind: 'v', n: 2 },
    ]);
    expect(v.map((x) => x.idProduct)).toEqual([1, 2, 4]);
  });

  it('confronta i numeri come numeri, non come testo', () => {
    const v = buildVersions(
      card([
        ['SOR', '100', 'Hyperspace', 2, 2],
        ['SOR', '20', 'Standard', 1, 2],
        ['SOR', '9', 'Normal', 3, 2],
      ]),
      prices,
    );
    expect(v.map((x) => x.idProduct)).toEqual([3, 1, 2]);
  });

  it('unisce le stampe che condividono lo stesso prodotto (Normal e Foil dei set vecchi)', () => {
    const v = buildVersions(
      card([
        ['TWI', '254', 'Normal', 1, 2],
        ['TWI', '254F', 'Foil', 1, 2],
      ]),
      prices,
    );
    expect(v).toHaveLength(1);
    expect(v[0]?.printings).toHaveLength(2);
    expect(v[0]?.choices).toEqual(['normal', 'foil']);
    expect(v[0]?.finish).toBeNull();
  });

  it('una variante foil ha la finitura foil e il prezzo foil', () => {
    const [v] = buildVersions(card([['JTL', '500', 'Hyperspace Foil', 3, 2]]), prices);
    expect(v?.finish).toBe('foil');
    expect(v?.quote).toEqual({ cents: 9000, kind: 'trend' });
  });

  it('il prezzo si ricava dalla finitura scelta o fissa; con scelta da fare è null', () => {
    const [shared] = buildVersions(
      card([
        ['TWI', '254', 'Normal', 5, 2],
        ['TWI', '254F', 'Foil', 5, 2],
      ]),
      { '5': [100, 90, 300, 250] },
    );
    expect(shared?.quote).toBeNull();
    expect(shared?.quoteFor('normal')).toEqual({ cents: 100, kind: 'trend' });
    expect(shared?.quoteFor('foil')).toEqual({ cents: 300, kind: 'trend' });
  });

  it('le stampe senza prodotto sono versioni "non identificate", in fondo, senza prezzo', () => {
    const v = buildVersions(
      card([
        ['P25', '95', 'Normal', 0, 0],
        ['SOR', '010', 'Normal', 1, 2],
      ]),
      prices,
    );
    expect(v.map((x) => x.label.kind)).toEqual(['base', 'unidentified']);
    expect(v[1]?.idProduct).toBeNull();
    expect(v[1]?.quote).toBeNull();
    expect(v[1]?.set).toBe('P25');
  });

  it('segnala "probabile" se il collegamento non è sicuro', () => {
    const [v] = buildVersions(card([['SOR', '010', 'Normal', 1, 1]]), prices);
    expect(v?.probable).toBe(true);
    const [w] = buildVersions(card([['SOR', '010', 'Normal', 1, 2]]), prices);
    expect(w?.probable).toBe(false);
  });

  it('la numerazione V.n riparte in ogni set', () => {
    const v = buildVersions(
      card([
        ['SOR', '010', 'Normal', 1, 2],
        ['SOR', '262', 'Hyperspace', 2, 2],
        ['LAW', '020', 'Normal', 10, 2],
        ['LAW', '300', 'Hyperspace', 11, 2],
      ]),
      { ...prices, '10': [10, 9, 0, 0], '11': [20, 19, 0, 0] },
    );
    expect(
      v.map((x) => `${x.set}:${x.label.kind === 'v' ? 'V' + x.label.n : x.label.kind}`),
    ).toEqual(['LAW:base', 'LAW:V1', 'SOR:base', 'SOR:V1']);
  });

  it('senza stampe restituisce una lista vuota', () => {
    expect(buildVersions(card([]), prices)).toEqual([]);
  });

  it('un set senza stampa Normal non ha la base: parte da V.1', () => {
    const v = buildVersions(card([['SEC', '300', 'Hyperspace', 2, 2]]), prices);
    expect(v[0]?.label).toEqual({ kind: 'v', n: 1 });
  });

  it('aggiunge i prodotti non collegati come versioni non identificate, con prezzo, prima delle stampe senza prodotto', () => {
    const c: LinkedCard = {
      ...card([
        ['SOR', '010', 'Normal', 1, 2],
        ['P25', '95', 'Normal', 0, 0],
      ]),
      extras: [
        [2, 'SOR'],
        [3, ''],
      ],
    };
    const v = buildVersions(c, prices);
    expect(v.map((x) => x.idProduct)).toEqual([1, 2, 3, null]);
    expect(v[1]).toMatchObject({ set: 'SOR', label: { kind: 'unidentified' }, printings: [] });
    expect(v[1]?.quote).toEqual({ cents: 5000, kind: 'trend' });
    // il 3 ha solo prezzi foil: finitura foil e prezzo foil
    expect(v[2]).toMatchObject({ set: '', finish: 'foil' });
    expect(v[2]?.quote).toEqual({ cents: 9000, kind: 'trend' });
  });

  it('ordina i prodotti non collegati dal prezzo più basso; senza prezzo in fondo', () => {
    const c: LinkedCard = {
      ...card([]),
      extras: [
        [2, 'SOR'],
        [99, 'SOR'],
        [1, 'SOR'],
      ],
    };
    expect(buildVersions(c, prices).map((x) => x.idProduct)).toEqual([1, 2, 99]);
  });
});
