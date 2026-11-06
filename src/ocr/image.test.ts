import { describe, expect, it } from 'vitest';
import {
  cropImage,
  detSize,
  recWidth,
  resizeImage,
  rotateImage,
  toTensor,
  warpQuad,
  type RawImage,
} from './image.ts';

/** Immagine RGBA con un valore diverso per pixel: R = x, G = y, B = 7, A = 255. */
function gradient(width: number, height: number): RawImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = 7;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}
const px = (img: RawImage, x: number, y: number): number[] => {
  const i = (y * img.width + x) * 4;
  return [img.data[i] ?? -1, img.data[i + 1] ?? -1, img.data[i + 2] ?? -1];
};

describe('detSize', () => {
  it('non ridimensiona se il lato corto è già almeno 736, ma arrotonda a multipli di 32', () => {
    expect(detSize(1920, 1080)).toEqual({ width: 1920, height: 1088 });
    expect(detSize(1600, 900)).toEqual({ width: 1600, height: 896 });
  });
  it('porta il lato corto a 736 se è più piccolo', () => {
    expect(detSize(640, 480)).toEqual({ width: 992, height: 736 });
  });
  it('limita il lato lungo a 2000 prima di arrotondare', () => {
    expect(detSize(4000, 3000)).toEqual({ width: 1984, height: 1504 });
  });
  it('arrotonda come Python (metà verso il pari)', () => {
    // 2000 / 32 = 62,5 -> 62 (pari), non 63
    expect(detSize(2000, 1000).width).toBe(1984);
  });
  it("porta un'immagine minuscola a 736", () => {
    expect(detSize(10, 10)).toEqual({ width: 736, height: 736 });
  });
});

describe('recWidth', () => {
  it('ha larghezza minima 320 (rapporto 6,67 a altezza 48)', () => {
    expect(recWidth(100, 48)).toBe(320);
  });
  it('cresce con il rapporto larghezza/altezza della riga', () => {
    expect(recWidth(960, 48)).toBe(960);
  });
});

describe('resizeImage', () => {
  it('mantiene i pixel se la dimensione non cambia', () => {
    const img = gradient(4, 3);
    expect(resizeImage(img, 4, 3)).toEqual(img);
  });
  it('interpola in modo bilineare ai centri dei pixel', () => {
    const img = gradient(2, 1); // R = 0 e 1
    const big = resizeImage(img, 4, 1);
    expect(big.width).toBe(4);
    const reds = [0, 1, 2, 3].map((x) => px(big, x, 0)[0]);
    expect(reds[0]).toBe(0);
    expect(reds[3]).toBe(1);
    expect(reds[1]).toBeGreaterThanOrEqual(0);
    expect(reds[2]).toBeLessThanOrEqual(1);
  });
  it("riduce un'immagine", () => {
    const small = resizeImage(gradient(8, 8), 4, 4);
    expect(small.width).toBe(4);
    expect(small.height).toBe(4);
    expect(small.data.length).toBe(4 * 4 * 4);
  });
});

describe('cropImage', () => {
  it('ritaglia un rettangolo', () => {
    const c = cropImage(gradient(10, 10), { x: 2, y: 3, width: 4, height: 2 });
    expect(c.width).toBe(4);
    expect(c.height).toBe(2);
    expect(px(c, 0, 0)).toEqual([2, 3, 7]);
    expect(px(c, 3, 1)).toEqual([5, 4, 7]);
  });
  it("taglia il rettangolo ai bordi dell'immagine", () => {
    const c = cropImage(gradient(10, 10), { x: 8, y: 8, width: 5, height: 5 });
    expect(c.width).toBe(2);
    expect(c.height).toBe(2);
  });
  it('arrotonda le coordinate frazionarie', () => {
    const c = cropImage(gradient(10, 10), { x: 1.4, y: 1.6, width: 3.2, height: 2.2 });
    expect(c.width).toBeGreaterThanOrEqual(3);
    expect(px(c, 0, 0)[0]).toBe(1);
  });
  it("restituisce un'immagine vuota se il ritaglio è fuori", () => {
    const c = cropImage(gradient(10, 10), { x: 20, y: 20, width: 5, height: 5 });
    expect(c.width * c.height).toBe(0);
  });
});

describe('rotateImage', () => {
  it('ruota di 90° in senso antiorario (come PIL)', () => {
    const r = rotateImage(gradient(3, 2), 90); // 3x2 -> 2x3
    expect(r.width).toBe(2);
    expect(r.height).toBe(3);
    // il pixel in alto a destra (x=2,y=0) finisce in alto a sinistra
    expect(px(r, 0, 0)).toEqual([2, 0, 7]);
    // il pixel in basso a sinistra (x=0,y=1) finisce in basso a destra
    expect(px(r, 1, 2)).toEqual([0, 1, 7]);
  });
  it('ruota di 180°', () => {
    const r = rotateImage(gradient(3, 2), 180);
    expect(px(r, 0, 0)).toEqual([2, 1, 7]);
  });
  it('ruota di 270°', () => {
    const r = rotateImage(gradient(3, 2), 270);
    expect(r.width).toBe(2);
    expect(r.height).toBe(3);
    expect(px(r, 0, 0)).toEqual([0, 1, 7]);
  });
  it('con 0° restituisce la stessa immagine', () => {
    const img = gradient(3, 2);
    expect(rotateImage(img, 0)).toBe(img);
  });
});

