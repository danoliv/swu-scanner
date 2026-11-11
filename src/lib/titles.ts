// Titoli di ogni Carta in tutte le lingue, in formato compatto per il sito: [titolo, sottotitolo, indice
// della Carta nel Catalogo]. Servono alla ricerca "Aggiungi una carta" e al riconoscimento.
import type { CatalogEntry } from './detect-cards.ts';
import { languagesToMask, maskToLanguages } from './languages.ts';
import { normalize } from './text-match.ts';

/** L'ultimo numero (facoltativo) dice le lingue del titolo: un bit per lingua (vedi `languagesToMask`). */
export type CompactTitle = [
  name: string,
  subtitle: string | null,
  card: number,
  languages?: number,
];

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
    if (i === undefined) continue;
    out.push(
      e.languages?.length
        ? [e.name, e.subtitle, i, languagesToMask(e.languages)]
        : [e.name, e.subtitle, i],
    );
  }
  return out;
}

export function expandTitles(
  titles: readonly CompactTitle[],
  cards: readonly { name: string; subtitle: string | null }[],
): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const [name, subtitle, i, mask] of titles) {
    const card = cards[i];
    if (!card) continue;
    const languages = mask ? maskToLanguages(mask) : [];
    out.push({
      name,
      subtitle,
      ref: { name: card.name, subtitle: card.subtitle },
      ...(languages.length > 0 ? { languages } : {}),
    });
  }
  return out;
}
