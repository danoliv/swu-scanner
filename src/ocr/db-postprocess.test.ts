import { describe, expect, it } from 'vitest';
import { dbPostprocess, type ProbMap } from './db-postprocess.ts';

/** Mappa vuota con rettangoli di probabilità data. */
function map(
  width: number,
  height: number,
  rects: { x: number; y: number; w: number; h: number; p: number }[],
): ProbMap {
  const data = new Float32Array(width * height);
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) data[y * width + x] = r.p;
  }
  return { data, width, height };
}

describe('dbPostprocess', () => {
  it('trova un rettangolo di testo e lo allarga (unclip)', () => {
    const boxes = dbPostprocess(map(100, 60, [{ x: 20, y: 20, w: 40, h: 10, p: 0.9 }]));
    expect(boxes).toHaveLength(1);
    const b = boxes[0]!;
    // area 400, perimetro 100 -> distanza 400*1.6/100 = 6,4 per lato
    expect(b.x).toBeCloseTo(20 - 6.4, 0);
    expect(b.y).toBeCloseTo(20 - 6.4, 0);
    expect(b.width).toBeCloseTo(40 + 12.8, 0);
    expect(b.height).toBeCloseTo(10 + 12.8, 0);
    expect(b.score).toBeCloseTo(0.9, 3);
  });

  it('separa due righe distanti', () => {
    const boxes = dbPostprocess(
      map(200, 80, [
        { x: 10, y: 10, w: 50, h: 10, p: 0.9 },
        { x: 10, y: 50, w: 50, h: 10, p: 0.9 },
      ]),
    );
    expect(boxes).toHaveLength(2);
  });

  it("ordina i riquadri dall'alto in basso, poi da sinistra a destra", () => {
    const boxes = dbPostprocess(
      map(300, 100, [
        { x: 200, y: 10, w: 40, h: 10, p: 0.9 },
        { x: 10, y: 60, w: 40, h: 10, p: 0.9 },
        { x: 10, y: 10, w: 40, h: 10, p: 0.9 },
      ]),
    );
    expect(boxes.map((b) => [Math.round(b.x / 100), Math.round(b.y / 50)])).toEqual([
      [0, 0],
      [2, 0],
      [0, 1],
    ]);
  });

  it('scarta le regioni con probabilità media sotto la soglia del riquadro', () => {
    const boxes = dbPostprocess(map(100, 60, [{ x: 20, y: 20, w: 40, h: 10, p: 0.4 }]));
    expect(boxes).toEqual([]);
  });

  it('ignora i pixel sotto la soglia di binarizzazione', () => {
    expect(dbPostprocess(map(100, 60, [{ x: 20, y: 20, w: 40, h: 10, p: 0.2 }]))).toEqual([]);
  });

  it('scarta le regioni troppo piccole', () => {
    expect(dbPostprocess(map(100, 60, [{ x: 20, y: 20, w: 2, h: 2, p: 0.9 }]))).toEqual([]);
  });

  it('non esce dai bordi della mappa', () => {
    const boxes = dbPostprocess(map(100, 60, [{ x: 0, y: 0, w: 40, h: 10, p: 0.9 }]));
    expect(boxes[0]!.x).toBeGreaterThanOrEqual(0);
    expect(boxes[0]!.y).toBeGreaterThanOrEqual(0);
  });

  it('restituisce una lista vuota per una mappa vuota', () => {
    expect(dbPostprocess(map(50, 50, []))).toEqual([]);
  });

  it('rispetta il numero massimo di candidati', () => {
    const rects = Array.from({ length: 5 }, (_, i) => ({
      x: 10,
      y: 10 + i * 20,
      w: 40,
      h: 8,
      p: 0.9,
    }));
    expect(dbPostprocess(map(100, 120, rects), { maxCandidates: 3 })).toHaveLength(3);
  });

  it('unisce regioni a contatto in diagonale (8 vicini)', () => {
    const boxes = dbPostprocess(
      map(100, 60, [
        { x: 10, y: 10, w: 20, h: 8, p: 0.9 },
        { x: 30, y: 18, w: 20, h: 8, p: 0.9 },
      ]),
    );
    expect(boxes).toHaveLength(1);
  });

  it('per una riga inclinata dà un quadrilatero ruotato più stretto del rettangolo allineato agli assi', () => {
    const width = 200;
    const height = 200;
    const data = new Float32Array(width * height);
    const a = (30 * Math.PI) / 180;
    // barra lunga 80 e spessa 8, ruotata di 30°, centrata in (100,100)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - 100;
        const dy = y - 100;
        const u = dx * Math.cos(a) + dy * Math.sin(a);
        const v = -dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(u) <= 40 && Math.abs(v) <= 4) data[y * width + x] = 0.9;
      }
    }
    const [b] = dbPostprocess({ data, width, height });
    const [tl, tr, , bl] = b!.quad;
    const long = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
    const short = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
    // allargata di d = area*1,6/perimetro su ogni lato (lati ~80 e ~8 -> d ~ 5)
    expect(long).toBeGreaterThan(85);
    expect(long).toBeLessThan(100);
    expect(short).toBeGreaterThan(14);
    expect(short).toBeLessThan(24);
    // il rettangolo allineato agli assi è molto più alto della riga
    expect(b!.height).toBeGreaterThan(short * 2);
  });

  it('il quadrilatero di un rettangolo dritto coincide con il suo riquadro', () => {
    const [b] = dbPostprocess(map(100, 60, [{ x: 20, y: 20, w: 40, h: 10, p: 0.9 }]));
    const [tl, tr, br, bl] = b!.quad;
    expect(tl[0]).toBeCloseTo(b!.x, 3);
    expect(tl[1]).toBeCloseTo(b!.y, 3);
    expect(br[0]).toBeCloseTo(b!.x + b!.width, 3);
    expect(br[1]).toBeCloseTo(b!.y + b!.height, 3);
    expect(tr[1]).toBeCloseTo(tl[1], 3);
    expect(bl[0]).toBeCloseTo(tl[0], 3);
  });
});
