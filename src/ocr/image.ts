// Operazioni sulle immagini per il pre-processo di PP-OCRv6, senza canvas né OpenCV:
// ridimensionamento bilineare, ritaglio, rotazione di 90°, conversione in tensore.

export interface RawImage {
  /** RGBA, 4 byte per pixel, per righe. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Come `round` di Python: le metà vanno verso il pari. */
function roundHalfEven(v: number): number {
  const f = Math.floor(v);
  const diff = v - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/**
 * Dimensione di ingresso del rilevatore (RapidOCR, `limit_type: min`, 736): prima il lato lungo si
 * limita a 2000 (e quello corto si porta ad almeno 30), poi se il lato corto è sotto 736 lo si porta
 * a 736; infine i due lati si arrotondano a multipli di 32.
 */
export function detSize(width: number, height: number): { width: number; height: number } {
  let w = width;
  let h = height;
  const longSide = Math.max(w, h);
  if (longSide > 2000) {
    const r = 2000 / longSide;
    w = Math.trunc(w * r);
    h = Math.trunc(h * r);
  }
  const shortSide = Math.min(w, h);
  if (shortSide < 30) {
    const r = 30 / shortSide;
    w = Math.trunc(w * r);
    h = Math.trunc(h * r);
  }
  const ratio = Math.min(w, h) < 736 ? 736 / Math.min(w, h) : 1;
  const snap = (v: number): number => Math.max(32, roundHalfEven(Math.trunc(v * ratio) / 32) * 32);
  return { width: snap(w), height: snap(h) };
}

/** Larghezza del tensore del lettore per una riga di dato rapporto (altezza fissa 48, minimo 320). */
export function recWidth(lineWidth: number, lineHeight: number, height = 48): number {
  const maxRatio = Math.max(320 / 48, lineWidth / lineHeight);
  return Math.trunc(height * maxRatio);
}

/** Ridimensionamento bilineare con i centri dei pixel allineati (come `cv2.resize`). */
export function resizeImage(img: RawImage, width: number, height: number): RawImage {
  if (width === img.width && height === img.height) return img;
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), img.height - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, img.height - 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), img.width - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, img.width - 1);
      const wx = fx - x0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = img.data[(y0 * img.width + x0) * 4 + c] ?? 0;
        const p01 = img.data[(y0 * img.width + x1) * 4 + c] ?? 0;
        const p10 = img.data[(y1 * img.width + x0) * 4 + c] ?? 0;
        const p11 = img.data[(y1 * img.width + x1) * 4 + c] ?? 0;
        const top = p00 + (p01 - p00) * wx;
        const bottom = p10 + (p11 - p10) * wx;
        out[o + c] = top + (bottom - top) * wy;
      }
    }
  }
  return { data: out, width, height };
}

/** Ritaglio; il rettangolo si allarga ai pixel interi e si taglia ai bordi. */
export function cropImage(img: RawImage, rect: Rect): RawImage {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.height));
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * img.width + x0) * 4;
    data.set(img.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { data, width, height };
}

/** Rotazione in senso antiorario di 0°, 90°, 180° o 270° (come `PIL.Image.rotate(..., expand=True)`). */
export function rotateImage(img: RawImage, degrees: 0 | 90 | 180 | 270): RawImage {
  if (degrees === 0) return img;
  const { width: w, height: h } = img;
  const swap = degrees !== 180;
  const width = swap ? h : w;
  const height = swap ? w : h;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [nx, ny] =
        degrees === 90 ? [y, w - 1 - x] : degrees === 180 ? [w - 1 - x, h - 1 - y] : [h - 1 - y, x];
      const from = (y * w + x) * 4;
      const to = (ny * width + nx) * 4;
      data[to] = img.data[from] ?? 0;
      data[to + 1] = img.data[from + 1] ?? 0;
      data[to + 2] = img.data[from + 2] ?? 0;
      data[to + 3] = img.data[from + 3] ?? 255;
    }
  }
  return { data, width, height };
}

export interface TensorOptions {
  /** Piani in ordine B, G, R (come OpenCV, usato da PaddleOCR) invece di R, G, B. */
  bgr: boolean;
  mean: number;
  std: number;
  /** Se data, allarga a destra con zeri (dopo la normalizzazione) fino a questa larghezza. */
  padToWidth?: number;
}

