// Per ogni foto, elenca i ritagli da rileggere ingranditi (SPEC §5): uno per ogni carta "da scegliere".
// Uso: node scripts/zoom-requests.ts <cartella-righe-ocr> <catalog.json> <cartella-titoli-ufficiali> <richieste.json>
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectCards } from '../src/lib/detect-cards.ts';
import { buildLocalizedEntries, type OfficialRecord } from '../src/lib/localized-titles.ts';
import { zoomCrop } from '../src/lib/zoom.ts';
import type { TextLine } from '../src/ocr/engine.ts';

const [linesDir, catalogFile, officialDir, outFile] = process.argv.slice(2);
if (!linesDir || !catalogFile || !officialDir || !outFile) {
  console.error(
    'Uso: node scripts/zoom-requests.ts <cartella-righe-ocr> <catalog.json> <cartella-titoli-ufficiali> <richieste.json>',
  );
  process.exit(1);
}

const cards = JSON.parse(await readFile(catalogFile, 'utf8')) as {
  name: string;
  subtitle: string | null;
}[];
const records: OfficialRecord[] = [];
for (const lang of ['en', 'fr', 'de', 'es', 'it']) {
  const rows = JSON.parse(
    await readFile(join(officialDir, `${lang}.json`), 'utf8'),
  ) as OfficialRecord[];
  for (const r of rows)
    records.push({ uid: r.uid, locale: r.locale, title: r.title, subtitle: r.subtitle });
}
const { entries } = buildLocalizedEntries(records, cards);
const IGNORE = new Set(['mandalorian', 'official', 'republic', 'imperial', 'rebel']);

const requests: Record<
  string,
  { x: number; y: number; width: number; height: number; rotation: number }[]
> = {};
let total = 0;
for (const file of (await readdir(linesDir)).sort()) {
  const photo = file.replace(/\.json$/, '');
  const { width, height, lines } = JSON.parse(await readFile(join(linesDir, file), 'utf8')) as {
    width: number;
    height: number;
    lines: TextLine[];
  };
  const list = detectCards(lines, entries, { ignoreTitles: IGNORE })
    .filter((d) => d.status === 'choose')
    .map((d) => ({ ...zoomCrop(d.titleBox, d.rotation, { width, height }), rotation: d.rotation }));
  if (list.length > 0) requests[photo] = list;
  total += list.length;
}
await writeFile(outFile, JSON.stringify(requests));
console.log(`${total} ritagli in ${Object.keys(requests).length} foto -> ${outFile}`);
