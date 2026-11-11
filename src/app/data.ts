// Caricamento dei dati del sito (Catalogo, prezzi, titoli in 5 lingue) dalla cartella `data/`.
import type { LinkedCard } from '../lib/attach-links.ts';
import type { CatalogEntry } from '../lib/detect-cards.ts';
import type { Prices } from '../lib/prices.ts';
import { expandTitles, type CompactTitle } from '../lib/titles.ts';
import { createCatalog, createLanguageIndex, type Catalog, type LanguageIndex } from './model.ts';

export interface AppData {
  catalog: Catalog;
  /** I titoli in formato compatto e i nomi delle Carte, per il motore di lettura nel worker. */
  compactTitles: CompactTitle[];
  cardNames: { name: string; subtitle: string | null }[];
  titles: CatalogEntry[];
  /** Le lingue di ogni Carta e il suo titolo in ciascuna. */
  languages: LanguageIndex;
  /** Data del price guide, come scritta da Cardmarket (ISO). */
  priceDate: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} per ${url}`);
  return (await res.json()) as T;
}

export async function loadData(base: string): Promise<AppData> {
  const [cards, prices, titles] = await Promise.all([
    getJson<LinkedCard[]>(`${base}data/catalog.json`),
    getJson<Prices>(`${base}data/prices.json`),
    getJson<CompactTitle[]>(`${base}data/titles.json`),
  ]);
  const expanded = expandTitles(titles, cards);
  return {
    compactTitles: titles,
    cardNames: cards.map((c) => ({ name: c.name, subtitle: c.subtitle })),
    catalog: createCatalog(cards, prices.p),
    titles: expanded,
    languages: createLanguageIndex(expanded),
    priceDate: prices.date,
  };
}
