// Innesta nel Catalogo compatto il collegamento di ogni Stampa al prodotto Cardmarket.
import type { CatalogCard, Printing } from './catalog.ts';
import type { Link } from './link-cardmarket.ts';

/** [set, numero, variante, idProduct (0 = nessuno), fiducia (0 nessuna, 1 probabile, 2 sicura)] */
export type LinkedPrinting = [...Printing, idProduct: number, confidence: 0 | 1 | 2];

export interface LinkedCard extends Omit<CatalogCard, 'printings'> {
  printings: LinkedPrinting[];
  /** Prodotti Cardmarket di questa Carta non collegati a nessuna Stampa: [idProduct, set ("" se ignoto)]. */
  extras?: [idProduct: number, set: string][];
}

export function attachLinks(cards: readonly CatalogCard[], links: readonly Link[]): LinkedCard[] {
  const byKey = new Map<string, Link>();
  for (const l of links) byKey.set(`${l.set}|${l.number}|${l.variantType}`, l);
  return cards.map((c) => ({
    ...c,
    printings: c.printings.map(([set, number, variant]): LinkedPrinting => {
      const l = byKey.get(`${set}|${number}|${variant}`);
      if (!l || l.idProduct === null) return [set, number, variant, 0, 0];
      return [set, number, variant, l.idProduct, l.confidence === 'alta' ? 2 : 1];
    }),
  }));
}
