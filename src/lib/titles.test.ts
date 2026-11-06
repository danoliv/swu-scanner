import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from './detect-cards.ts';
import { compactTitles, expandTitles } from './titles.ts';

const cards = [
  { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
  { name: 'Battlefield Marine', subtitle: null },
];

const entries: CatalogEntry[] = [
  { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith', ref: cards[0]! },
  { name: 'Dark Vador', subtitle: 'Seigneur noir des Sith', ref: cards[0]! },
  { name: 'Battlefield Marine', subtitle: null, ref: cards[1]! },
  { name: 'Marine du champ de bataille', subtitle: null, ref: cards[1]! },
];

describe('compactTitles / expandTitles', () => {
  it('scrive [titolo, sottotitolo, indice della Carta] per ogni voce', () => {
    expect(compactTitles(entries, cards)).toEqual([
      ['Darth Vader', 'Dark Lord of the Sith', 0],
      ['Dark Vador', 'Seigneur noir des Sith', 0],
      ['Battlefield Marine', null, 1],
      ['Marine du champ de bataille', null, 1],
    ]);
  });

  it('rilegge le voci con la Carta del Catalogo', () => {
    const back = expandTitles(compactTitles(entries, cards), cards);
    expect(back).toEqual(entries);
  });

  it('salta le voci di una Carta che non è nel Catalogo', () => {
    const extra: CatalogEntry = {
      name: 'X',
      subtitle: null,
      ref: { name: 'Altra', subtitle: null },
    };
    expect(compactTitles([...entries, extra], cards)).toHaveLength(4);
  });

  it('salta le voci senza Carta di riferimento', () => {
    expect(compactTitles([{ name: 'Darth Vader', subtitle: null }], cards)).toEqual([]);
  });

  it('expandTitles ignora gli indici fuori dal Catalogo', () => {
    expect(expandTitles([['A', null, 99]], cards)).toEqual([]);
  });
});