describe('toTensor', () => {
  const img: RawImage = {
    data: Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255]),
    width: 2,
    height: 1,
  };
  it('normalizza (v/255 - media)/dev e ordina i piani come BGR', () => {
    const t = toTensor(img, { bgr: true, mean: 0.5, std: 0.5 });
    // piani: B, G, R; pixel 0 rosso puro, pixel 1 verde puro
    expect(Array.from(t)).toEqual([-1, -1, /*G*/ -1, 1, /*R*/ 1, -1]);
  });
  it('con ordine RGB mette R per primo', () => {
    const t = toTensor(img, { bgr: false, mean: 0.5, std: 0.5 });
    expect(Array.from(t)).toEqual([1, -1, -1, 1, -1, -1]);
  });
  it('allarga a destra con zeri fino alla larghezza richiesta', () => {
    const t = toTensor(img, { bgr: true, mean: 0.5, std: 0.5, padToWidth: 4 });
    expect(t.length).toBe(3 * 1 * 4);
    expect(Array.from(t.slice(2, 4))).toEqual([0, 0]);
  });
});

describe('unrotateBox', () => {
  it("riporta un riquadro letto sull'immagine ruotata alla foto originale", async () => {
    const { unrotateBox } = await import('./image.ts');
    const w = 100;
    const h = 60;
    // Un riquadro nella foto originale, ruotato di 90° e riportato indietro, deve tornare uguale.
    const original = { x: 10, y: 20, width: 30, height: 8 };
    const img = rotateImage(gradient(w, h), 90);
    // dopo la rotazione di 90° antioraria: (x, y) -> (y, w-1-x) ; il riquadro occupa x'=20..28, y'=100-1-40..100-1-10
    const rotated = {
      x: 20,
      y: w - (original.x + original.width),
      width: original.height,
      height: original.width,
    };
    expect(img.width).toBe(h);
    expect(unrotateBox(rotated, 90, w, h)).toEqual(original);
  });
  it("è l'identità con 0° e per 180° ribalta il riquadro", async () => {
    const { unrotateBox } = await import('./image.ts');
    const b = { x: 10, y: 20, width: 30, height: 8 };
    expect(unrotateBox(b, 0, 100, 60)).toEqual(b);
    expect(unrotateBox(b, 180, 100, 60)).toEqual({ x: 60, y: 32, width: 30, height: 8 });
  });
  it('gestisce 270°', async () => {
    const { unrotateBox } = await import('./image.ts');
    const w = 100;
    const h = 60;
    const original = { x: 10, y: 20, width: 30, height: 8 };
    // (x, y) -> (h-1-y, x) per 270° antioraria: il riquadro occupa x'=h-(y+hh)..h-y, y'=x..x+w
    const rotated = {
      x: h - (original.y + original.height),
      y: original.x,
      width: original.height,
      height: original.width,
    };
    expect(unrotateBox(rotated, 270, w, h)).toEqual(original);
  });
});

describe('warpQuad', () => {
  it('per un quadrilatero dritto equivale al ritaglio', () => {
    const img = gradient(40, 40);
    const w = warpQuad(img, [
      [10, 10],
      [20, 10],
      [20, 14],
      [10, 14],
    ]);
    expect(w.width).toBe(10);
    expect(w.height).toBe(4);
    expect(px(w, 0, 0)).toEqual([10, 10, 7]);
    expect(px(w, 3, 2)).toEqual([13, 12, 7]);
  });

  it('raddrizza una striscia inclinata: lungo la riga il rosso cresce, in altezza no', () => {
    const img: RawImage = gradient(60, 60);
    // asse lungo la diagonale (1,1)/sqrt2, lunghezza ~28, spessore ~6
    const w = warpQuad(img, [
      [10, 10],
      [30, 30],
      [26, 34],
      [6, 14],
    ]);
    expect(w.width).toBeGreaterThan(w.height);
    const row = Array.from({ length: w.width }, (_, x) => px(w, x, 1)[0] as number);
    expect(row[row.length - 1]).toBeGreaterThan(row[0] as number);
  });

  it('ruota di 90° un ritaglio molto più alto che largo (testo verticale)', () => {
    const w = warpQuad(gradient(40, 40), [
      [10, 5],
      [14, 5],
      [14, 25],
      [10, 25],
    ]);
    expect(w.width).toBeGreaterThan(w.height);
  });

  it("non esce dall'immagine: usa il pixel di bordo", () => {
    const w = warpQuad(gradient(20, 20), [
      [-5, -5],
      [5, -5],
      [5, 3],
      [-5, 3],
    ]);
    expect(px(w, 0, 0)).toEqual([0, 0, 7]);
  });
});
