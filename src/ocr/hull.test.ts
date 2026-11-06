import { describe, expect, it } from 'vitest';
import { convexHull, minAreaRect, type Point } from './hull.ts';

describe('convexHull', () => {
  it('tiene solo i vertici esterni', () => {
    const pts: Point[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2],
      [1, 3],
    ];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
    expect(hull.some((p) => p[0] === 2 && p[1] === 2)).toBe(false);
  });
  it('toglie i punti allineati sui lati', () => {
    expect(
      convexHull([
        [0, 0],
        [2, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
    ).toHaveLength(4);
  });
  it('gestisce pochi punti e duplicati', () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([[1, 1]])).toEqual([[1, 1]]);
    expect(
      convexHull([
        [1, 1],
        [1, 1],
      ]),
    ).toEqual([[1, 1]]);
    expect(
      convexHull([
        [0, 0],
        [3, 3],
      ]),
    ).toHaveLength(2);
  });
});

describe('minAreaRect', () => {
  it('per punti allineati agli assi dà il rettangolo che li contiene', () => {
    const r = minAreaRect([
      [0, 0],
      [10, 0],
      [10, 4],
      [0, 4],
    ]);
    expect(r.width * r.height).toBeCloseTo(40, 5);
    expect(Math.max(r.width, r.height)).toBeCloseTo(10, 5);
    expect(Math.min(r.width, r.height)).toBeCloseTo(4, 5);
    expect(r.center[0]).toBeCloseTo(5, 5);
    expect(r.center[1]).toBeCloseTo(2, 5);
  });

  it('per un rettangolo inclinato di 30° ne trova le vere dimensioni', () => {
    const a = (30 * Math.PI) / 180;
    const rot = ([x, y]: Point): Point => [
      x * Math.cos(a) - y * Math.sin(a),
      x * Math.sin(a) + y * Math.cos(a),
    ];
    const r = minAreaRect(
      [
        [0, 0],
        [20, 0],
        [20, 5],
        [0, 5],
      ].map((p) => rot(p as Point)),
    );
    expect(Math.max(r.width, r.height)).toBeCloseTo(20, 4);
    expect(Math.min(r.width, r.height)).toBeCloseTo(5, 4);
  });

  it('ha area minore del rettangolo allineato agli assi se il testo è inclinato', () => {
    const a = (20 * Math.PI) / 180;
    const rot = ([x, y]: Point): Point => [
      x * Math.cos(a) - y * Math.sin(a),
      x * Math.sin(a) + y * Math.cos(a),
    ];
    const pts = (
      [
        [0, 0],
        [30, 0],
        [30, 4],
        [0, 4],
      ] as Point[]
    ).map(rot);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const aabb = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    const r = minAreaRect(pts);
    expect(r.width * r.height).toBeLessThan(aabb);
  });

  it('restituisce i quattro angoli in ordine: alto-sinistra, alto-destra, basso-destra, basso-sinistra', () => {
    const r = minAreaRect([
      [0, 0],
      [10, 0],
      [10, 4],
      [0, 4],
    ]);
    expect(r.corners).toHaveLength(4);
    const [tl, tr, br, bl] = r.corners;
    expect(tl![0]).toBeLessThan(tr![0]);
    expect(tl![1]).toBeLessThanOrEqual(bl![1]);
    expect(br![0]).toBeGreaterThan(bl![0]);
  });

  it('gestisce un solo punto o punti allineati', () => {
    expect(minAreaRect([[3, 3]])).toMatchObject({ width: 0, height: 0 });
    const line = minAreaRect([
      [0, 0],
      [10, 0],
    ]);
    expect(Math.max(line.width, line.height)).toBeCloseTo(10, 5);
    expect(Math.min(line.width, line.height)).toBeCloseTo(0, 5);
  });
});
