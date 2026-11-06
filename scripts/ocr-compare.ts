// Confronta le righe lette dal motore del sito (onnxruntime-web in Node) con quelle di Python
// (.wayfinder/research/ocr_lines.py) sulla stessa foto.
// Uso: node scripts/ocr-compare.ts <foto.jpg> <cartella-modelli> <righe-python.json> [tiny|small]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { PpocrEngine } from '../src/ocr/ppocr-engine.ts';
import { readPhoto } from '../src/ocr/read-photo.ts';
import { resizeImage, type RawImage } from '../src/ocr/image.ts';
import { similarity } from '../src/lib/text-match.ts';

const [photo, modelDir, pythonLines, model = 'tiny'] = process.argv.slice(2);
if (!photo || !modelDir || !pythonLines) {
  console.error(
    'Uso: node scripts/ocr-compare.ts <foto.jpg> <cartella-modelli> <righe-python.json> [tiny|small]',
  );
  process.exit(1);
}

const decoded = jpeg.decode(await readFile(photo), { useTArray: true, formatAsRGBA: true });
let image: RawImage = {
  data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length),
  width: decoded.width,
  height: decoded.height,
};
const k = Math.min(1, 1920 / Math.max(image.width, image.height));
if (k < 1) image = resizeImage(image, Math.round(image.width * k), Math.round(image.height * k));

const engine = new PpocrEngine(model, {
  det: new Uint8Array(await readFile(join(modelDir, `PP-OCRv6_det_${model}.onnx`))),
  rec: new Uint8Array(await readFile(join(modelDir, `PP-OCRv6_rec_${model}.onnx`))),
});
await engine.load();
const t0 = performance.now();
const rotations = (process.env.ROTATIONS ?? '0,90,180,270').split(',').map(Number) as (
  0 | 90 | 180 | 270
)[];
const lines = await readPhoto(engine, image, rotations);
const secs = ((performance.now() - t0) / 1000).toFixed(1);

const py = (
  JSON.parse(await readFile(pythonLines, 'utf8')) as { lines: { text: string; rotation: number }[] }
).lines.filter((l) => rotations.includes(l.rotation as 0 | 90 | 180 | 270));
let same = 0;
for (const p of py)
  if (lines.some((l) => l.rotation === p.rotation && similarity(l.text, p.text) >= 0.9)) same++;
console.log(`Foto ${image.width}x${image.height}, rotazioni ${rotations.join(',')}: ${secs} s`);
console.log(
  `Righe: sito ${lines.length}, Python ${py.length}; righe Python ritrovate dal sito: ${same} (${((100 * same) / py.length).toFixed(1)}%)`,
);
