// Lo scanner dell'interfaccia: parla con il Web Worker che esegue il motore di lettura.
import type { CompactTitle } from '../lib/titles.ts';
import type { ScanProgress } from '../ocr/progress.ts';
import type { WorkerRequest, WorkerResponse } from '../ocr/worker-protocol.ts';
import type { Scanner } from './app.ts';

export interface EngineHost {
  /** Carica il modello nel worker (sostituisce quello in uso solo a caricamento finito). */
  activate(modelId: string, model: { det: Uint8Array; rec: Uint8Array }): Promise<void>;
  scanner: Scanner;
  readonly ready: boolean;
}

export function createEngineHost(opts: {
  worker: Worker;
  titles: CompactTitle[];
  cards: { name: string; subtitle: string | null }[];
}): EngineHost {
  const { worker } = opts;
  let nextId = 0;
  let isReady = false;
  let onReady: { resolve: () => void; reject: (e: Error) => void } | null = null;
  const pending = new Map<
    number,
    {
      resolve: (v: Awaited<ReturnType<Scanner['scan']>>) => void;
      reject: (e: Error) => void;
      onProgress: (p: ScanProgress) => void;
    }
  >();

  worker.onmessage = (e: MessageEvent<WorkerResponse>): void => {
    const m = e.data;
    if (m.type === 'ready') {
      isReady = true;
      onReady?.resolve();
      onReady = null;
    } else if (m.type === 'progress') {
      pending.get(m.id)?.onProgress(m.progress);
    } else if (m.type === 'result') {
      pending.get(m.id)?.resolve(m.cards);
      pending.delete(m.id);
    } else if (m.id !== undefined) {
      pending.get(m.id)?.reject(new Error(m.message));
      pending.delete(m.id);
    } else {
      onReady?.reject(new Error(m.message));
      onReady = null;
    }
  };

  const send = (msg: WorkerRequest, transfer: Transferable[] = []): void =>
    worker.postMessage(msg, transfer);

  return {
    get ready() {
      return isReady;
    },
    activate(modelId, model) {
      return new Promise<void>((resolve, reject) => {
        onReady = { resolve, reject };
        // Si copiano i byte: possono servire ancora alla cache.
        const det = model.det.slice().buffer as ArrayBuffer;
        const rec = model.rec.slice().buffer as ArrayBuffer;
        send(
          {
            type: 'init',
            modelId,
            det,
            rec,
            titles: opts.titles,
            cards: opts.cards,
          },
          [det, rec],
        );
      });
    },
    scanner: {
      async scan(file, onProgress) {
        if (!isReady) throw new Error('Motore non pronto');
        const bitmap = await createImageBitmap(file);
        const id = ++nextId;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject, onProgress });
          send({ type: 'scan', id, bitmap }, [bitmap]);
        });
      },
    },
  };
}
