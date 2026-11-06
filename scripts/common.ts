// Funzioni comuni agli script di misura.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogEntry } from '../src/lib/detect-cards.ts';
import { buildLocalizedEntries, type OfficialRecord } from '../src/lib/localized-titles.ts';
import { normalize } from '../src/lib/text-match.ts';

/** Le voci di titolo (5 lingue) collegate alle Carte del Catalogo compatto. */
export async function loadCatalogEntries(
  catalogFile: string,
  officialDir: string,
  languages = ['en', 'fr', 'de', 'es', 'it'],
): Promise<CatalogEntry[]> {
  const cards = JSON.parse(await readFile(catalogFile, 'utf8')) as {
    name: string;
    subtitle: string | null;
  }[];
  const records: OfficialRecord[] = [];
  for (const lang of languages) {
    const rows = JSON.parse(
      await readFile(join(officialDir, `${lang}.json`), 'utf8'),
    ) as OfficialRecord[];
    for (const r of rows) {
      records.push({ uid: r.uid, locale: r.locale, title: r.title, subtitle: r.subtitle });
    }
  }
  return buildLocalizedEntries(records, cards).entries;
}

/** Titoli che sono anche parole dei tratti o dei tipi: non fanno da ancora (SPEC §5). */
export const IGNORE_TITLES = new Set(
  ['mandalorian', 'official', 'republic', 'imperial', 'rebel'].map(normalize),
);
