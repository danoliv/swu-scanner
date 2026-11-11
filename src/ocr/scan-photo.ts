// Scansione di una foto (SPEC §5): lettura a 4 rotazioni, carte ancorate al titolo, rilettura
// ingrandita 2,5x attorno al titolo delle carte "da scegliere" e secondo abbinamento.
import {
  detectCards,
  type CatalogEntry,
  type DetectedCard,
  type DetectOptions,
} from '../lib/detect-cards.ts';
import { zoomCrop } from '../lib/zoom.ts';
import type { OcrEngine, TextLine } from './engine.ts';
import { rotateImage, unrotateBox, type RawImage } from './image.ts';
import { isRawImage, rawPhotoSource, type PhotoSource } from './photo-source.ts';
import { doneProgress, readProgress, zoomProgress, type ScanProgress } from './progress.ts';
import { readPhoto } from './read-photo.ts';

export interface ScanOptions {
  catalog: readonly CatalogEntry[];
  detect?: DetectOptions;
  /** Lato lungo massimo dell'immagine di lavoro (px). */
  maxSide?: number;
  /** Ingrandimento dei ritagli rispetto all'immagine di lavoro. */
  zoomFactor?: number;
  /** Rilettura ingrandita attiva (default sì). */
  zoom?: boolean;
  /** Rotazioni lette (default tutte e 4). */
  rotations?: readonly (0 | 90 | 180 | 270)[];
  /** Numero massimo di ritagli riletti per foto. */
  maxCrops?: number;
  /** Avanzamento: frazione complessiva e, dopo la prima lettura, le carte trovate. */
  onProgress?: (progress: ScanProgress) => void;
}

export interface ScanResult {
  cards: DetectedCard[];
  /** Tutte le righe lette (foto intera e ritagli), nel riferimento dell'immagine di lavoro. */
  lines: TextLine[];
  /** Dimensioni dell'immagine di lavoro, il riferimento di tutti i riquadri. */
  size: { width: number; height: number };
  /** Carte "da scegliere" che la rilettura ha risolto. */
  refinedCards: number;
}

export async function scanPhoto(
  engine: OcrEngine,
  input: RawImage | PhotoSource,
  options: ScanOptions,
): Promise<ScanResult> {
  const photo = isRawImage(input) ? rawPhotoSource(input) : input;
  const { catalog, detect, maxSide = 1920, zoomFactor = 2.5, zoom = true, maxCrops = 80 } = options;
  const work = await photo.work(maxSide);
  const size = { width: work.width, height: work.height };

  options.onProgress?.(readProgress(0));
  const lines: TextLine[] = await readPhoto(engine, work, options.rotations, (f) =>
    options.onProgress?.(readProgress(f)),
  );
  let cards = detectCards(lines, catalog, detect);

  let refinedCards = 0;
  if (zoom) {
    const pending = cards.filter((c) => c.status === 'choose').slice(0, maxCrops);
    const scale = photo.width / work.width;
    const extra: TextLine[] = [];
    if (pending.length > 0) options.onProgress?.(zoomProgress(0, pending.length, cards.length));
    for (const [i, card] of pending.entries()) {
      options.onProgress?.(zoomProgress(i, pending.length, cards.length));
      const crop = zoomCrop(card.titleBox, card.rotation, size);
      // Dalla foto a piena risoluzione, ingrandita di `zoomFactor` rispetto all'immagine di lavoro.
      if (crop.width < 1 || crop.height < 1) continue;
      const zw = Math.max(1, Math.round(crop.width * zoomFactor));
      const zh = Math.max(1, Math.round(crop.height * zoomFactor));
      const zoomed = await photo.crop(
        {
          x: crop.x * scale,
          y: crop.y * scale,
          width: crop.width * scale,
          height: crop.height * scale,
        },
        zw,
        zh,
      );
      const read = await engine.recognize(rotateImage(zoomed, card.rotation));
      for (const l of read) {
        const b = unrotateBox(l.box, card.rotation, zw, zh);
        extra.push({
          ...l,
          rotation: card.rotation,
          box: {
            x: crop.x + b.x / zoomFactor,
            y: crop.y + b.y / zoomFactor,
            width: b.width / zoomFactor,
            height: b.height / zoomFactor,
          },
        });
      }
    }
    if (extra.length > 0) {
      lines.push(...extra);
      const before = cards.filter((c) => c.status === 'choose').length;
      cards = detectCards(lines, catalog, detect);
      refinedCards = Math.max(0, before - cards.filter((c) => c.status === 'choose').length);
    }
  }

  options.onProgress?.(doneProgress(cards.length));
  return { cards, lines, size, refinedCards };
}
