// Post-processo del rilevatore di testo DB (PP-OCRv6 det), come in RapidOCR: rettangolo ruotato di
// area minima per ogni regione: binarizzazione, dilatazione 2×2, componenti connesse,
// punteggio medio, filtro, allargamento (unclip). Le coordinate sono quelle della mappa.

export interface ProbMap {
  /** Probabilità per pixel, `width × height`, per righe. */
  data: Float32Array;
  width: number;
  height: number;
}

import { minAreaRect, type Point } from './hull.ts';

export interface DetBox {
  /** Rettangolo allineato agli assi che contiene il quadrilatero. */
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  /** Rettangolo ruotato, allargato: alto-sinistra, alto-destra, basso-destra, basso-sinistra. */
  quad: [Point, Point, Point, Point];
}

export interface DbOptions {
  /** Soglia di binarizzazione della mappa. */
  thresh?: number;
  /** Probabilità media minima di una regione. */
  boxThresh?: number;
  /** Allargamento: distanza = area × ratio / perimetro. */
  unclipRatio?: number;
  maxCandidates?: number;
  /** Lato minimo (px della mappa) di una regione. */
  minSize?: number;
}

const DEFAULTS = { thresh: 0.3, boxThresh: 0.5, unclipRatio: 1.6, maxCandidates: 1000, minSize: 3 };

/** Versore da `a` a `b`. */
function unit(a: Point, b: Point): Point {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

export function dbPostprocess(map: ProbMap, options: DbOptions = {}): DetBox[] {
  const { thresh, boxThresh, unclipRatio, maxCandidates, minSize } = { ...DEFAULTS, ...options };
  const { data, width, height } = map;

  // Binarizzazione e dilatazione 2×2 (ogni pixel acceso accende anche quello a destra, sotto e in diagonale).
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = (data[i] ?? 0) > thresh ? 1 : 0;
  const dilated = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          if (x + dx < width && y + dy < height) dilated[(y + dy) * width + x + dx] = 1;
        }
      }
    }
  }

  // Componenti connesse (8 vicini).
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const boxes: DetBox[] = [];
  for (let start = 0; start < dilated.length && boxes.length < maxCandidates; start++) {
    if (!dilated[start] || seen[start]) continue;
    const outline: Point[] = [];
    let sum = 0;
    let count = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % width;
      const y = (p - x) / width;
      let onEdge = false;
      if (mask[p]) {
        sum += data[p] ?? 0;
        count++;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            onEdge = true;
            continue;
          }
          const n = ny * width + nx;
          if (!dilated[n]) onEdge = true;
          if (dilated[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      if (onEdge) outline.push([x, y]);
    }
    // Come il contorno di OpenCV: le misure sono tra i centri dei pixel (span), non il numero di pixel.
    const rect = minAreaRect(outline);
    const w = rect.width;
    const h = rect.height;
    if (Math.min(w, h) < minSize || count === 0) continue;
    const score = sum / count;
    if (score < boxThresh) continue;

    // Allargamento (unclip): ogni lato si sposta verso l'esterno di area × ratio / perimetro.
    const d = (w * h * unclipRatio) / (2 * (w + h));
    const [tl, tr, , bl] = rect.corners;
    const ax = unit(tl, tr);
    const ay = unit(tl, bl);
    const clamp = (p: Point): Point => [
      Math.min(width, Math.max(0, p[0])),
      Math.min(height, Math.max(0, p[1])),
    ];
    const quad: [Point, Point, Point, Point] = [
      clamp([
        rect.corners[0][0] - d * ax[0] - d * ay[0],
        rect.corners[0][1] - d * ax[1] - d * ay[1],
      ]),
      clamp([
        rect.corners[1][0] + d * ax[0] - d * ay[0],
        rect.corners[1][1] + d * ax[1] - d * ay[1],
      ]),
      clamp([
        rect.corners[2][0] + d * ax[0] + d * ay[0],
        rect.corners[2][1] + d * ax[1] + d * ay[1],
      ]),
      clamp([
        rect.corners[3][0] - d * ax[0] + d * ay[0],
        rect.corners[3][1] - d * ax[1] + d * ay[1],
      ]),
    ];
    const xs = quad.map((p) => p[0]);
    const ys = quad.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    boxes.push({
      x: x0,
      y: y0,
      width: Math.max(...xs) - x0,
      height: Math.max(...ys) - y0,
      score,
      quad,
    });
  }

  // Ordine di lettura: dall'alto in basso, poi da sinistra a destra (righe vicine = stessa riga).
  boxes.sort((a, b) => (Math.abs(a.y - b.y) < 10 ? a.x - b.x : a.y - b.y));
  return boxes;
}
