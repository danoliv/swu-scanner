// Interfaccia del motore di lettura: oggi PP-OCRv6 in WASM, domani eventualmente
// un plugin nativo (Capacitor) con modelli più grandi. Il resto del sito dipende solo da qui.
import type { RawImage } from './image.ts';

export interface TextLine {
  text: string;
  /** Riquadro in pixel della foto di partenza. */
  box: { x: number; y: number; width: number; height: number };
  /** Fiducia tra 0 e 1. */
  confidence: number;
  /** Rotazione (gradi, in senso antiorario) con cui la riga è stata letta: 0 se la carta è dritta. */
  rotation?: 0 | 90 | 180 | 270;
}

/** Legge le righe di testo di un'immagine dritta (una sola orientazione). */
export interface OcrEngine {
  readonly id: 'light' | 'precise' | (string & {});
  load(onProgress?: (fraction: number) => void): Promise<void>;
  recognize(image: RawImage): Promise<TextLine[]>;
  /**
   * Legge le righe in qualsiasi orientamento con un solo rilevamento (più veloce delle 4 rotazioni
   * complete di `readPhoto`). Le coordinate sono quelle dell'immagine, `rotation` dice il verso di lettura.
   */
  recognizeAllOrientations?(image: RawImage): Promise<TextLine[]>;
  dispose(): void;
}
