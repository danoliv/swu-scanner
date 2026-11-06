// Prodotti Cardmarket non collegati a nessuna Stampa (SPEC §4: si mostrano tutti, con prezzo e link):
// si allegano alla Carta con lo stesso nome come versioni "non identificate".
import type { LinkedCard } from './attach-links.ts';
import { cardmarketKey, type CmProduct } from './link-cardmarket.ts';
import { normalize } from './text-match.ts';

const front = (t: string): string => t.split(' // ')[0] ?? t;

/** La chiave con cui Cardmarket nomina questa Carta (stessa regola di `cardmarketKey`). */
export function cardmarketKeyOfCard(card: Pick<LinkedCard, 'name' | 'subtitle' | 'type'>): string {
  const name = front(card.name);
  if (card.type === 'Base' || card.subtitle === null) return normalize(name);
  return normalize(`${name}, ${front(card.subtitle)}`);
}

export function attachExtras(
  cards: readonly LinkedCard[],
  products: readonly Pick<CmProduct, 'idProduct' | 'idExpansion' | 'name'>[],
  linked: ReadonlySet<number>,
  setOfExpansion: (idExpansion: number) => string,
): LinkedCard[] {
  const byKey = new Map<string, [number, string][]>();
  const seen = new Set<string>();
  for (const p of products) {
    if (linked.has(p.idProduct)) continue;
    const key = cardmarketKey(p.name);
    if (seen.has(`${key}|${p.idProduct}`)) continue;
    seen.add(`${key}|${p.idProduct}`);
    byKey.set(key, [...(byKey.get(key) ?? []), [p.idProduct, setOfExpansion(p.idExpansion)]]);
  }
  return cards.map((card) => {
    const extras = byKey.get(cardmarketKeyOfCard(card));
    return extras ? { ...card, extras } : card;
  });
}
