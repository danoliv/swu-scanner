// La Lista dell'utente (SPEC §6): voci (Carta, versione, finitura) con quantità, operazioni immutabili
// e totale. Una voce senza versione o con la finitura da scegliere è "da scegliere".
import type { Finish } from './pricing.ts';

/** Titolo e sottotitolo nella lingua della carta (se diversi da quelli inglesi del Catalogo). */
export interface LocalTitle {
  name: string;
  subtitle: string | null;
}

/** Il prezzo ricevuto con una Lista condivisa: resta fisso, con la sua data, finché non si aggiornano i prezzi. */
export interface SharedPrice {
  cents: number;
  kind: 'trend' | 'low';
  /** Data dei prezzi di chi ha condiviso (ISO). */
  date: string;
}

export interface ListEntry {
  id: string;
  /** Chiave della Carta nel Catalogo (titolo e sottotitolo). */
  cardKey: string;
  /** Prodotto Cardmarket scelto; null = versione da scegliere. */
  idProduct: number | null;
  /** Finitura scelta; null = da scegliere. */
  finish: Finish | null;
  quantity: number;
  local?: LocalTitle;
  shared?: SharedPrice;
}

export type NewEntry = Pick<ListEntry, 'cardKey' | 'idProduct' | 'finish'> & {
  local?: LocalTitle;
  shared?: SharedPrice;
};

const MAX_QUANTITY = 999;

const sameVersion = (a: NewEntry, b: NewEntry): boolean =>
  a.cardKey === b.cardKey && a.idProduct === b.idProduct && a.finish === b.finish;

export function addEntry(
  list: readonly ListEntry[],
  entry: NewEntry,
  newId: () => string,
): ListEntry[] {
  const existing = list.find((e) => sameVersion(e, entry));
  if (existing) {
    return list.map((e) =>
      e === existing ? { ...e, quantity: Math.min(MAX_QUANTITY, e.quantity + 1) } : e,
    );
  }
  return [...list, { id: newId(), ...entry, quantity: 1 }];
}

/**
 * Unisce voci con quantità (da una Lista condivisa): se la versione c'è già si sommano le quantità e
 * resta il prezzo della voce esistente. `merged` conta le voci già presenti.
 */
export function mergeEntries(
  list: readonly ListEntry[],
  incoming: readonly (NewEntry & { quantity: number })[],
  newId: () => string,
): { list: ListEntry[]; merged: number } {
  let out = [...list];
  let merged = 0;
  for (const { quantity, ...entry } of incoming) {
    const existing = out.find((e) => sameVersion(e, entry));
    if (existing) {
      merged++;
      out = out.map((e) =>
        e === existing ? { ...e, quantity: Math.min(MAX_QUANTITY, e.quantity + quantity) } : e,
      );
    } else {
      out.push({ id: newId(), ...entry, quantity: Math.min(MAX_QUANTITY, quantity) });
    }
  }
  return { list: out, merged };
}

/** Toglie i prezzi ricevuti: da ora le voci usano i prezzi di questo sito. */
export function clearSharedPrices(list: readonly ListEntry[]): ListEntry[] {
  return list.map((e) => {
    if (!e.shared) return e;
    const rest: ListEntry = { ...e };
    delete rest.shared;
    return rest;
  });
}

/** Cambia versione o finitura di una voce; se ne esiste già una uguale, le unisce sommando le quantità. */
export function updateEntry(
  list: readonly ListEntry[],
  id: string,
  patch: Partial<Pick<ListEntry, 'idProduct' | 'finish'>>,
): ListEntry[] {
  const target = list.find((e) => e.id === id);
  if (!target) return [...list];
  const changed: ListEntry = { ...target, ...patch };
  // Con un'altra versione o finitura il prezzo ricevuto non vale più.
  delete changed.shared;
  const twin = list.find((e) => e.id !== id && sameVersion(e, changed));
  if (!twin) return list.map((e) => (e.id === id ? changed : e));
  return list
    .filter((e) => e.id !== id)
    .map((e) =>
      e === twin ? { ...e, quantity: Math.min(MAX_QUANTITY, e.quantity + target.quantity) } : e,
    );
}

export function setQuantity(list: readonly ListEntry[], id: string, quantity: number): ListEntry[] {
  const q = Math.min(MAX_QUANTITY, Math.round(quantity));
  if (q <= 0) return removeEntry(list, id);
  return list.map((e) => (e.id === id ? { ...e, quantity: q } : e));
}

export function removeEntry(list: readonly ListEntry[], id: string): ListEntry[] {
  return list.filter((e) => e.id !== id);
}

/** Il prezzo di una voce, deciso da chi conosce il Catalogo e i prezzi. */
export type EntryPrice =
  | { status: 'chosen'; cents: number; kind: 'trend' | 'low' }
  | { status: 'to-choose' }
  | { status: 'unavailable' };

export interface ListSummary {
  /** Somma delle voci con versione scelta e prezzo, per la quantità. */
  totalCents: number;
  /** Carte (con la quantità) ancora da scegliere. */
  toChoose: number;
  /** Carte (con la quantità) con solo il prezzo minimo ("da X €"). */
  lowCount: number;
  /** Carte (con la quantità) senza nessun prezzo. */
  unavailable: number;
  /** Tutte le carte, con la quantità. */
  cards: number;
}

export function summarize(
  list: readonly ListEntry[],
  priceOf: (entry: ListEntry) => EntryPrice,
): ListSummary {
  const s: ListSummary = { totalCents: 0, toChoose: 0, lowCount: 0, unavailable: 0, cards: 0 };
  for (const e of list) {
    s.cards += e.quantity;
    const p = priceOf(e);
    if (p.status === 'to-choose') s.toChoose += e.quantity;
    else if (p.status === 'unavailable') s.unavailable += e.quantity;
    else {
      s.totalCents += p.cents * e.quantity;
      if (p.kind === 'low') s.lowCount += e.quantity;
    }
  }
  return s;
}
