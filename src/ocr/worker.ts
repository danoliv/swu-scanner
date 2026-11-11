// Web Worker: carica il motore PP-OCRv6 e scansiona le foto fuori dal thread dell'interfaccia.
import type { CatalogEntry } from '../lib/detect-cards.ts';
import { expandTitles } from '../lib/titles.ts';
import { bitmapPhotoSource } from './bitmap-photo.ts';
import { PpocrEngine } from './ppocr-engine.ts';
import { scanPhoto } from './scan-photo.ts';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.ts';

let engine: PpocrEngine | null = null;
let catalog: CatalogEntry[] = [];

// Titoli che sono anche parole dei tratti o dei tipi: non fanno da ancora (SPEC §5).
const IGNORE_TITLES = new Set(['mandalorian', 'official', 'republic', 'imperial', 'rebel']);

const post = (m: WorkerResponse): void => (self as unknown as Worker).postMessage(m);

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      engine?.dispose();
      catalog = expandTitles(msg.titles, msg.cards);
      engine = new PpocrEngine(msg.modelId, {
        det: new Uint8Array(msg.det),
        rec: new Uint8Array(msg.rec),
      });
      await engine.load();
      post({ type: 'ready' });
      return;
    }
    if (!engine) throw new Error('Motore non caricato');
    const photo = bitmapPhotoSource(msg.bitmap);
    const result = await scanPhoto(engine, photo, {
      catalog,
      detect: { ignoreTitles: IGNORE_TITLES },
      onProgress: (progress) => post({ type: 'progress', id: msg.id, progress }),
    });
    msg.bitmap.close();
    post({ type: 'result', id: msg.id, cards: result.cards });
  } catch (e) {
    post({
      type: 'error',
      ...(msg.type === 'scan' ? { id: msg.id } : {}),
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
