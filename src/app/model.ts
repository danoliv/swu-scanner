// Il modello dell'app: Catalogo con versioni e prezzi, voci "da rivedere" di una Scansione,
// ricerca per titolo. Logica pura, senza DOM.
import type { LinkedCard } from '../lib/attach-links.ts';
import type { CatalogEntry, DetectedCard } from '../lib/detect-cards.ts';
import type { EntryPrice, ListEntry, LocalTitle, NewEntry } from '../lib/list.ts';
import type { Finish } from '../lib/pricing.ts';
import type { PriceRow } from '../lib/prices.ts';
import type { CsvListRow } from '../lib/list-csv.ts';
import { normalize } from '../lib/text-match.ts';
import { buildVersions, type Version } from '../lib/versions.ts';

export const cardKey = (name: string, subtitle: string | null): string =>
  `${normalize(name)}|${normalize(subtitle ?? '')}`;

export interface Catalog {
  cards: readonly LinkedCard[];
  /** La Carta a cui appartiene un prodotto Cardmarket. */
  cardOfProduct(idProduct: number): string | undefined;
  card(key: string): LinkedCard | undefined;
  versionsOf(key: string): Version[];
  priceOf(entry: ListEntry): EntryPrice;
}

export function createCatalog(
  cards: readonly LinkedCard[],
  prices: Readonly<Record<string, PriceRow>>,
): Catalog {
  const byKey = new Map(cards.map((c) => [cardKey(c.name, c.subtitle), c]));
  const productCard = new Map<number, string>();
  for (const c of cards) {
    for (const p of c.printings) if (p[3] !== 0) productCard.set(p[3], cardKey(c.name, c.subtitle));
  }
  const cache = new Map<string, Version[]>();
  const versionsOf = (key: string): Version[] => {
    const hit = cache.get(key);
    if (hit) return hit;
    const card = byKey.get(key);
    const built = card ? buildVersions(card, prices) : [];
    cache.set(key, built);
    return built;
  };
  return {
    cards,
    card: (key) => byKey.get(key),
    cardOfProduct: (id) => productCard.get(id),
    versionsOf,
    priceOf(entry) {
      if (entry.idProduct === null) return { status: 'to-choose' };
      const version = versionsOf(entry.cardKey).find((v) => v.idProduct === entry.idProduct);
      if (!version) return { status: 'to-choose' };
      const finish = version.finish ?? entry.finish;
      if (finish === null) return { status: 'to-choose' };
      const q = version.quoteFor(finish);
      return q ? { status: 'chosen', cents: q.cents, kind: q.kind } : { status: 'unavailable' };
    },
  };
}

