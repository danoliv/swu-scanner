// Dal Catalogo grezzo di swu-db al Catalogo compatto del sito: una voce per Carta
// (titolo + sottotitolo), con l'elenco delle sue Stampe. Solo i campi usati (SPEC §7).
import { correctName, type Corrections } from './name-corrections.ts';
import { normalize } from './text-match.ts';
import { canonicalSet } from './set-codes.ts';

export interface RawPrinting {
  Set: string;
  Number: string;
  Name: string;
  Subtitle?: string | undefined;
  Type: string;
  VariantType: string;
}

/** [set, numero, tipo di variante] */
export type Printing = [set: string, number: string, variant: string];

export interface CatalogCard {
  name: string;
  subtitle: string | null;
  type: string;
  printings: Printing[];
}

/**
 * Le correzioni sono scritte come "titolo, sottotitolo" (come i nomi di Cardmarket), mentre
 * swu-db ha due campi. Si corregge la stringa intera e si risepara alla virgola più vicina
 * al punto in cui stava la divisione originale.
 */
export function correctFields(
  name: string,
  subtitle: string | null,
  corrections: Corrections,
): { name: string; subtitle: string | null } {
  if (subtitle === null) return { name: correctName(name, corrections), subtitle };
  const full = `${name}, ${subtitle}`;
  const fixed = correctName(full, corrections);
  if (fixed === full) return { name, subtitle };
  let cut = -1;
  for (let i = fixed.indexOf(', '); i !== -1; i = fixed.indexOf(', ', i + 1)) {
    if (cut === -1 || Math.abs(i - name.length) < Math.abs(cut - name.length)) cut = i;
  }
  if (cut === -1) return { name: fixed, subtitle: null };
  return { name: fixed.slice(0, cut), subtitle: fixed.slice(cut + 2) };
}

/**
 * Nome e sottotitolo come servono al collegamento con Cardmarket: corretti, e senza il
 * sottotitolo per le basi (su Cardmarket sono "Echo Base", non "Echo Base, Hoth").
 */
export function linkFields(
  r: Pick<RawPrinting, 'Name' | 'Subtitle' | 'Type'>,
  corrections: Corrections,
): { name: string; subtitle: string | null } {
  const fixed = correctFields(r.Name, r.Subtitle ? r.Subtitle : null, corrections);
  const front = (t: string): string => t.split(' // ')[0] ?? t;
  return {
    name: front(fixed.name),
    subtitle: r.Type === 'Base' || fixed.subtitle === null ? null : front(fixed.subtitle),
  };
}

function compareNumbers(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

export function buildCatalog(raw: readonly RawPrinting[], corrections: Corrections): CatalogCard[] {
  const byKey = new Map<string, CatalogCard>();
  for (const r of raw) {
    const { name, subtitle } = correctFields(r.Name, r.Subtitle ? r.Subtitle : null, corrections);
    const key = `${normalize(name)}|${normalize(subtitle ?? '')}`;
    let card = byKey.get(key);
    if (!card) {
      card = { name, subtitle, type: r.Type, printings: [] };
      byKey.set(key, card);
    }
    const printing: Printing = [canonicalSet(r.Set), r.Number, r.VariantType];
    if (!card.printings.some((x) => x.join('\u0000') === printing.join('\u0000'))) {
      card.printings.push(printing);
    }
  }
  for (const card of byKey.values()) {
    card.printings.sort((a, b) => a[0].localeCompare(b[0]) || compareNumbers(a[1], b[1]));
  }
  return [...byKey.values()];
}
