// Titoli di ogni Carta in tutte le lingue, in formato compatto per il sito: [titolo, sottotitolo, indice
// della Carta nel Catalogo]. Servono alla ricerca "Aggiungi una carta" e al riconoscimento.
import type { CatalogEntry } from './detect-cards.ts';
import { normalize } from './text-match.ts';

export type CompactTitle = [name: string, subtitle: string | null, card: number];

const keyOf = (name: string, subtitle: string | null): string =>
  `${normalize(name)}|${normalize(subtitle ?? '')}`;

export function compactTitles(
  entries: readonly CatalogEntry[],
  cards: readonly { name: string; subtitle: string | null }[],
): CompactTitle[] {
  const index = new Map(cards.map((c, i) => [keyOf(c.name, c.subtitle), i]));
  const out: CompactTitle[] = [];
  for (const e of entries) {
    if (!e.ref) continue;
    const i = index.get(keyOf(e.ref.name, e.ref.subtitle));
    if (i !== undefined) out.push([e.name, e.subtitle, i]);
  }
  return out;
}

export function expandTitles(
  titles: readonly CompactTitle[],
  cards: readonly { name: string; subtitle: string | null }[],
): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const [name, subtitle, i] of titles) {
    const card = cards[i];
    if (card) out.push({ name, subtitle, ref: { name: card.name, subtitle: card.subtitle } });
  }
  return out;
}
