// Esegue la scansione completa del sito (`scanPhoto`: lettura, rilevamento, rilettura ingrandita)
// su tutte le foto e salva le carte rilevate, per misurare il riconoscimento di punta a punta.
// Uso: node scripts/scan-photos.ts <foto> <modelli> <catalog.json> <titoli-ufficiali> <uscita> [tiny|small] [parte/totale]
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import type { RawImage } from '../src/ocr/image.ts';
import { PpocrEngine } from '../src/ocr/ppocr-engine.ts';
import { scanPhoto } from '../src/ocr/scan-photo.ts';
import { IGNORE_TITLES, loadCatalogEntries } from './common.ts';

const [photosDir, modelDir, catalogFile, officialDir, outDir, model = 'tiny', slice = '0/1'] =
  process.argv.slice(2);
if (!photosDir || !modelDir || !catalogFile || !officialDir || !outDir) {
  console.error(
    'Uso: node scripts/scan-photos.ts <foto> <modelli> <catalog.json> <titoli-ufficiali> <uscita> [tiny|small] [parte/totale]',
  );
  process.exit(1);
}
const [part = 0, total = 1] = slice.split('/').map(Number);

const catalog = await loadCatalogEntries(catalogFile, officialDir);
const engine = new PpocrEngine(
  model,
  {
    det: new Uint8Array(await readFile(join(modelDir, `PP-OCRv6_det_${model}.onnx`))),
    rec: new Uint8Array(await readFile(join(modelDir, `PP-OCRv6_rec_${model}.onnx`))),
  },
  {
    ...(process.env.REREAD_BELOW ? { rereadBelow: Number(process.env.REREAD_BELOW) } : {}),
    ...(process.env.PASSES
      ? { passes: process.env.PASSES.split(',').map(Number) as (0 | 90)[] }
      : {}),
  },
);
// FULL_ROTATIONS=1: le 4 rotazioni complete di prima (più lente), per il confronto.
if (process.env.FULL_ROTATIONS === '1') {
  (engine as { recognizeAllOrientations?: unknown }).recognizeAllOrientations = undefined;
}
await engine.load();
await mkdir(outDir, { recursive: true });

const files = (await readdir(photosDir)).filter((f) => /\.jpe?g$/i.test(f)).sort();
for (const [i, name] of files.entries()) {
  if (i % total !== part) continue;
  const target = join(outDir, `${name}.json`);
  if (existsSync(target)) continue;
  const t0 = performance.now();
  const d = jpeg.decode(await readFile(join(photosDir, name)), {
    useTArray: true,
    formatAsRGBA: true,
  });
  const photo: RawImage = {
    data: new Uint8ClampedArray(d.data.buffer, d.data.byteOffset, d.data.length),
    width: d.width,
    height: d.height,
  };
  const rotations = process.env.ROTATIONS
    ? (process.env.ROTATIONS.split(',').map(Number) as (0 | 90 | 180 | 270)[])
    : undefined;
  const result = await scanPhoto(engine, photo, {
    catalog,
    detect: { ignoreTitles: IGNORE_TITLES },
    ...(rotations ? { rotations } : {}),
  });
  const seconds = (performance.now() - t0) / 1000;
  await writeFile(
    target,
    JSON.stringify({ cards: result.cards, refined: result.refinedCards, seconds }),
  );
  console.log(
    `${name}: ${result.cards.length} carte, ${result.refinedCards} risolte dalla rilettura, ${seconds.toFixed(1)}s`,
  );
}
