// Raggruppamento delle righe lette dall'OCR in carte, ancorato sul titolo (SPEC §5):
// ogni riga che coincide con un titolo del Catalogo (>= 0,9) è l'ancora di una carta; il
// sottotitolo si cerca nelle righe subito sotto e centrate sul titolo.
import type { TextLine } from '../ocr/engine.ts';
import { upright, type Box, type Rotation } from './geometry.ts';
import type { CardLanguage } from './languages.ts';
import { makeMatcher, normalize, ocrKey, similarity } from './text-match.ts';

export interface CatalogEntry {
  name: string;
  subtitle: string | null;
  /** Carta del Catalogo a cui appartiene questo nome (una Carta ha un nome per lingua). */
  ref?: { name: string; subtitle: string | null };
  /** Lingue in cui la Carta ha proprio questo titolo e sottotitolo. */
  languages?: CardLanguage[];
}

const refKey = (e: CatalogEntry): string => {
  const r = e.ref ?? e;
  return `${normalize(r.name)}|${normalize(r.subtitle ?? '')}`;
};

export type { Box } from './geometry.ts';

export interface DetectedCard {
  /** recognized = carta identificata; choose = da scegliere tra le candidate. */
  status: 'recognized' | 'choose';
  candidates: CatalogEntry[];
  titleBox: Box;
  /** Rotazione con cui è stata letta la riga del titolo (0 se la carta è dritta). */
  rotation: Rotation;
}

export interface DetectOptions {
  /** Titoli normalizzati da non usare come ancora (es. parole dei tratti come "mandalorian"). */
  ignoreTitles?: ReadonlySet<string>;
  /**
   * Un'ancora più bassa di questa quota del suo 75° percentile (per la stessa rotazione) è testo
   * di regole, non un titolo. 0 disattiva il filtro.
   */
  minRelativeHeight?: number;
  /** Confronto tollerante agli errori tipici dell'OCR (0↔O, spazi): vedi `ocrKey`. */
  tolerantMatch?: boolean;
  titleThreshold?: number;
  subtitleThreshold?: number;
  maxCandidates?: number;
}

const DEFAULTS = {
  titleThreshold: 0.9,
  subtitleThreshold: 0.8,
  maxCandidates: 3,
  // Misurato sul riferimento (2026-11-03): ogni soglia da 0,4 a 0,65 perde più titoli veri di quante righe false toglie.
  minRelativeHeight: 0,
  tolerantMatch: false,
};

const rotationOf = (l: TextLine): Rotation => l.rotation ?? 0;

const centerX = (b: Box): number => b.x + b.width / 2;

function isBelowAndCentered(title: Box, other: Box): boolean {
  const gap = other.y - (title.y + title.height);
  const maxGap = title.height * 4;
  return (
    gap >= -title.height / 2 &&
    gap <= maxGap &&
    Math.abs(centerX(other) - centerX(title)) <= title.width
  );
}

function sameSpot(a: Box, b: Box): boolean {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const size = Math.min(a.width, a.height) * 2;
  return Math.abs(ac.x - bc.x) <= Math.max(a.width, b.width) / 4 && Math.abs(ac.y - bc.y) <= size;
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

export function detectCards(
  lines: readonly TextLine[],
  catalog: readonly CatalogEntry[],
  options: DetectOptions = {},
): DetectedCard[] {
  const { titleThreshold, subtitleThreshold, maxCandidates, minRelativeHeight, tolerantMatch } = {
    ...DEFAULTS,
    ...options,
  };
  const byName = new Map<string, CatalogEntry[]>();
  for (const e of catalog) {
    const k = normalize(e.name);
    if (options.ignoreTitles?.has(k)) continue;
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const titles = [...byName.values()].map((es) => es[0]?.name ?? '');
  const key = tolerantMatch ? ocrKey : normalize;
  const matchTitle = makeMatcher(titles, titleThreshold, key);

  const found: { entries: CatalogEntry[]; line: TextLine; key: string }[] = [];
  for (const l of lines) {
    const m = matchTitle(l.text);
    if (!m) continue;
    const key = normalize(m.title);
    if (found.some((f) => f.key === key && sameSpot(f.line.box, l.box))) continue;
    found.push({ entries: byName.get(key) ?? [], line: l, key });
  }

  // Le righe di regole che contengono un titolo sono molto più basse dei titoli veri della foto.
  const heightsByRotation = new Map<Rotation, number[]>();
  for (const f of found) {
    const r = rotationOf(f.line);
    heightsByRotation.set(r, [...(heightsByRotation.get(r) ?? []), upright(f.line.box, r).height]);
  }
  const minHeight = new Map<Rotation, number>();
  for (const [r, hs] of heightsByRotation) {
    minHeight.set(
      r,
      minRelativeHeight *
        percentile(
          [...hs].sort((x, y) => x - y),
          0.75,
        ),
    );
  }
  const anchors = found.filter((f) => {
    const r = rotationOf(f.line);
    return upright(f.line.box, r).height >= (minHeight.get(r) ?? 0);
  });

  return anchors.map(({ entries, line }): DetectedCard => {
    const titleBox = line.box;
    const rot = rotationOf(line);
    // Una Carta con lo stesso titolo in più lingue conta una volta sola per le candidate, ma il
    // sottotitolo si confronta con tutte le voci: cambia da una lingua all'altra.
    const firstPerCard = entries.filter(
      (e, i) => entries.findIndex((x) => refKey(x) === refKey(e)) === i,
    );
    const titleUpright = upright(titleBox, rot);
    // Il sottotitolo letto sotto il titolo, confrontato con le voci date: la migliore, se basta.
    const bestSubtitle = (
      among: readonly CatalogEntry[],
    ): { entry: CatalogEntry; score: number } | null => {
      let best: { entry: CatalogEntry; score: number } | null = null;
      for (const other of lines) {
        if (other === line || rotationOf(other) !== rot) continue;
        if (!isBelowAndCentered(titleUpright, upright(other.box, rot))) continue;
        for (const e of among) {
          if (!e.subtitle) continue;
          const score = similarity(other.text, e.subtitle, key);
          if (score >= subtitleThreshold && (!best || score > best.score))
            best = { entry: e, score };
        }
      }
      return best;
    };
    /** La candidata con le lingue in cui la Carta ha questo titolo (e, se si legge, questo sottotitolo). */
    const withLanguages = (candidate: CatalogEntry): CatalogEntry => {
      const sameCard = entries.filter((e) => refKey(e) === refKey(candidate));
      const bySubtitle = bestSubtitle(sameCard);
      const languages = bySubtitle ? (bySubtitle.entry.languages ?? []) : unionLanguages(sameCard);
      return languages.length > 0 ? { ...candidate, languages } : candidate;
    };
    if (firstPerCard.length === 1) {
      const [only] = firstPerCard as [CatalogEntry];
      const best = bestSubtitle(entries);
      return {
        status: 'recognized',
        candidates: [best ? best.entry : withLanguages(only)],
        titleBox,
        rotation: rot,
      };
    }
    const best = bestSubtitle(entries);
    return best
      ? { status: 'recognized', candidates: [best.entry], titleBox, rotation: rot }
      : {
          status: 'choose',
          candidates: firstPerCard.slice(0, maxCandidates).map(withLanguages),
          titleBox,
          rotation: rot,
        };
  });
}

const unionLanguages = (entries: readonly CatalogEntry[]): CardLanguage[] => [
  ...new Set(entries.flatMap((e) => e.languages ?? [])),
];
