// Titoli di ogni Carta in tutte le lingue (SPEC §9): il sito ufficiale dà titolo e sottotitolo per
// lingua con lo stesso `cardUid`; la versione inglese lo collega alla Carta del Catalogo.
import type { CatalogEntry } from './detect-cards.ts';
import { CARD_LANGUAGES, isCardLanguage } from './languages.ts';
import { normalize } from './text-match.ts';

export interface OfficialRecord {
  uid: string;
  locale: string;
  title: string;
  subtitle: string | null;
}

export interface LocalizedResult {
  entries: CatalogEntry[];
  /** Carte ufficiali (titolo inglese) senza Carta corrispondente nel Catalogo. */
  unmatched: string[];
}

const key = (name: string, subtitle: string | null): string =>
  `${normalize(name)}|${normalize(subtitle ?? '')}`;

export function buildLocalizedEntries(
  rawRecords: readonly OfficialRecord[],
  catalog: readonly { name: string; subtitle: string | null }[],
): LocalizedResult {
  // Il sito ufficiale scrive a volte '' invece di null.
  const records = rawRecords.map((r) => ({ ...r, subtitle: r.subtitle || null }));
  const front = (t: string | null): string | null =>
    t === null ? null : (t.split(' // ')[0] ?? t);
  const byCatalogKey = new Map(catalog.map((c) => [key(c.name, c.subtitle), c]));
  // Doppia faccia: il sito ufficiale dà solo il lato frontale.
  const byFrontKey = new Map(
    catalog.map((c) => [key(front(c.name) ?? c.name, front(c.subtitle)), c]),
  );
  // Basi: sul sito ufficiale non hanno sottotitolo (in swu-db è il luogo). Vale solo se il titolo è univoco.
  const byNameCount = new Map<string, { card: (typeof catalog)[number]; n: number }>();
  for (const c of catalog) {
    const k = normalize(front(c.name) ?? c.name);
    const prev = byNameCount.get(k);
    byNameCount.set(k, { card: prev?.card ?? c, n: (prev?.n ?? 0) + 1 });
  }
  const find = (title: string, subtitle: string | null) => {
    const exact = byCatalogKey.get(key(title, subtitle)) ?? byFrontKey.get(key(title, subtitle));
    if (exact || subtitle !== null) return exact;
    const byName = byNameCount.get(normalize(title));
    return byName?.n === 1 ? byName.card : undefined;
  };
  const refByUid = new Map<string, { name: string; subtitle: string | null }>();
  const unmatched = new Set<string>();
  for (const r of records) {
    if (r.locale !== 'en' || refByUid.has(r.uid)) continue;
    const card = find(r.title, r.subtitle);
    if (card) refByUid.set(r.uid, { name: card.name, subtitle: card.subtitle });
    else unmatched.add(r.subtitle ? `${r.title}, ${r.subtitle}` : r.title);
  }

  const seen = new Map<string, CatalogEntry>();
  const entries: CatalogEntry[] = [];
  for (const r of records) {
    const ref = refByUid.get(r.uid);
    if (!ref) continue;
    const id = `${key(r.title, r.subtitle)}>${key(ref.name, ref.subtitle)}`;
    let entry = seen.get(id);
    if (!entry) {
      entry = { name: r.title, subtitle: r.subtitle, ref };
      seen.set(id, entry);
      entries.push(entry);
    }
    // Lo stesso titolo in più lingue è una voce sola, con tutte le lingue in cui vale.
    if (isCardLanguage(r.locale) && !(entry.languages ?? []).includes(r.locale)) {
      entry.languages = CARD_LANGUAGES.filter(
        (l) => l === r.locale || (entry?.languages ?? []).includes(l),
      );
    }
  }
  return { entries, unmatched: [...unmatched] };
}