/** Cerca per titolo (in qualsiasi lingua) e restituisce le chiavi delle Carte, le migliori per prime. */
export function searchCards(entries: readonly CatalogEntry[], query: string, limit = 20): string[] {
  const q = normalize(query);
  if (!q) return [];
  const best = new Map<string, { score: number; name: string }>();
  for (const e of entries) {
    const name = normalize(e.name);
    let score: number;
    if (name.startsWith(q)) score = 0;
    else if (name.split(' ').some((w) => w.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    else if (e.subtitle && normalize(e.subtitle).includes(q)) score = 3;
    else continue;
    const ref = e.ref ?? e;
    const key = cardKey(ref.name, ref.subtitle);
    const prev = best.get(key);
    if (!prev || score < prev.score) best.set(key, { score, name: ref.name });
  }
  return [...best.entries()]
    .sort((a, b) => a[1].score - b[1].score || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([key]) => key);
}

export interface ReviewItem {
  id: string;
  /** recognized = Carta identificata; choose = da scegliere tra le candidate. */
  status: 'recognized' | 'choose';
  cardKey: string | null;
  candidates: string[];
  idProduct: number | null;
  finish: Finish | null;
  /** Titolo nella lingua letta, per ogni candidata il cui titolo non è quello inglese. */
  locals: Record<string, LocalTitle>;
}

/** Una riga di "Da rivedere" da una carta rilevata; null se nessuna candidata è nel Catalogo. */
export function reviewFromDetected(
  d: DetectedCard,
  catalog: Catalog,
  newId: () => string,
): ReviewItem | null {
  const candidates: string[] = [];
  const locals: Record<string, LocalTitle> = {};
  for (const c of d.candidates) {
    const english = c.ref ?? c;
    const key = cardKey(english.name, english.subtitle);
    if (catalog.card(key) === undefined || candidates.includes(key)) continue;
    candidates.push(key);
    if (cardKey(c.name, c.subtitle) !== key) locals[key] = { name: c.name, subtitle: c.subtitle };
  }
  if (candidates.length === 0) return null;
  return {
    id: newId(),
    status: d.status,
    cardKey: d.status === 'recognized' ? (candidates[0] ?? null) : null,
    candidates,
    idProduct: null,
    finish: null,
    locals,
  };
}

export function resolveItem(
  item: ReviewItem,
  patch: { cardKey?: string; idProduct?: number | null; finish?: Finish | null },
): ReviewItem {
  const changesCard = patch.cardKey !== undefined && patch.cardKey !== item.cardKey;
  const next: ReviewItem = { ...item };
  if (patch.cardKey !== undefined) {
    next.cardKey = patch.cardKey;
    next.status = 'recognized';
  }
  if (changesCard) {
    next.idProduct = null;
    next.finish = null;
  }
  if (patch.idProduct !== undefined) next.idProduct = patch.idProduct;
  if (patch.finish !== undefined) next.finish = patch.finish;
  return next;
}

/** Le voci da aggiungere alla Lista; le carte senza Carta scelta restano fuori. */
export function toNewEntries(items: readonly ReviewItem[]): {
  entries: NewEntry[];
  skipped: number;
} {
  const entries: NewEntry[] = [];
  let skipped = 0;
  for (const it of items) {
    if (it.cardKey === null) skipped++;
    else {
      const local = it.locals[it.cardKey];
      entries.push({
        cardKey: it.cardKey,
        idProduct: it.idProduct,
        finish: it.finish,
        ...(local ? { local } : {}),
      });
    }
  }
  return { entries, skipped };
}

/** Le righe del CSV per le voci della Lista. */
export function listToCsvRows(list: readonly ListEntry[], catalog: Catalog): CsvListRow[] {
  return list.map((e) => {
    const card = catalog.card(e.cardKey);
    const version =
      e.idProduct === null
        ? undefined
        : catalog.versionsOf(e.cardKey).find((v) => v.idProduct === e.idProduct);
    const printing = version?.printings[0];
    const price = catalog.priceOf(e);
    return {
      quantity: e.quantity,
      name: card?.name ?? '',
      subtitle: card?.subtitle ?? '',
      set: printing?.[0] ?? '',
      number: printing?.[1] ?? '',
      variant: printing?.[2] ?? '',
      finish: version?.finish ?? e.finish ?? '',
      idProduct: e.idProduct,
      priceEur: price.status === 'chosen' ? (price.cents / 100).toFixed(2) : '',
    };
  });
}

/** Le voci da un CSV: dal prodotto se c'è e appartiene alla Carta, altrimenti dal titolo. */
export function entriesFromCsv(
  rows: readonly CsvListRow[],
  catalog: Catalog,
): { entries: (NewEntry & { quantity: number })[]; unknown: string[] } {
  const entries: (NewEntry & { quantity: number })[] = [];
  const unknown: string[] = [];
  for (const r of rows) {
    const byName = cardKey(r.name, r.subtitle || null);
    const byProduct = r.idProduct !== null ? catalog.cardOfProduct(r.idProduct) : undefined;
    // Il prodotto vale solo se la riga non dice un'altra Carta (nome presente nel Catalogo).
    const nameKnown = catalog.card(byName) !== undefined;
    const key = nameKnown ? byName : byProduct;
    if (!key) {
      unknown.push(r.name);
      continue;
    }
    const keepProduct = r.idProduct !== null && catalog.cardOfProduct(r.idProduct) === key;
    entries.push({
      cardKey: key,
      idProduct: keepProduct ? r.idProduct : null,
      finish: keepProduct && (r.finish === 'normal' || r.finish === 'foil') ? r.finish : null,
      quantity: r.quantity,
    });
  }
  return { entries, unknown };
}

/**
 * Di quanto può crescere il totale quando si sceglie la versione delle carte "da scegliere":
 * dal prezzo più basso al più alto tra le versioni (o le due finiture) possibili, per la quantità.
 */
export function unresolvedRange(
  list: readonly ListEntry[],
  catalog: Catalog,
): { minCents: number; maxCents: number; noPrice: number } {
  const out = { minCents: 0, maxCents: 0, noPrice: 0 };
  for (const e of list) {
    if (catalog.priceOf(e).status !== 'to-choose') continue;
    const versions = catalog
      .versionsOf(e.cardKey)
      .filter((v) => v.idProduct !== null && (e.idProduct === null || v.idProduct === e.idProduct));
    const prices: number[] = [];
    for (const v of versions) {
      const finishes = v.finish ? [v.finish] : e.finish ? [e.finish] : v.choices;
      for (const f of finishes) {
        const q = v.quoteFor(f);
        if (q) prices.push(q.cents);
      }
    }
    if (prices.length === 0) {
      out.noPrice += e.quantity;
      continue;
    }
    out.minCents += Math.min(...prices) * e.quantity;
    out.maxCents += Math.max(...prices) * e.quantity;
  }
  return out;
}
