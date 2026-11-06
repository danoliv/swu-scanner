import { describe, expect, it } from 'vitest';
import { attachLinks } from './attach-links.ts';
import type { CatalogCard } from './catalog.ts';
import type { Link } from './link-cardmarket.ts';

const card: CatalogCard = {
  name: 'A-Wing',
  subtitle: null,
  type: 'Unit',
  printings: [
    ['SEC', '213', 'Normal'],
    ['SEC', '480', 'Hyperspace'],
    ['P26', '5', 'Normal'],
  ],
};

const link = (over: Partial<Link>): Link => ({
  set: 'SEC',
  number: '213',
  variantType: 'Normal',
  idProduct: 777,
  confidence: 'alta',
  method: 'strutturale',
  ...over,
});

describe('attachLinks', () => {
  it('aggiunge idProduct e fiducia (2 = alta, 1 = media) a ogni stampa', () => {
    const [c] = attachLinks(
      [card],
      [
        link({}),
        link({ number: '480', variantType: 'Hyperspace', idProduct: 778, confidence: 'media' }),
      ],
    );
    expect(c?.printings[0]).toEqual(['SEC', '213', 'Normal', 777, 2]);
    expect(c?.printings[1]).toEqual(['SEC', '480', 'Hyperspace', 778, 1]);
  });
  it('mette 0, 0 per le stampe senza collegamento o fuori dai set collegati', () => {
    const [c] = attachLinks(
      [card],
      [link({ number: '480', variantType: 'Hyperspace', idProduct: null, confidence: null })],
    );
    expect(c?.printings[1]).toEqual(['SEC', '480', 'Hyperspace', 0, 0]);
    expect(c?.printings[2]).toEqual(['P26', '5', 'Normal', 0, 0]);
  });
  it('non modifica il Catalogo di partenza', () => {
    attachLinks([card], [link({})]);
    expect(card.printings[0]).toEqual(['SEC', '213', 'Normal']);
  });
});
