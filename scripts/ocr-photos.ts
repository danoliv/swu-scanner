// Legge tutte le foto di una cartella con il motore del sito (onnxruntime-web in Node) e salva le righe
// nello stesso formato di .wayfinder/research/ocr_lines.py, per misurare il riconoscimento.
// Uso: node scripts/ocr-photos.ts <cartella-foto> <cartella-modelli> <cartella-uscita> [tiny|small] [parte/totale]
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { resizeImage, type RawImage } from '../src/ocr/image.ts';
import { PpocrEngine } from '../src/ocr/ppocr-engine.ts';
import { readPhoto } from '../src/ocr/read-photo.ts';

const [photosDir, modelDir, outDir, model = 'tiny', slice = '0/1'] = process.argv.slice(2);
if (!photosDir || !modelDir || !outDir) {
  console.error(
    'Uso: node scripts/ocr-photos.ts <cartella-foto> <cartella-modelli> <cartella-uscita> [tiny|small] [parte/totale]',
  );
  process.exit(1);
}
const [part = 0, total = 1] = slice.split('/').map(Number);

const engine = new PpocrEngine(model, {
  det: new Uint8Array(await readFile(join(modelDir, `PP-OCRv6_det_${model}.onnx`))),
  rec: new Uint8Array(await readFile(join(modelDir, `PP-OCRv6_rec_${model}.onnx`))),
});
await engine.load();
await mkdir(outDir, { recursive: true });

const files = (await readdir(photosDir)).filter((f) => /\.(jpe?g)$/i.test(f)).sort();
for (const [i, name] of files.entries()) {
  if (i % total !== part) continue;
  const target = join(outDir, `${name}.json`);
  if (existsSync(target)) continue;
  const t0 = performance.now();
  const decoded = jpeg.decode(await readFile(join(photosDir, name)), {
    useTArray: true,
    formatAsRGBA: true,
  });
  let image: RawImage = {
    data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length),
    width: decoded.width,
    height: decoded.height,
  };
  const k = Math.min(1, 1920 / Math.max(image.width, image.height));
  if (k < 1) image = resizeImage(image, Math.round(image.width * k), Math.round(image.height * k));
  const lines = await readPhoto(engine, image);
  await writeFile(target, JSON.stringify({ width: image.width, height: image.height, lines }));
  console.log(`${name}: ${lines.length} righe in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}
