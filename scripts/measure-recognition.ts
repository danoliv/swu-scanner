// Misura il riconoscimento della Carta sul riferimento (verita.csv) con le righe OCR già estratte
// (.wayfinder/research/ocr_lines.py), per fascia di carte per foto (SPEC §11).
// Uso: node scripts/measure-recognition.ts <verita.csv> <cartella-righe-ocr> <catalog.json> <cartella-titoli-ufficiali> [lingue]
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { detectCards, type DetectedCard } from '../src/lib/detect-cards.ts';
import { buildLocalizedEntries, type OfficialRecord } from '../src/lib/localized-titles.ts';
import { scoreDetection, type Score, type TruthCard } from '../src/lib/score.ts';
import type { TextLine } from '../src/ocr/engine.ts';
import { normalize } from '../src/lib/text-match.ts';

const [csvFile, linesDir, catalogFile, officialDir, langArg] = process.argv.slice(2);
const cropsDir = process.env.CROPS_DIR;
const tilesDir = process.env.TILES_DIR;
// SCAN_DIR: carte già rilevate da scripts/scan-photos.ts (pipeline completa del sito).
const scanDir = process.env.SCAN_DIR;
if (!csvFile || !linesDir || !catalogFile || !officialDir) {
  console.error(
    'Uso: node scripts/measure-recognition.ts <verita.csv> <cartella-righe-ocr> <catalog.json>',
  );
  process.exit(1);
}

const cards = JSON.parse(await readFile(catalogFile, 'utf8')) as {
  name: string;
  subtitle: string | null;
}[];
const languages = (langArg ?? 'en,fr,de,es,it').split(',');
const records: OfficialRecord[] = [];
for (const lang of languages) {
  const rows = JSON.parse(await readFile(join(officialDir, `${lang}.json`), 'utf8')) as {
    uid: string;
    locale: string;
    title: string;
    subtitle: string | null;
  }[];
  for (const r of rows)
    records.push({ uid: r.uid, locale: r.locale, title: r.title, subtitle: r.subtitle });
}
const { entries: catalog, unmatched } = buildLocalizedEntries(records, cards);
console.log(
  `Voci di titolo: ${catalog.length} (${languages.join(', ')}); carte ufficiali senza Catalogo: ${unmatched.length}`,
);

// Titoli che sono anche parole dei tratti/tipi: non fanno da ancora (SPEC §5).
const IGNORE = new Set(['mandalorian', 'official', 'republic', 'imperial', 'rebel'].map(normalize));

const rows = (await readFile(csvFile, 'utf8')).trim().split('\n');
const header = (rows.shift() ?? '').split(';');
const col = (r: string[], name: string): string => r[header.indexOf(name)] ?? '';
const truthByPhoto = new Map<string, TruthCard[]>();
for (const line of rows) {
  const r = line.split(';');
  const stato = col(r, 'stato');
  if (stato === 'illeggibile') continue;
  const list = truthByPhoto.get(col(r, 'file')) ?? [];
  list.push({
    name: col(r, 'nome_carta'),
    subtitle: stato === 'carta' && col(r, 'sottotitolo') ? col(r, 'sottotitolo') : null,
  });
  truthByPhoto.set(col(r, 'file'), list);
}

const bands: [string, (n: number) => boolean][] = [
  ['1-5 carte', (n) => n <= 5],
  ['6-15 carte', (n) => n >= 6 && n <= 15],
  ['16+ carte', (n) => n >= 16],
];
const totals = new Map<string, Score>();
const add = (key: string, s: Score): void => {
  const t = totals.get(key) ?? {
    truth: 0,
    recognizedCorrect: 0,
    wrongSilent: 0,
    chooseCorrect: 0,
    chooseWrong: 0,
    falseRows: 0,
    missed: 0,
  };
  for (const k of Object.keys(t) as (keyof Score)[]) t[k] += s[k];
  totals.set(key, t);
};

const available = new Set(await readdir(scanDir ?? linesDir));
let measured = 0;
for (const [photo, truth] of truthByPhoto) {
  const file = `${photo}.json`;
  if (!available.has(file)) continue;
  if (scanDir) {
    const { cards } = JSON.parse(await readFile(join(scanDir, file), 'utf8')) as {
      cards: DetectedCard[];
    };
    const s = scoreDetection(truth, cards);
    measured++;
    add('TUTTE', s);
    for (const [name, inBand] of bands) if (inBand(truth.length)) add(name, s);
    continue;
  }
  const { lines: baseLines } = JSON.parse(await readFile(join(linesDir, file), 'utf8')) as {
    lines: TextLine[];
  };
  // Seconda lettura: i ritagli ingranditi attorno al titolo delle carte "da scegliere" (SPEC §5).
  let lines = baseLines;
  if (tilesDir) {
    try {
      const tiled = JSON.parse(await readFile(join(tilesDir, file), 'utf8')) as {
        lines: TextLine[];
      };
      lines = [...lines, ...tiled.lines];
    } catch {
      // foto non divisa in riquadri
    }
  }
  if (cropsDir) {
    try {
      const zoomed = JSON.parse(await readFile(join(cropsDir, file), 'utf8')) as {
        lines: TextLine[];
      };
      lines = [...baseLines, ...zoomed.lines];
    } catch {
      // nessun ritaglio per questa foto
    }
  }
  const s = scoreDetection(
    truth,
    detectCards(lines, catalog, {
      ignoreTitles: IGNORE,
      tolerantMatch: process.env.TOLERANT === '1',
      ...(process.env.MIN_REL ? { minRelativeHeight: Number(process.env.MIN_REL) } : {}),
    }),
  );
  measured++;
  add('TUTTE', s);
  for (const [name, inBand] of bands) if (inBand(truth.length)) add(name, s);
}

const pct = (a: number, b: number): string => (b === 0 ? '-' : `${((100 * a) / b).toFixed(1)}%`);
console.log(`Foto misurate: ${measured} su ${truthByPhoto.size}`);
console.table(
  [...totals].map(([fascia, s]) => ({
    fascia,
    carte: s.truth,
    'riconosciute giuste': pct(s.recognizedCorrect, s.truth),
    'giuste o da scegliere': pct(s.recognizedCorrect + s.chooseCorrect, s.truth),
    'errore silenzioso': pct(s.wrongSilent, s.recognizedCorrect + s.wrongSilent),
    mancate: pct(s.missed, s.truth),
    'righe false': s.falseRows,
  })),
);