/** Tensore NCHW (senza la dimensione del batch): `(v/255 - mean) / std` per piano. */
export function toTensor(img: RawImage, opts: TensorOptions): Float32Array {
  const width = Math.max(opts.padToWidth ?? img.width, img.width);
  const plane = width * img.height;
  const out = new Float32Array(3 * plane);
  const order = opts.bgr ? [2, 1, 0] : [0, 1, 2];
  for (let c = 0; c < 3; c++) {
    const channel = order[c] as number;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const v = img.data[(y * img.width + x) * 4 + channel] ?? 0;
        out[c * plane + y * width + x] = (v / 255 - opts.mean) / opts.std;
      }
    }
  }
  return out;
}

/**
 * Riporta un riquadro letto sull'immagine ruotata (di `degrees` in senso antiorario) alle
 * coordinate dell'immagine di partenza, di dimensioni `width × height`.
 */
export function unrotateBox(
  box: Rect,
  degrees: 0 | 90 | 180 | 270,
  width: number,
  height: number,
): Rect {
  switch (degrees) {
    case 90:
      // (x, y) -> (y, width - x) nella rotata: l'inverso è (x', y') -> (width - y', x')
      return { x: width - (box.y + box.height), y: box.x, width: box.height, height: box.width };
    case 180:
      return {
        x: width - (box.x + box.width),
        y: height - (box.y + box.height),
        width: box.width,
        height: box.height,
      };
    case 270:
      // (x, y) -> (height - y, x) nella rotata: l'inverso è (x', y') -> (y', height - x')
      return { x: box.y, y: height - (box.x + box.width), width: box.height, height: box.width };
    default:
      return box;
  }
}

export type Quad = [[number, number], [number, number], [number, number], [number, number]];

/**
 * Raddrizza il rettangolo ruotato `quad` (alto-sinistra, alto-destra, basso-destra, basso-sinistra) in
 * un'immagine dritta, come `get_rotate_crop_image` di RapidOCR; se è molto più alto che largo
 * (testo verticale) lo ruota di 90°. Fuori dall'immagine vale il pixel di bordo.
 */
export function warpQuad(img: RawImage, quad: Quad): RawImage {
  const warped = warpQuadStraight(img, quad);
  return isTall(warped) ? rotateImage(warped, 90) : warped;
}

/** Vero se il ritaglio è molto più alto che largo (testo verticale). */
export function isTall(img: { width: number; height: number }): boolean {
  return img.height / img.width >= 1.5;
}

/** Come `warpQuad`, ma senza ruotare i ritagli verticali. */
export function warpQuadStraight(img: RawImage, quad: Quad): RawImage {
  const [tl, tr, br, bl] = quad;
  const width = Math.max(
    1,
    Math.trunc(
      Math.max(Math.hypot(tl[0] - tr[0], tl[1] - tr[1]), Math.hypot(bl[0] - br[0], bl[1] - br[1])),
    ),
  );
  const height = Math.max(
    1,
    Math.trunc(
      Math.max(Math.hypot(tl[0] - bl[0], tl[1] - bl[1]), Math.hypot(tr[0] - br[0], tr[1] - br[1])),
    ),
  );
  const out = new Uint8ClampedArray(width * height * 4);
  const clampX = (v: number): number => Math.min(Math.max(v, 0), img.width - 1);
  const clampY = (v: number): number => Math.min(Math.max(v, 0), img.height - 1);
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const fx = tl[0] + ((tr[0] - tl[0]) * u) / width + ((bl[0] - tl[0]) * v) / height;
      const fy = tl[1] + ((tr[1] - tl[1]) * u) / width + ((bl[1] - tl[1]) * v) / height;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const wx = fx - x0;
      const wy = fy - y0;
      const xa = clampX(x0);
      const xb = clampX(x0 + 1);
      const ya = clampY(y0);
      const yb = clampY(y0 + 1);
      const o = (v * width + u) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = img.data[(ya * img.width + xa) * 4 + c] ?? 0;
        const p01 = img.data[(ya * img.width + xb) * 4 + c] ?? 0;
        const p10 = img.data[(yb * img.width + xa) * 4 + c] ?? 0;
        const p11 = img.data[(yb * img.width + xb) * 4 + c] ?? 0;
        const top = p00 + (p01 - p00) * wx;
        const bottom = p10 + (p11 - p10) * wx;
        out[o + c] = top + (bottom - top) * wy;
      }
    }
  }
  return { data: out, width, height };
}
