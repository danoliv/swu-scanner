// Il modello dell'app: Catalogo con versioni e prezzi, voci "da rivedere" di una Scansione,
// ricerca per titolo. Logica pura, senza DOM.
import type { LinkedCard } from '../lib/attach-links.ts';
import type { CatalogEntry, DetectedCard } from '../lib/detect-cards.ts';
import type { EntryPrice, ListEntry, LocalTitle, NewEntry } from '../lib/list.ts';
import type { Finish } from '../lib/pricing.ts';
import type { PriceRow } from '../lib/prices.ts';
import type { CsvListRow } from '../lib/list-csv.ts';
import { normalize } from '../lib/text-match.ts';
import { CARD_LANGUAGES, isCardLanguage, type CardLanguage } from '../lib/languages.ts';
import type { SharedEntry } from '../lib/share.ts';
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
      if (entry.shared && entry.idProduct !== null) {
        return { status: 'chosen', cents: entry.shared.cents, kind: entry.shared.kind };
      }
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

/** Titolo e sottotitolo di ogni Carta nelle lingue in cui esiste. */
export interface LanguageIndex {
  /** Le lingue in cui la Carta ha un titolo, nell'ordine en, fr, de, es, it. */
  languagesOf(cardKey: string): CardLanguage[];
  titleIn(cardKey: string, language: CardLanguage): LocalTitle | null;
}

export function createLanguageIndex(entries: readonly CatalogEntry[]): LanguageIndex {
  // Il sito ufficiale a volte ripete il testo inglese in un'altra lingua (carta non ancora tradotta):
  // per ogni lingua vale la voce più specifica, cioè quella con meno lingue.
  const byCard = new Map<
    string,
    Partial<Record<CardLanguage, { title: LocalTitle; width: number }>>
  >();
  for (const e of entries) {
    const ref = e.ref ?? e;
    const key = cardKey(ref.name, ref.subtitle);
    const titles = byCard.get(key) ?? {};
    const width = e.languages?.length ?? 0;
    for (const l of e.languages ?? []) {
      const prev = titles[l];
      if (!prev || width < prev.width) {
        titles[l] = { title: { name: e.name, subtitle: e.subtitle }, width };
      }
    }
    byCard.set(key, titles);
  }
  return {
    languagesOf: (key) => CARD_LANGUAGES.filter((l) => byCard.get(key)?.[l] !== undefined),
    titleIn: (key, language) => byCard.get(key)?.[language]?.title ?? null,
  };
}

/**
 * Il titolo locale di una voce nella lingua data: il titolo se differisce da quello inglese della
 * Carta, `null` se è lo stesso (si torna a quello inglese), `undefined` se non lo sappiamo.
 */
export function localPatch(
  index: LanguageIndex,
  key: string,
  language: CardLanguage,
): LocalTitle | null | undefined {
  const title = index.titleIn(key, language);
  if (!title) return undefined;
  return cardKey(title.name, title.subtitle) === key ? null : title;
}

/** Come `localPatch`, ma per chi vuole solo il titolo da mostrare (niente se è quello inglese). */
export function localTitleFor(
  index: LanguageIndex,
  catalog: Catalog,
  key: string,
  language: CardLanguage,
): LocalTitle | undefined {
  if (!catalog.card(key)) return undefined;
  return localPatch(index, key, language) ?? undefined;
}

/** La lingua di una carta da rivedere, con il titolo nella lingua scelta. */
export function setItemLanguage(
  item: ReviewItem,
  language: CardLanguage | null,
  index: LanguageIndex,
): ReviewItem {
  if (item.cardKey === null || language === null) return { ...item, language };
  const patch = localPatch(index, item.cardKey, language);
  const locals = { ...item.locals };
  if (patch) locals[item.cardKey] = patch;
  else if (patch === null) delete locals[item.cardKey];
  return { ...item, language, locals };
}

/**
 * La lingua più probabile tra quelle possibili: se è una sola, quella; se il titolo vale in più
 * lingue (succede spesso: "Darth Vader" è uguale in inglese, tedesco, spagnolo e italiano) l'inglese.
 */
export function guessLanguage(languages: readonly CardLanguage[]): CardLanguage | null {
  if (languages.length === 0) return null;
  return languages.includes('en') ? 'en' : (languages[0] ?? null);
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
  /** Le lingue possibili di ogni candidata, secondo ciò che si è letto. */
  languages: Record<string, CardLanguage[]>;
  /** La lingua della carta; null se non si sa. */
  language: CardLanguage | null;
}

/** Una riga di "Da rivedere" da una carta rilevata; null se nessuna candidata è nel Catalogo. */
export function reviewFromDetected(
  d: DetectedCard,
  catalog: Catalog,
  newId: () => string,
): ReviewItem | null {
  const candidates: string[] = [];
  const locals: Record<string, LocalTitle> = {};
  const languages: Record<string, CardLanguage[]> = {};
  for (const c of d.candidates) {
    const english = c.ref ?? c;
    const key = cardKey(english.name, english.subtitle);
    if (catalog.card(key) === undefined || candidates.includes(key)) continue;
    candidates.push(key);
    languages[key] = c.languages ?? [];
    if (cardKey(c.name, c.subtitle) !== key) locals[key] = { name: c.name, subtitle: c.subtitle };
  }
  if (candidates.length === 0) return null;
  const chosen = d.status === 'recognized' ? (candidates[0] ?? null) : null;
  return {
    id: newId(),
    status: d.status,
    cardKey: chosen,
    candidates,
    idProduct: null,
    finish: null,
    locals,
    languages,
    language: chosen ? guessLanguage(languages[chosen] ?? []) : null,
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
    next.language = guessLanguage(item.languages[patch.cardKey as string] ?? []);
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
        ...(it.language ? { language: it.language } : {}),
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
      language: e.language ?? '',
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
      ...(isCardLanguage(r.language) ? { language: r.language } : {}),
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

/** Le voci di una Lista condivisa nel Catalogo di questo sito; `unknown` conta le carte non trovate. */
export function entriesFromShared(
  shared: readonly SharedEntry[],
  catalog: Catalog,
  languages?: LanguageIndex,
): { entries: (NewEntry & { quantity: number })[]; unknown: number } {
  const entries: (NewEntry & { quantity: number })[] = [];
  let unknown = 0;
  for (const s of shared) {
    const byProduct = s.idProduct !== null ? catalog.cardOfProduct(s.idProduct) : undefined;
    const key =
      byProduct ?? (s.cardKey !== null && catalog.card(s.cardKey) ? s.cardKey : undefined);
    if (!key) {
      unknown += s.quantity;
      continue;
    }
    const keepProduct = s.idProduct !== null && byProduct === key;
    const local =
      s.language && languages ? localTitleFor(languages, catalog, key, s.language) : undefined;
    entries.push({
      cardKey: key,
      idProduct: keepProduct ? s.idProduct : null,
      finish: keepProduct ? s.finish : null,
      quantity: s.quantity,
      ...(s.language ? { language: s.language } : {}),
      ...(local ? { local } : {}),
      ...(keepProduct && s.price ? { shared: s.price } : {}),
    });
  }
  return { entries, unknown };
}
