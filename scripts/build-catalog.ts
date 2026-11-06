// Costruisce il Catalogo compatto dai file di swu-db scaricati con fetch-swudb.ts.
// Uso: node scripts/build-catalog.ts <cartella-swudb> <file-di-uscita.json> [titoli-ufficiali-en.json]
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCatalog, type RawPrinting } from '../src/lib/catalog.ts';
import { fillSubtitles, type OfficialCard } from '../src/lib/official-titles.ts';
import { loadCorrections } from '../src/lib/name-corrections.ts';

const [inDir, outFile, officialFile] = process.argv.slice(2);
if (!inDir || !outFile) {
  console.error('Uso: node scripts/build-catalog.ts <cartella-swudb> <file-di-uscita.json>');
  process.exit(1);
}

const corrections = loadCorrections(
  JSON.parse(
    await readFile(new URL('./data/name-corrections.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>,
);

const raw: RawPrinting[] = [];
for (const file of (await readdir(inDir)).sort()) {
  if (!file.endsWith('.json') || file.startsWith('_')) continue;
  raw.push(...(JSON.parse(await readFile(join(inDir, file), 'utf8')) as RawPrinting[]));
}

const official = officialFile
  ? (JSON.parse(await readFile(officialFile, 'utf8')) as OfficialCard[])
  : [];
const catalog = buildCatalog(fillSubtitles(raw, official), corrections);
const printings = catalog.reduce((n, c) => n + c.printings.length, 0);
await writeFile(outFile, JSON.stringify(catalog));
console.log(`${raw.length} stampe grezze -> ${catalog.length} carte, ${printings} stampe uniche`);
