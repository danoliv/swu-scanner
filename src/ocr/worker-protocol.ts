// Messaggi tra l'interfaccia e il Web Worker che esegue il motore di lettura.
import type { DetectedCard } from '../lib/detect-cards.ts';
import type { CompactTitle } from '../lib/titles.ts';
import type { ScanProgress } from './progress.ts';

export type WorkerRequest =
  | {
      type: 'init';
      modelId: string;
      det: ArrayBuffer;
      rec: ArrayBuffer;
      titles: CompactTitle[];
      /** Titolo e sottotitolo delle Carte del Catalogo, nello stesso ordine di `titles`. */
      cards: { name: string; subtitle: string | null }[];
    }
  | { type: 'scan'; id: number; bitmap: ImageBitmap };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'error'; id?: number; message: string }
  | { type: 'progress'; id: number; progress: ScanProgress }
  | { type: 'result'; id: number; cards: DetectedCard[] };
