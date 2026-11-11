// Motore di lettura PP-OCRv6 (rilevatore + lettore) con onnxruntime-web, un thread, senza COOP/COEP.
// Il pre e post-processo sta in moduli puri (`image`, `db-postprocess`, `ctc`); qui c'è solo il collegamento.
import * as ort from 'onnxruntime-web/wasm';
import { buildCharset, ctcDecode } from './ctc.ts';
import { dbPostprocess } from './db-postprocess.ts';
import type { OcrEngine, TextLine } from './engine.ts';
import { readBestOrientation, type Reading } from './orientation.ts';
import {
  detSize,
  isTall,
  rotateImage,
  warpQuadStraight,
  type Rect,
  recWidth,
  resizeImage,
  toTensor,
  unrotateBox,
  warpQuad,
  type Quad,
  type RawImage,
} from './image.ts';
import { readModelMetadata } from './onnx-meta.ts';
import { passFraction } from './progress.ts';

export interface PpocrModels {
  /** Il file ONNX del rilevatore e del lettore, come byte (scaricati dalla cache o da disco). */
  det: Uint8Array;
  rec: Uint8Array;
}

/** Punteggio minimo di una riga letta (RapidOCR: `text_score`). */
const TEXT_SCORE = 0.5;
const REC_HEIGHT = 48;
/** Sotto questa fiducia si prova a leggere la riga anche nel verso opposto. */
const DEFAULT_REREAD_BELOW = 0.6;

export class PpocrEngine implements OcrEngine {
  private det?: ort.InferenceSession;
  private rec?: ort.InferenceSession;
  private charset: string[] = [];

  readonly id: string;
  private readonly models: PpocrModels;
  private readonly rereadBelow: number;
  private readonly passes: readonly (0 | 90)[];

  constructor(
    id: string,
    models: PpocrModels,
    options: { rereadBelow?: number; passes?: readonly (0 | 90)[] } = {},
  ) {
    this.id = id;
    this.models = models;
    this.rereadBelow = options.rereadBelow ?? DEFAULT_REREAD_BELOW;
    this.passes = options.passes ?? [0, 90];
  }

  async load(onProgress?: (fraction: number) => void): Promise<void> {
    ort.env.wasm.numThreads = 1;
    const options: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'] };
    this.det = await ort.InferenceSession.create(this.models.det, options);
    onProgress?.(0.5);
    this.rec = await ort.InferenceSession.create(this.models.rec, options);
    const character = readModelMetadata(this.models.rec).character;
    if (!character)
      throw new Error('Il modello di lettura non contiene il dizionario dei caratteri');
    this.charset = buildCharset(character.split('\n'));
    onProgress?.(1);
  }

  dispose(): void {
    void this.det?.release();
    void this.rec?.release();
    delete this.det;
    delete this.rec;
  }

  /** Rilevamento delle righe di testo: rettangoli ruotati nelle coordinate dell'immagine. */
  private async detect(image: RawImage): Promise<{ quad: Quad; box: Rect }[]> {
    const det = this.det;
    if (!det) throw new Error('Motore non caricato: chiamare load()');
    const size = detSize(image.width, image.height);
    const resized = resizeImage(image, size.width, size.height);
    const input = new ort.Tensor('float32', toTensor(resized, { bgr: true, mean: 0.5, std: 0.5 }), [
      1,
      3,
      size.height,
      size.width,
    ]);
    const out = await det.run({ [det.inputNames[0] as string]: input });
    const probs = out[det.outputNames[0] as string]?.data as Float32Array;
    const boxes = dbPostprocess({ data: probs, width: size.width, height: size.height });
    const sx = image.width / size.width;
    const sy = image.height / size.height;
    return boxes.map((b) => ({
      box: { x: b.x * sx, y: b.y * sy, width: b.width * sx, height: b.height * sy },
      quad: b.quad.map(([qx, qy]) => [qx * sx, qy * sy]) as Quad,
    }));
  }

  /** Legge una riga già raddrizzata (testo dritto). */
  private async read(crop: RawImage): Promise<Reading> {
    const rec = this.rec;
    if (!rec) throw new Error('Motore non caricato: chiamare load()');
    const imgW = recWidth(crop.width, crop.height, REC_HEIGHT);
    const w = Math.min(imgW, Math.max(1, Math.ceil((REC_HEIGHT * crop.width) / crop.height)));
    const tensor = toTensor(resizeImage(crop, w, REC_HEIGHT), {
      bgr: true,
      mean: 0.5,
      std: 0.5,
      padToWidth: imgW,
    });
    const result = await rec.run({
      [rec.inputNames[0] as string]: new ort.Tensor('float32', tensor, [1, 3, REC_HEIGHT, imgW]),
    });
    const o = result[rec.outputNames[0] as string];
    if (!o) return { text: '', confidence: 0 };
    const [, steps, classes] = o.dims as [number, number, number];
    return ctcDecode(o.data as Float32Array, steps, classes, this.charset);
  }

  async recognize(image: RawImage): Promise<TextLine[]> {
    const lines: TextLine[] = [];
    for (const { box, quad } of await this.detect(image)) {
      const { text, confidence } = await this.read(warpQuad(image, quad));
      if (text && confidence >= TEXT_SCORE) lines.push({ text, box, confidence });
    }
    return lines;
  }

  /**
   * Un solo rilevamento sull'immagine; ogni riga si legge nel verso più probabile (dritta, oppure
   * ruotata di 90° se il riquadro è verticale) e, se la fiducia è bassa, anche nel verso opposto.
   * `rotation` è il verso con cui la riga è stata letta, come per `readPhoto`.
   */
  async recognizeAllOrientations(
    image: RawImage,
    onProgress?: (fraction: number) => void,
  ): Promise<TextLine[]> {
    const out: TextLine[] = [];
    for (const [index, pass] of this.passes.entries()) {
      const lines = await this.recognizeOnce(rotateImage(image, pass), (line, total) =>
        onProgress?.(passFraction(index, this.passes.length, line, total)),
      );
      for (const l of lines) {
        out.push({
          ...l,
          box: unrotateBox(l.box, pass, image.width, image.height),
          rotation: (((l.rotation ?? 0) + pass) % 360) as 0 | 90 | 180 | 270,
        });
      }
    }
    return out;
  }

  /** Un rilevamento sull'immagine data, poi la lettura di ogni riga nel verso migliore. */
  private async recognizeOnce(
    image: RawImage,
    onLine?: (line: number, lines: number) => void,
  ): Promise<TextLine[]> {
    const lines: TextLine[] = [];
    const found = await this.detect(image);
    for (const [i, { box, quad }] of found.entries()) {
      onLine?.(i, found.length);
      const straight = warpQuadStraight(image, quad);
      const turned = isTall(straight);
      const upright = turned ? rotateImage(straight, 90) : straight;
      const { reading, flipped } = await readBestOrientation(
        () => this.read(upright),
        () => this.read(rotateImage(upright, 180)),
        this.rereadBelow,
      );
      if (!reading.text || reading.confidence < TEXT_SCORE) continue;
      const base = turned ? 90 : 0;
      lines.push({
        text: reading.text,
        confidence: reading.confidence,
        box,
        rotation: ((base + (flipped ? 180 : 0)) % 360) as 0 | 90 | 180 | 270,
      });
    }
    onLine?.(found.length, found.length);
    return lines;
  }
}
