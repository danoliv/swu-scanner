// Decodifica CTC dell'uscita del modello di lettura PP-OCRv6 (come in RapidOCR):
// classi = ["blank", ...caratteri del modello, " "]; massimo per passo, via i ripetuti
// consecutivi e il blank; fiducia = media delle probabilità dei passi scelti.

/** Dizionario completo a partire dai caratteri contenuti nel modello. */
export function buildCharset(modelCharacters: readonly string[]): string[] {
  return ['blank', ...modelCharacters, ' '];
}

export interface Decoded {
  text: string;
  confidence: number;
}

/**
 * @param probs  uscita del modello, `steps × classes`, già in probabilità (softmax)
 * @param steps  numero di passi (colonne della riga di testo)
 * @param classes numero di classi, uguale a `charset.length`
 */
export function ctcDecode(
  probs: Float32Array,
  steps: number,
  classes: number,
  charset: readonly string[],
): Decoded {
  if (probs.length !== steps * classes) {
    throw new Error(`Wrong tensor dimension: ${probs.length} values for ${steps}×${classes}`);
  }
  let text = '';
  let sum = 0;
  let count = 0;
  let previous = -1;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestP = -Infinity;
    const base = t * classes;
    for (let c = 0; c < classes; c++) {
      const p = probs[base + c] ?? 0;
      if (p > bestP) {
        bestP = p;
        best = c;
      }
    }
    if (best !== previous && best !== 0) {
      text += charset[best] ?? '';
      sum += bestP;
      count++;
    }
    previous = best;
  }
  return { text, confidence: count === 0 ? 0 : sum / count };
}
