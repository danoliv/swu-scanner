// Avanzamento di una scansione, da mostrare all'utente: una frazione complessiva (0..1) e i numeri
// utili della fase in corso. Funzioni pure, senza DOM né motore.

export type ScanStage = 'read' | 'zoom' | 'done';

export interface ScanProgress {
  stage: ScanStage;
  /** Avanzamento complessivo, da 0 a 1; non scende mai. */
  fraction: number;
  /** Nella fase "ingrandita": carte riesaminate e da riesaminare. */
  done: number;
  total: number;
  /** Carte trovate dopo la prima lettura; null finché non si sa. */
  cards: number | null;
}

/** La lettura della foto pesa la maggior parte del tempo; il resto va alla rilettura ingrandita. */
export const READ_SHARE = 0.75;

export const START: ScanProgress = { stage: 'read', fraction: 0, done: 0, total: 0, cards: null };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

/**
 * Frazione della lettura con un rilevamento per passata: il rilevamento vale poco più di un decimo
 * della passata, il resto è la lettura delle righe.
 */
export function passFraction(pass: number, passes: number, line: number, lines: number): number {
  const DETECT = 0.15;
  const within = lines > 0 ? DETECT + (1 - DETECT) * (line / lines) : 1;
  return clamp01((pass + within) / Math.max(1, passes));
}

export const readProgress = (fraction: number): ScanProgress => ({
  stage: 'read',
  fraction: READ_SHARE * clamp01(fraction),
  done: 0,
  total: 0,
  cards: null,
});

export const zoomProgress = (done: number, total: number, cards: number): ScanProgress => ({
  stage: 'zoom',
  fraction: READ_SHARE + (1 - READ_SHARE) * (total > 0 ? clamp01(done / total) : 0),
  done,
  total,
  cards,
});

export const doneProgress = (cards: number): ScanProgress => ({
  stage: 'done',
  fraction: 1,
  done: 0,
  total: 0,
  cards,
});

/** Il nuovo avanzamento, senza mai tornare indietro e senza perdere il numero di carte già trovate. */
export function followProgress(prev: ScanProgress | null, next: ScanProgress): ScanProgress {
  return {
    ...next,
    fraction: Math.max(prev?.fraction ?? 0, next.fraction),
    cards: next.cards ?? prev?.cards ?? null,
  };
}
