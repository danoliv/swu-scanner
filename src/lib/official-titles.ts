// Il sito ufficiale come seconda fonte (SPEC §7): alcune carte non hanno il sottotitolo in
// swu-db (es. Sifo-Dyas, Watto). Si aggiunge solo se set e numero coincidono e il titolo è lo stesso.
import type { RawPrinting } from './catalog.ts';
import { canonicalSet } from './set-codes.ts';
import { normalize } from './text-match.ts';

export interface OfficialCard {
  set: string | null;
  number: number;
  title: string;
  subtitle: string | null;
}

export function fillSubtitles<T extends RawPrinting>(
  raw: readonly T[],
  official: readonly OfficialCard[],
): T[] {
  const byKey = new Map<string, OfficialCard[]>();
  for (const o of official) {
    if (!o.set) continue;
    const k = `${canonicalSet(o.set)}|${o.number}`;
    byKey.set(k, [...(byKey.get(k) ?? []), o]);
  }
  return raw.map((r) => {
    if (r.Subtitle) return r;
    if (!/^\d+$/.test(r.Number)) return r;
    const matches = byKey.get(`${canonicalSet(r.Set)}|${Number(r.Number)}`) ?? [];
    const found = matches.find((o) => o.subtitle && normalize(o.title) === normalize(r.Name));
    return found?.subtitle ? { ...r, Subtitle: found.subtitle } : r;
  });
}
