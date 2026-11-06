// Le versioni di una Carta (SPEC §4): i Prodotti Cardmarket collegati alle sue Stampe, con etichetta
// (base, V.1, V.2… per numero crescente), badge "probabile", finitura e prezzo.
import type { LinkedCard, LinkedPrinting } from './attach-links.ts';
import { quote, resolveFinish, type Finish, type Quote } from './pricing.ts';
import type { PriceRow } from './prices.ts';

export type VersionLabel = { kind: 'base' } | { kind: 'v'; n: number } | { kind: 'unidentified' };

export interface Version {
  /** Prodotto Cardmarket; null = stampa senza prodotto collegato (versione non identificata). */
  idProduct: number | null;
  printings: LinkedPrinting[];
  /** Set della prima stampa (le versioni sono raggruppate per set). */
  set: string;
  label: VersionLabel;
  /** Collegamento non sicuro: badge "probabile". */
  probable: boolean;
  /** Finitura fissa, o null se deve sceglierla l'utente. */
  finish: Finish | null;
  choices: Finish[];
  /** Prezzo con la finitura fissa; null se da scegliere o senza prezzo. */
  quote: Quote | null;
  quoteFor: (finish: Finish) => Quote | null;
}

const num = (n: string): number => Number.parseFloat(n.replace(/[^0-9.]/g, '')) || 0;

const byNumber = (a: LinkedPrinting, b: LinkedPrinting): number => num(a[1]) - num(b[1]);

export function buildVersions(
  card: LinkedCard,
  prices: Readonly<Record<string, PriceRow>>,
): Version[] {
  const linked = new Map<number, LinkedPrinting[]>();
  const unlinked: LinkedPrinting[] = [];
  for (const p of card.printings) {
    if (p[3] === 0) unlinked.push(p);
    else linked.set(p[3], [...(linked.get(p[3]) ?? []), p]);
  }

  const groups = [...linked.entries()].map(([id, ps]) => ({ id, ps: [...ps].sort(byNumber) }));
  groups.sort(
    (a, b) =>
      (a.ps[0] as LinkedPrinting)[0].localeCompare((b.ps[0] as LinkedPrinting)[0]) ||
      byNumber(a.ps[0] as LinkedPrinting, b.ps[0] as LinkedPrinting),
  );

  const versions: Version[] = [];
  const seenBase = new Set<string>();
  const nextN = new Map<string, number>();
  for (const { id, ps } of groups) {
    const first = ps[0] as LinkedPrinting;
    const set = first[0];
    const row = prices[String(id)];
    const { finish, choices } = resolveFinish(
      ps.map((p) => p[2]),
      row,
    );
    const isBase = !seenBase.has(set) && ps.some((p) => p[2] === 'Normal' || p[2] === 'Standard');
    let label: VersionLabel;
    if (isBase) {
      seenBase.add(set);
      label = { kind: 'base' };
    } else {
      const n = (nextN.get(set) ?? 0) + 1;
      nextN.set(set, n);
      label = { kind: 'v', n };
    }
    versions.push({
      idProduct: id,
      printings: ps,
      set,
      label,
      probable: ps.some((p) => p[4] === 1),
      finish,
      choices,
      quote: finish ? quote(row, finish) : null,
      quoteFor: (f) => quote(row, f),
    });
  }

  const extras = (card.extras ?? [])
    .filter(([id]) => !linked.has(id))
    .map(([id, set]) => {
      const row = prices[String(id)];
      const { finish, choices } = resolveFinish([], row);
      return {
        idProduct: id,
        printings: [],
        set,
        label: { kind: 'unidentified' } as VersionLabel,
        probable: false,
        finish,
        choices,
        quote: finish ? quote(row, finish) : null,
        quoteFor: (f: Finish) => quote(row, f),
      } satisfies Version;
    })
    .sort(
      (a, b) =>
        (a.quote?.cents ?? Infinity) - (b.quote?.cents ?? Infinity) || a.idProduct - b.idProduct,
    );
  versions.push(...extras);

  for (const p of unlinked.sort((a, b) => a[0].localeCompare(b[0]) || byNumber(a, b))) {
    versions.push({
      idProduct: null,
      printings: [p],
      set: p[0],
      label: { kind: 'unidentified' },
      probable: false,
      finish: null,
      choices: [],
      quote: null,
      quoteFor: () => null,
    });
  }
  return versions;
}
