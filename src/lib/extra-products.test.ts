import { describe, expect, it } from 'vitest';
import type { LinkedCard } from './attach-links.ts';
import { attachExtras, cardmarketKeyOfCard } from './extra-products.ts';

const card = (over: Partial<LinkedCard>): LinkedCard => ({
  name: 'Darth Vader',
  subtitle: 'Dark Lord of the Sith',
  type: 'Leader',
  printings: [['SOR', '010', 'Normal', 1, 2]],
  ...over,
});

const product = (idProduct: number, idExpansion: number, name: string) => ({
  idProduct,
  idExpansion,
  name,
});

describe('cardmarketKeyOfCard', () => {
  it('unisce titolo e sottotitolo come Cardmarket', () => {
    expect(cardmarketKeyOfCard(card({}))).toBe('darth vader dark lord of the sith');
  });
  it('per le basi usa solo il titolo (il sottotitolo è il luogo)', () => {
    expect(cardmarketKeyOfCard(card({ name: 'Echo Base', subtitle: 'Hoth', type: 'Base' }))).toBe(
      'echo base',
    );
  });
  it('per le carte a doppia faccia usa il lato frontale', () => {
    expect(
      cardmarketKeyOfCard(
        card({
          name: 'Chancellor Palpatine // Darth Sidious',
          subtitle: 'Playing Both Sides // Not So Fast',
        }),
      ),
    ).toBe('chancellor palpatine playing both sides');
  });
  it('senza sottotitolo usa solo il titolo', () => {
    expect(
      cardmarketKeyOfCard(card({ name: 'Battlefield Marine', subtitle: null, type: 'Unit' })),
    ).toBe('battlefield marine');
  });
});

describe('attachExtras', () => {
  const setOf = (id: number): string => ({ 5638: 'SOR', 5618: 'SOR' })[id] ?? '';

  it('allega alla Carta i prodotti con il suo nome che non sono collegati a nessuna stampa', () => {
    const [c] = attachExtras(
      [card({})],
      [
        product(1, 5618, 'Darth Vader, Dark Lord of the Sith'), // già collegato
        product(2, 5638, 'Darth Vader, Dark Lord of the Sith'),
        product(3, 6101, 'Darth Vader, Dark Lord of the Sith'),
        product(4, 5618, 'Luke Skywalker, Faithful Friend'), // altra Carta
      ],
      new Set([1]),
      setOf,
    );
    expect(c?.extras).toEqual([
      [2, 'SOR'],
      [3, ''],
    ]);
  });

  it('non aggiunge il campo se non ci sono prodotti in più', () => {
    const [c] = attachExtras(
      [card({})],
      [product(1, 5618, 'Darth Vader, Dark Lord of the Sith')],
      new Set([1]),
      setOf,
    );
    expect(c).not.toHaveProperty('extras');
  });

  it('trova anche i prodotti delle basi e dei leader a doppia faccia', () => {
    const [base, leader] = attachExtras(
      [
        card({ name: 'Echo Base', subtitle: 'Hoth', type: 'Base' }),
        card({
          name: 'Chancellor Palpatine // Darth Sidious',
          subtitle: 'Playing Both Sides // X',
        }),
      ],
      [
        product(10, 5638, 'Echo Base // Experience Token'),
        product(11, 5638, 'Chancellor Palpatine // Darth Sidious, Playing Both Sides'),
      ],
      new Set(),
      setOf,
    );
    expect(base?.extras).toEqual([[10, 'SOR']]);
    expect(leader?.extras).toEqual([[11, 'SOR']]);
  });

  it('un prodotto va a tutte le Carte con la stessa chiave ma una sola volta per Carta', () => {
    const [c] = attachExtras(
      [card({})],
      [
        product(2, 5638, 'Darth Vader, Dark Lord of the Sith'),
        product(2, 5638, 'Darth Vader, Dark Lord of the Sith'),
      ],
      new Set(),
      setOf,
    );
    expect(c?.extras).toEqual([[2, 'SOR']]);
  });

  it('non modifica le Carte di partenza', () => {
    const start = card({});
    attachExtras(
      [start],
      [product(2, 5638, 'Darth Vader, Dark Lord of the Sith')],
      new Set(),
      setOf,
    );
    expect(start).not.toHaveProperty('extras');
  });
});
